/*
 * Memory, strings, errors, the line index, UTF-8 and the value model (docs/spec/data-model.md,
 * docs/spec/expressions.md).
 */
#include "pt.h"
#include "ext/json/php_json.h"
#include "Zend/zend_smart_str.h"
#include "Zend/zend_strtod.h"
#include <math.h>

/* ----------------------------------------------------------------------------------------------- */
/* Arena                                                                                            */
/* ----------------------------------------------------------------------------------------------- */

struct pt_chunk {
    pt_chunk *next;
    size_t used, size;
    char data[];
};

#define PT_CHUNK_SIZE 8192
#define PT_ALIGN(size) (((size) + 15) & ~(size_t)15)

void pt_arena_init(pt_arena *arena)
{
    arena->chunks = NULL;
    arena->keep = NULL;
    arena->keep_count = 0;
    arena->keep_capacity = 0;
}

void pt_arena_free(pt_arena *arena)
{
    /* The kept values are released first: a released object may not read the arena, but its
     * destructor runs PHP code, which must find every chunk still allocated when it calls back. */
    for (uint32_t i = 0; i < arena->keep_count; i++) {
        zval_ptr_dtor(&arena->keep[i]);
    }
    if (arena->keep) {
        efree(arena->keep);
    }
    pt_chunk *chunk = arena->chunks;
    while (chunk) {
        pt_chunk *next = chunk->next;
        efree(chunk);
        chunk = next;
    }
    pt_arena_init(arena);
}

void *pt_alloc(pt_arena *arena, size_t size)
{
    size = PT_ALIGN(size == 0 ? 1 : size);
    pt_chunk *chunk = arena->chunks;
    if (chunk == NULL || chunk->size - chunk->used < size) {
        size_t capacity = size > PT_CHUNK_SIZE / 2 ? size : PT_CHUNK_SIZE;
        pt_chunk *fresh = emalloc(PT_ALIGN(sizeof(pt_chunk)) + capacity);
        fresh->used = 0;
        fresh->size = capacity;
        if (capacity == size && chunk != NULL) {
            /* A large allocation gets a chunk of its own behind the current one, which stays open. */
            fresh->next = chunk->next;
            chunk->next = fresh;
        } else {
            fresh->next = chunk;
            arena->chunks = fresh;
        }
        chunk = fresh;
    }
    char *base = (char *)chunk + PT_ALIGN(sizeof(pt_chunk));
    void *result = base + chunk->used;
    chunk->used += size;
    memset(result, 0, size);
    return result;
}

void pt_arena_keep(pt_arena *arena, zval *value)
{
    if (arena->keep_count == arena->keep_capacity) {
        arena->keep_capacity = arena->keep_capacity ? arena->keep_capacity * 2 : 16;
        arena->keep = erealloc(arena->keep, sizeof(zval) * arena->keep_capacity);
    }
    ZVAL_COPY(&arena->keep[arena->keep_count], value);
    arena->keep_count++;
}

pt_s pt_strdup(pt_arena *arena, const char *bytes, size_t length)
{
    char *copy = pt_alloc(arena, length + 1);
    if (length) {
        memcpy(copy, bytes, length);
    }
    copy[length] = '\0';
    return (pt_s){copy, length};
}

bool pt_eq(pt_s a, const char *bytes, size_t length)
{
    return a.n == length && (length == 0 || memcmp(a.s, bytes, length) == 0);
}

void pt_buf_init(pt_buf *buf, pt_arena *arena)
{
    buf->arena = arena;
    buf->s = NULL;
    buf->n = 0;
    buf->cap = 0;
}

static void pt_buf_reserve(pt_buf *buf, size_t more)
{
    if (buf->n + more + 1 <= buf->cap) {
        return;
    }
    size_t capacity = buf->cap ? buf->cap * 2 : 64;
    while (capacity < buf->n + more + 1) {
        capacity *= 2;
    }
    char *grown = pt_alloc(buf->arena, capacity);
    if (buf->n) {
        memcpy(grown, buf->s, buf->n);
    }
    buf->s = grown;
    buf->cap = capacity;
}

void pt_buf_add(pt_buf *buf, const char *bytes, size_t length)
{
    if (length == 0) {
        return;
    }
    pt_buf_reserve(buf, length);
    memcpy(buf->s + buf->n, bytes, length);
    buf->n += length;
}

void pt_buf_addc(pt_buf *buf, char byte)
{
    pt_buf_reserve(buf, 1);
    buf->s[buf->n++] = byte;
}

void pt_buf_adds(pt_buf *buf, pt_s string)
{
    pt_buf_add(buf, string.s, string.n);
}

pt_s pt_buf_done(pt_buf *buf)
{
    if (buf->s == NULL) {
        return (pt_s){"", 0};
    }
    buf->s[buf->n] = '\0';
    return (pt_s){buf->s, buf->n};
}

/* ----------------------------------------------------------------------------------------------- */
/* Lines and errors                                                                                 */
/* ----------------------------------------------------------------------------------------------- */

void pt_lines_build(pt_arena *arena, pt_lines *lines, const char *text, size_t length)
{
    size_t count = 1;
    for (size_t i = 0; i < length; i++) {
        if (text[i] == '\n') {
            count++;
        }
    }
    lines->starts = pt_alloc(arena, sizeof(size_t) * count);
    lines->count = count;
    size_t line = 0;
    lines->starts[line++] = 0;
    for (size_t i = 0; i < length; i++) {
        if (text[i] == '\n') {
            lines->starts[line++] = i + 1;
        }
    }
}

void pt_position(const pt_lines *lines, size_t offset, zend_long *line, zend_long *col)
{
    size_t low = 0, high = lines->count - 1;
    while (low < high) {
        size_t mid = (low + high + 1) / 2;
        if (lines->starts[mid] <= offset) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }
    *line = (zend_long)low + 1;
    *col = (zend_long)(offset - lines->starts[low]) + 1;
}

void pt_error_clear(pt_error *error)
{
    if (error->template) {
        zend_string_release(error->template);
    }
    if (error->message) {
        zend_string_release(error->message);
    }
    if (error->exception) {
        OBJ_RELEASE(error->exception);
    }
    memset(error, 0, sizeof(*error));
}

ZEND_NORETURN void pt_fail_at(pt_run *run, const char *code, pt_s template, const pt_lines *lines, size_t start, size_t end, zend_string *message)
{
    pt_error *error = &run->error;
    pt_error_clear(error);
    error->code = code;
    error->template = zend_string_init(template.s, template.n, 0);
    error->message = message;
    error->offset = (zend_long)start;
    error->end = (zend_long)end;
    if (lines != NULL) {
        pt_position(lines, start, &error->line, &error->col);
    }
    longjmp(run->jump, 1);
}

ZEND_NORETURN void pt_fail_bare(pt_run *run, const char *code, pt_s template, zend_string *message)
{
    pt_error *error = &run->error;
    pt_error_clear(error);
    error->code = code;
    error->template = zend_string_init(template.s, template.n, 0);
    error->message = message;
    longjmp(run->jump, 1);
}

zend_string *pt_json_quote(const char *bytes, size_t length)
{
    smart_str buf = {0};
    zval value;
    ZVAL_STRINGL(&value, bytes, length);
    php_json_encode(&buf, &value, 0);
    zval_ptr_dtor(&value);
    smart_str_0(&buf);
    if (buf.s == NULL) {
        return zend_string_init("\"\"", 2, 0);
    }
    return buf.s;
}

/* ----------------------------------------------------------------------------------------------- */
/* UTF-8                                                                                            */
/* ----------------------------------------------------------------------------------------------- */

size_t pt_utf8_first_invalid(const char *bytes, size_t length)
{
    const unsigned char *s = (const unsigned char *)bytes;
    size_t i = 0;
    while (i < length) {
        unsigned char b0 = s[i];
        if (b0 < 0x80) {
            i++;
            continue;
        }
        size_t need;
        uint32_t min, code;
        if (b0 >= 0xC2 && b0 <= 0xDF) {
            need = 1;
            min = 0x80;
            code = b0 & 0x1F;
        } else if (b0 >= 0xE0 && b0 <= 0xEF) {
            need = 2;
            min = 0x800;
            code = b0 & 0x0F;
        } else if (b0 >= 0xF0 && b0 <= 0xF4) {
            need = 3;
            min = 0x10000;
            code = b0 & 0x07;
        } else {
            return i;
        }
        for (size_t k = 1; k <= need; k++) {
            if (i + k >= length) {
                return i;
            }
            unsigned char b = s[i + k];
            if ((b & 0xC0) != 0x80) {
                return i;
            }
            code = (code << 6) | (b & 0x3F);
        }
        if (code < min || code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF)) {
            return i;
        }
        i += need + 1;
    }
    return length;
}

void pt_utf8_append(pt_buf *buf, uint32_t code)
{
    if (code >= 0xD800 && code <= 0xDFFF) {
        code = 0xFFFD;
    }
    char out[4];
    size_t n;
    if (code < 0x80) {
        out[0] = (char)code;
        n = 1;
    } else if (code < 0x800) {
        out[0] = (char)(0xC0 | (code >> 6));
        out[1] = (char)(0x80 | (code & 0x3F));
        n = 2;
    } else if (code < 0x10000) {
        out[0] = (char)(0xE0 | (code >> 12));
        out[1] = (char)(0x80 | ((code >> 6) & 0x3F));
        out[2] = (char)(0x80 | (code & 0x3F));
        n = 3;
    } else {
        out[0] = (char)(0xF0 | (code >> 18));
        out[1] = (char)(0x80 | ((code >> 12) & 0x3F));
        out[2] = (char)(0x80 | ((code >> 6) & 0x3F));
        out[3] = (char)(0x80 | (code & 0x3F));
        n = 4;
    }
    pt_buf_add(buf, out, n);
}

size_t pt_utf8_width(unsigned char lead)
{
    if (lead < 0x80) {
        return 1;
    }
    if (lead < 0xE0) {
        return 2;
    }
    if (lead < 0xF0) {
        return 3;
    }
    return 4;
}

size_t pt_utf8_length(const char *bytes, size_t length)
{
    size_t count = 0;
    for (size_t i = 0; i < length; i += pt_utf8_width((unsigned char)bytes[i])) {
        count++;
    }
    return count;
}

void pt_escape_html(pt_buf *buf, pt_s text)
{
    size_t from = 0;
    for (size_t i = 0; i < text.n; i++) {
        const char *replacement;
        switch (text.s[i]) {
            case '&': replacement = "&amp;"; break;
            case '<': replacement = "&lt;"; break;
            case '>': replacement = "&gt;"; break;
            case '"': replacement = "&quot;"; break;
            case '\'': replacement = "&#39;"; break;
            default: continue;
        }
        pt_buf_add(buf, text.s + from, i - from);
        pt_buf_add(buf, replacement, strlen(replacement));
        from = i + 1;
    }
    pt_buf_add(buf, text.s + from, text.n - from);
}

/* ----------------------------------------------------------------------------------------------- */
/* Lists and maps                                                                                   */
/* ----------------------------------------------------------------------------------------------- */

pt_list *pt_list_new(pt_arena *arena, uint32_t count)
{
    pt_list *list = pt_alloc(arena, sizeof(pt_list));
    list->count = count;
    list->items = count ? pt_alloc(arena, sizeof(pt_value) * count) : NULL;
    return list;
}

void pt_vec_init(pt_vec *vec, pt_arena *arena)
{
    vec->arena = arena;
    vec->items = NULL;
    vec->count = 0;
    vec->capacity = 0;
}

void pt_vec_push(pt_vec *vec, pt_value value)
{
    if (vec->count == vec->capacity) {
        uint32_t capacity = vec->capacity ? vec->capacity * 2 : 8;
        pt_value *grown = pt_alloc(vec->arena, sizeof(pt_value) * capacity);
        if (vec->count) {
            memcpy(grown, vec->items, sizeof(pt_value) * vec->count);
        }
        vec->items = grown;
        vec->capacity = capacity;
    }
    vec->items[vec->count++] = value;
}

pt_list *pt_vec_list(pt_vec *vec)
{
    pt_list *list = pt_alloc(vec->arena, sizeof(pt_list));
    list->count = vec->count;
    list->items = vec->items;
    return list;
}

/* Maps with at most this many entries are searched without an index. */
#define PT_MAP_LINEAR 8

pt_map *pt_map_new(pt_arena *arena, uint32_t capacity)
{
    pt_map *map = pt_alloc(arena, sizeof(pt_map));
    map->arena = arena;
    map->capacity = capacity < 4 ? 4 : capacity;
    map->entries = pt_alloc(arena, sizeof(pt_entry) * map->capacity);
    return map;
}

static void pt_map_index(pt_map *map)
{
    HashTable *index = zend_new_array(map->used * 2);
    for (uint32_t i = 0; i < map->used; i++) {
        if (map->entries[i].live) {
            zval position;
            ZVAL_LONG(&position, i);
            zend_hash_str_update(index, map->entries[i].key.s, map->entries[i].key.n, &position);
        }
    }
    zval owner;
    ZVAL_ARR(&owner, index);
    pt_arena_keep(map->arena, &owner);
    zval_ptr_dtor(&owner);
    map->index = index;
}

static int64_t pt_map_find(const pt_map *map, const char *key, size_t length)
{
    if (map->index) {
        zval *position = zend_hash_str_find(map->index, key, length);
        return position ? Z_LVAL_P(position) : -1;
    }
    for (uint32_t i = 0; i < map->used; i++) {
        const pt_entry *entry = &map->entries[i];
        if (entry->live && entry->key.n == length && memcmp(entry->key.s, key, length) == 0) {
            return i;
        }
    }
    return -1;
}

pt_value *pt_map_get(const pt_map *map, const char *key, size_t length)
{
    int64_t position = pt_map_find(map, key, length);
    return position < 0 ? NULL : &map->entries[position].value;
}

void pt_map_set(pt_map *map, pt_s key, pt_value value)
{
    int64_t position = pt_map_find(map, key.s, key.n);
    if (position >= 0) {
        map->entries[position].value = value;
        return;
    }
    if (map->used == map->capacity) {
        uint32_t capacity = map->capacity * 2;
        pt_entry *grown = pt_alloc(map->arena, sizeof(pt_entry) * capacity);
        memcpy(grown, map->entries, sizeof(pt_entry) * map->used);
        map->entries = grown;
        map->capacity = capacity;
    }
    pt_entry *entry = &map->entries[map->used];
    entry->key = key;
    entry->value = value;
    entry->live = true;
    if (map->index) {
        zval slot;
        ZVAL_LONG(&slot, map->used);
        zend_hash_str_update(map->index, key.s, key.n, &slot);
    }
    map->used++;
    map->count++;
    if (map->index == NULL && map->count > PT_MAP_LINEAR) {
        pt_map_index(map);
    }
}

void pt_map_remove(pt_map *map, const char *key, size_t length)
{
    int64_t position = pt_map_find(map, key, length);
    if (position < 0) {
        return;
    }
    map->entries[position].live = false;
    map->count--;
    if (map->index) {
        zend_hash_str_del(map->index, key, length);
    }
}

pt_map *pt_map_copy(pt_arena *arena, const pt_map *map)
{
    pt_map *copy = pt_map_new(arena, map->count + 4);
    for (uint32_t i = 0; i < map->used; i++) {
        if (map->entries[i].live) {
            pt_map_set(copy, map->entries[i].key, map->entries[i].value);
        }
    }
    return copy;
}

/* ----------------------------------------------------------------------------------------------- */
/* Value semantics                                                                                  */
/* ----------------------------------------------------------------------------------------------- */

const char *pt_type_name(pt_value value)
{
    switch (value.type) {
        case PT_NULL: return "null";
        case PT_BOOL: return "bool";
        case PT_NUMBER: return "number";
        case PT_STRING:
        case PT_SAFE: return "string";
        case PT_LIST: return "list";
        case PT_MAP: return "map";
        default: return "object";
    }
}

bool pt_truthy(pt_value value)
{
    switch (value.type) {
        case PT_NULL: return false;
        case PT_BOOL: return value.u.b;
        case PT_NUMBER: return value.u.number != 0;
        case PT_STRING:
        case PT_SAFE: return value.u.str.n != 0;
        case PT_LIST: return value.u.list->count != 0;
        case PT_MAP: return value.u.map->count != 0;
        default: return true;
    }
}

bool pt_is_integer(double value)
{
    return isfinite(value) && floor(value) == value;
}

void pt_shortest_digits(double value, bool *negative, char *digits, size_t *count, int *exponent)
{
    *negative = value < 0;
    int point = 0;
    bool sign = false;
    char *end = NULL;
    char *text = zend_dtoa(fabs(value), 0, 0, &point, &sign, &end);
    size_t length = (size_t)(end - text);
    memcpy(digits, text, length);
    digits[length] = '\0';
    zend_freedtoa(text);
    *count = length;
    *exponent = point;
}

pt_s pt_number_text(pt_arena *arena, double value)
{
    if (value == 0) {
        return PT_S("0");
    }
    if (isnan(value)) {
        return PT_S("NaN");
    }
    if (isinf(value)) {
        return value < 0 ? PT_S("-Infinity") : PT_S("Infinity");
    }
    bool negative;
    char digits[32];
    size_t k;
    int n;
    pt_shortest_digits(value, &negative, digits, &k, &n);
    pt_buf buf;
    pt_buf_init(&buf, arena);
    if (negative) {
        pt_buf_addc(&buf, '-');
    }
    if ((int)k <= n && n <= 21) {
        pt_buf_add(&buf, digits, k);
        for (int i = (int)k; i < n; i++) {
            pt_buf_addc(&buf, '0');
        }
    } else if (0 < n && n <= 21) {
        pt_buf_add(&buf, digits, (size_t)n);
        pt_buf_addc(&buf, '.');
        pt_buf_add(&buf, digits + n, k - (size_t)n);
    } else if (-6 < n && n <= 0) {
        PT_BUF_LIT(&buf, "0.");
        for (int i = 0; i < -n; i++) {
            pt_buf_addc(&buf, '0');
        }
        pt_buf_add(&buf, digits, k);
    } else {
        int e = n - 1;
        pt_buf_addc(&buf, digits[0]);
        if (k > 1) {
            pt_buf_addc(&buf, '.');
            pt_buf_add(&buf, digits + 1, k - 1);
        }
        char tail[16];
        int written = snprintf(tail, sizeof(tail), "e%c%d", e < 0 ? '-' : '+', e < 0 ? -e : e);
        pt_buf_add(&buf, tail, (size_t)written);
    }
    return pt_buf_done(&buf);
}

bool pt_stringify(pt_arena *arena, pt_value value, pt_s *text)
{
    switch (value.type) {
        case PT_NULL: *text = PT_S(""); return true;
        case PT_BOOL: *text = value.u.b ? PT_S("true") : PT_S("false"); return true;
        case PT_NUMBER: *text = pt_number_text(arena, value.u.number); return true;
        case PT_STRING:
        case PT_SAFE: *text = value.u.str; return true;
        default: return false;
    }
}

static bool pt_digit(char c)
{
    return c >= '0' && c <= '9';
}

bool pt_numeric_string(const char *text, size_t length, double *number)
{
    size_t start = 0, end = length;
    while (start < end && (text[start] == ' ' || text[start] == '\t' || text[start] == '\r' || text[start] == '\n')) {
        start++;
    }
    while (end > start && (text[end - 1] == ' ' || text[end - 1] == '\t' || text[end - 1] == '\r' || text[end - 1] == '\n')) {
        end--;
    }
    /* ^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$ */
    size_t i = start;
    if (i < end && (text[i] == '+' || text[i] == '-')) {
        i++;
    }
    size_t integer = i;
    while (i < end && pt_digit(text[i])) {
        i++;
    }
    if (i > integer) {
        if (i < end && text[i] == '.') {
            i++;
            while (i < end && pt_digit(text[i])) {
                i++;
            }
        }
    } else {
        if (i >= end || text[i] != '.') {
            return false;
        }
        i++;
        size_t fraction = i;
        while (i < end && pt_digit(text[i])) {
            i++;
        }
        if (i == fraction) {
            return false;
        }
    }
    if (i < end && (text[i] == 'e' || text[i] == 'E')) {
        i++;
        if (i < end && (text[i] == '+' || text[i] == '-')) {
            i++;
        }
        size_t digits = i;
        while (i < end && pt_digit(text[i])) {
            i++;
        }
        if (i == digits) {
            return false;
        }
    }
    if (i != end) {
        return false;
    }
    /* zend_strtod reads a NUL-terminated string; the matched text is copied. */
    char small[64];
    char *copy = end - start < sizeof(small) ? small : emalloc(end - start + 1);
    memcpy(copy, text + start, end - start);
    copy[end - start] = '\0';
    double parsed = zend_strtod(copy, NULL);
    if (copy != small) {
        efree(copy);
    }
    if (!isfinite(parsed)) {
        return false;
    }
    *number = parsed;
    return true;
}

static int pt_type_rank(pt_value value)
{
    return value.type == PT_SAFE ? PT_STRING : value.type;
}

static bool pt_same_type_equals(pt_value a, pt_value b)
{
    switch (pt_type_rank(a)) {
        case PT_NULL: return true;
        case PT_BOOL: return a.u.b == b.u.b;
        case PT_NUMBER: return a.u.number == b.u.number;
        case PT_STRING: return a.u.str.n == b.u.str.n && (a.u.str.n == 0 || memcmp(a.u.str.s, b.u.str.s, a.u.str.n) == 0);
        case PT_LIST:
            if (a.u.list->count != b.u.list->count) {
                return false;
            }
            for (uint32_t i = 0; i < a.u.list->count; i++) {
                if (!pt_loose_equals(a.u.list->items[i], b.u.list->items[i])) {
                    return false;
                }
            }
            return true;
        case PT_OBJECT: return a.u.object == b.u.object;
        default: {
            const pt_map *left = a.u.map, *right = b.u.map;
            if (left->count != right->count) {
                return false;
            }
            for (uint32_t i = 0; i < left->used; i++) {
                const pt_entry *entry = &left->entries[i];
                if (!entry->live) {
                    continue;
                }
                pt_value *other = pt_map_get(right, entry->key.s, entry->key.n);
                if (other == NULL || !pt_loose_equals(entry->value, *other)) {
                    return false;
                }
            }
            return true;
        }
    }
}

bool pt_loose_equals(pt_value a, pt_value b)
{
    int ta = pt_type_rank(a), tb = pt_type_rank(b);
    if (ta == tb) {
        return pt_same_type_equals(a, b);
    }
    double number;
    if (ta == PT_NUMBER && tb == PT_STRING) {
        return pt_numeric_string(b.u.str.s, b.u.str.n, &number) && number == a.u.number;
    }
    if (ta == PT_STRING && tb == PT_NUMBER) {
        return pt_numeric_string(a.u.str.s, a.u.str.n, &number) && number == b.u.number;
    }
    return false;
}

bool pt_strict_equals(pt_value a, pt_value b)
{
    return pt_type_rank(a) == pt_type_rank(b) && pt_same_type_equals(a, b);
}

bool pt_compare(pt_value a, pt_value b, int *order)
{
    if (a.type == PT_NUMBER && b.type == PT_NUMBER) {
        *order = a.u.number < b.u.number ? -1 : (a.u.number > b.u.number ? 1 : 0);
        return true;
    }
    if (pt_is_string(a) && pt_is_string(b)) {
        size_t common = a.u.str.n < b.u.str.n ? a.u.str.n : b.u.str.n;
        int result = common ? memcmp(a.u.str.s, b.u.str.s, common) : 0;
        if (result == 0) {
            result = a.u.str.n < b.u.str.n ? -1 : (a.u.str.n > b.u.str.n ? 1 : 0);
        }
        *order = result < 0 ? -1 : (result > 0 ? 1 : 0);
        return true;
    }
    return false;
}

bool pt_depth_within(pt_value value, int limit)
{
    if (value.type == PT_LIST) {
        if (limit == 0) {
            return false;
        }
        for (uint32_t i = 0; i < value.u.list->count; i++) {
            if (!pt_depth_within(value.u.list->items[i], limit - 1)) {
                return false;
            }
        }
    } else if (value.type == PT_MAP) {
        if (limit == 0) {
            return false;
        }
        const pt_map *map = value.u.map;
        for (uint32_t i = 0; i < map->used; i++) {
            if (map->entries[i].live && !pt_depth_within(map->entries[i].value, limit - 1)) {
                return false;
            }
        }
    }
    return true;
}
