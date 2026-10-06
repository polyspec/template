/*
 * The built-in functions (docs/spec/functions.md): encoding (FUN-10, FUN-11, FUN-18, FUN-19, FUN-26 to
 * FUN-30), strings (FUN-12, FUN-13), collections (FUN-14, FUN-15, FUN-31 to FUN-36), numbers (FUN-16,
 * FUN-17, FUN-20 to FUN-25) and dates (FUN-37 to FUN-42).
 */
#include "pt.h"
#include "Zend/zend_strtod.h"
#include <math.h>

#define PT_FN(name) static bool name(pt_arena *arena, const pt_env *env, pt_value *a, uint32_t n, pt_value *result, pt_function_error *error)

static bool pt_type_error(pt_function_error *error, zend_string *message)
{
    error->code = "E_RUNTIME_TYPE";
    error->message = message;
    return false;
}

#define PT_TYPE_ERROR(...) pt_type_error(error, zend_strpprintf(0, __VA_ARGS__))

static bool pt_arg_string(pt_value value, const char *name, pt_s *text, pt_function_error *error)
{
    if (!pt_is_string(value)) {
        return PT_TYPE_ERROR("%s requires a string, got %s", name, pt_type_name(value));
    }
    *text = value.u.str;
    return true;
}

static bool pt_arg_list(pt_value value, const char *name, pt_list **list, pt_function_error *error)
{
    if (value.type != PT_LIST) {
        return PT_TYPE_ERROR("%s requires a list, got %s", name, pt_type_name(value));
    }
    *list = value.u.list;
    return true;
}

/* EXP-23 to_number. */
static bool pt_to_number(pt_value value, double *number, pt_function_error *error)
{
    switch (value.type) {
        case PT_NULL: *number = 0; return true;
        case PT_BOOL: *number = value.u.b ? 1 : 0; return true;
        case PT_NUMBER: *number = value.u.number; return true;
        case PT_STRING:
        case PT_SAFE:
            if (pt_numeric_string(value.u.str.s, value.u.str.n, number)) {
                return true;
            }
            {
                zend_string *quoted = pt_json_quote(value.u.str.s, value.u.str.n);
                zend_string *message = zend_strpprintf(0, "%s is not a number", ZSTR_VAL(quoted));
                zend_string_release(quoted);
                return pt_type_error(error, message);
            }
        default:
            return PT_TYPE_ERROR("a %s is not a number", pt_type_name(value));
    }
}

/* The integer part of a number, as PHP converts a float to an integer. */
static zend_long pt_truncate(double number)
{
    return zend_dval_to_lval(number < 0 ? ceil(number) : floor(number));
}

static bool pt_to_integer(pt_value value, zend_long *integer, pt_function_error *error)
{
    double number = 0;
    if (!pt_to_number(value, &number, error)) {
        return false;
    }
    *integer = pt_truncate(number);
    return true;
}

static bool pt_stringify_arg(pt_arena *arena, pt_value value, pt_s *text, pt_function_error *error)
{
    if (!pt_stringify(arena, value, text)) {
        error->code = "E_RUNTIME_STRINGIFY";
        error->message = zend_string_init("a list or map cannot be converted to text", 41, 0);
        return false;
    }
    return true;
}

static bool pt_finite_result(double value, pt_value *result, pt_function_error *error)
{
    if (!isfinite(value)) {
        return PT_TYPE_ERROR("arithmetic result is not finite");
    }
    *result = pt_number(value);
    return true;
}

/* ---- encoding ---- */

PT_FN(pt_fn_escape)
{
    pt_s text = {NULL, 0};
    if (!pt_stringify_arg(arena, a[0], &text, error)) {
        return false;
    }
    pt_buf buf;
    pt_buf_init(&buf, arena);
    pt_escape_html(&buf, text);
    *result = pt_safe(pt_buf_done(&buf));
    return true;
}

PT_FN(pt_fn_raw)
{
    pt_s text = {NULL, 0};
    if (!pt_stringify_arg(arena, a[0], &text, error)) {
        return false;
    }
    *result = pt_safe(text);
    return true;
}

PT_FN(pt_fn_json)
{
    pt_buf buf;
    pt_buf_init(&buf, arena);
    if (!pt_json_write(&buf, a[0])) {
        /* FUN-26: a native object is opaque (VAL-19) and has no JSON text. */
        return PT_TYPE_ERROR("json does not accept a native object");
    }
    *result = pt_string(pt_buf_done(&buf));
    return true;
}

PT_FN(pt_fn_url)
{
    pt_s text = {NULL, 0};
    if (!pt_stringify_arg(arena, a[0], &text, error)) {
        return false;
    }
    /* rawurlencode (FUN-29). */
    static const char hex[] = "0123456789ABCDEF";
    pt_buf buf;
    pt_buf_init(&buf, arena);
    for (size_t i = 0; i < text.n; i++) {
        unsigned char c = (unsigned char)text.s[i];
        if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' || c == '~') {
            pt_buf_addc(&buf, (char)c);
        } else {
            char escaped[3] = {'%', hex[c >> 4], hex[c & 15]};
            pt_buf_add(&buf, escaped, 3);
        }
    }
    *result = pt_string(pt_buf_done(&buf));
    return true;
}

PT_FN(pt_fn_nl2br)
{
    pt_s text = {NULL, 0};
    if (!pt_arg_string(a[0], "nl2br", &text, error)) {
        return false;
    }
    pt_buf buf;
    pt_buf_init(&buf, arena);
    for (size_t i = 0; i < text.n; i++) {
        if (text.s[i] == '\r' && i + 1 < text.n && text.s[i + 1] == '\n') {
            PT_BUF_LIT(&buf, "<br>\n");
            i++;
        } else if (text.s[i] == '\n') {
            PT_BUF_LIT(&buf, "<br>\n");
        } else {
            pt_buf_addc(&buf, text.s[i]);
        }
    }
    *result = pt_string(pt_buf_done(&buf));
    return true;
}

PT_FN(pt_fn_str)
{
    pt_s text = {NULL, 0};
    if (!pt_stringify_arg(arena, a[0], &text, error)) {
        return false;
    }
    *result = pt_string(text);
    return true;
}

PT_FN(pt_fn_type)
{
    const char *name = pt_type_name(a[0]);
    *result = pt_string((pt_s){name, strlen(name)});
    return true;
}

/* ---- strings ---- */

static bool pt_case(pt_arena *arena, pt_value value, const char *name, bool upper, pt_value *result, pt_function_error *error)
{
    pt_s text = {NULL, 0};
    if (!pt_arg_string(value, name, &text, error)) {
        return false;
    }
    char *out = pt_alloc(arena, text.n + 1);
    for (size_t i = 0; i < text.n; i++) {
        char c = text.s[i];
        if (upper && c >= 'a' && c <= 'z') {
            c = (char)(c - 32);
        } else if (!upper && c >= 'A' && c <= 'Z') {
            c = (char)(c + 32);
        }
        out[i] = c;
    }
    *result = pt_string((pt_s){out, text.n});
    return true;
}

PT_FN(pt_fn_upper) { return pt_case(arena, a[0], "upper", true, result, error); }
PT_FN(pt_fn_lower) { return pt_case(arena, a[0], "lower", false, result, error); }

/* Whether the code point at text[i] is one of the code points of `set`. */
static bool pt_in_set(pt_s set, const char *point, size_t width)
{
    for (size_t j = 0; j < set.n; j += pt_utf8_width((unsigned char)set.s[j])) {
        size_t w = pt_utf8_width((unsigned char)set.s[j]);
        if (w == width && memcmp(set.s + j, point, width) == 0) {
            return true;
        }
    }
    return false;
}

PT_FN(pt_fn_trim)
{
    pt_s text, chars = PT_S(" \t\r\n");
    if (!pt_arg_string(a[0], "trim", &text, error)) {
        return false;
    }
    if (n > 1 && !pt_arg_string(a[1], "trim", &chars, error)) {
        return false;
    }
    size_t start = 0, end = text.n;
    while (start < end) {
        size_t w = pt_utf8_width((unsigned char)text.s[start]);
        if (!pt_in_set(chars, text.s + start, w)) {
            break;
        }
        start += w;
    }
    while (end > start) {
        size_t lead = end - 1;
        while (lead > start && ((unsigned char)text.s[lead] & 0xC0) == 0x80) {
            lead--;
        }
        if (!pt_in_set(chars, text.s + lead, end - lead)) {
            break;
        }
        end = lead;
    }
    *result = pt_string((pt_s){text.s + start, end - start});
    return true;
}

PT_FN(pt_fn_replace)
{
    pt_s text = {NULL, 0}, search = {NULL, 0}, replacement = {NULL, 0};
    if (!pt_arg_string(a[0], "replace", &text, error) || !pt_arg_string(a[1], "replace", &search, error) || !pt_arg_string(a[2], "replace", &replacement, error)) {
        return false;
    }
    if (search.n == 0) {
        *result = pt_string(text);
        return true;
    }
    pt_buf buf;
    pt_buf_init(&buf, arena);
    size_t i = 0;
    while (i < text.n) {
        if (text.n - i >= search.n && memcmp(text.s + i, search.s, search.n) == 0) {
            pt_buf_adds(&buf, replacement);
            i += search.n;
        } else {
            pt_buf_addc(&buf, text.s[i]);
            i++;
        }
    }
    *result = pt_string(pt_buf_done(&buf));
    return true;
}

PT_FN(pt_fn_split)
{
    pt_s text = {NULL, 0}, separator = {NULL, 0};
    if (!pt_arg_string(a[0], "split", &text, error) || !pt_arg_string(a[1], "split", &separator, error)) {
        return false;
    }
    if (separator.n == 0) {
        return PT_TYPE_ERROR("split requires a non-empty separator");
    }
    pt_vec parts;
    pt_vec_init(&parts, arena);
    size_t start = 0, i = 0;
    while (i + separator.n <= text.n) {
        if (memcmp(text.s + i, separator.s, separator.n) == 0) {
            pt_vec_push(&parts, pt_string((pt_s){text.s + start, i - start}));
            i += separator.n;
            start = i;
        } else {
            i++;
        }
    }
    pt_vec_push(&parts, pt_string((pt_s){text.s + start, text.n - start}));
    *result = pt_list_value(pt_vec_list(&parts));
    return true;
}

/* The byte offset of the code point with the index `count` of valid UTF-8, or the length. */
static size_t pt_utf8_offset(pt_s text, size_t count)
{
    size_t i = 0;
    while (i < text.n && count > 0) {
        i += pt_utf8_width((unsigned char)text.s[i]);
        count--;
    }
    return i;
}

PT_FN(pt_fn_truncate)
{
    pt_s text, suffix = PT_S("...");
    zend_long limit = 0;
    if (!pt_arg_string(a[0], "truncate", &text, error) || !pt_to_integer(a[1], &limit, error)) {
        return false;
    }
    if (n > 2 && !pt_arg_string(a[2], "truncate", &suffix, error)) {
        return false;
    }
    size_t length = pt_utf8_length(text.s, text.n);
    if ((zend_long)length > limit) {
        size_t keep = pt_utf8_offset(text, limit > 0 ? (size_t)limit : 0);
        pt_buf buf;
        pt_buf_init(&buf, arena);
        pt_buf_add(&buf, text.s, keep);
        pt_buf_adds(&buf, suffix);
        *result = pt_string(pt_buf_done(&buf));
    } else {
        *result = pt_string(text);
    }
    return true;
}

static bool pt_contains_bytes(pt_s haystack, pt_s needle)
{
    if (needle.n == 0) {
        return true;
    }
    if (needle.n > haystack.n) {
        return false;
    }
    for (size_t i = 0; i + needle.n <= haystack.n; i++) {
        if (memcmp(haystack.s + i, needle.s, needle.n) == 0) {
            return true;
        }
    }
    return false;
}

PT_FN(pt_fn_contains)
{
    if (pt_is_string(a[0])) {
        if (!pt_is_string(a[1])) {
            return PT_TYPE_ERROR("contains requires a string needle for a string haystack");
        }
        *result = pt_bool(pt_contains_bytes(a[0].u.str, a[1].u.str));
        return true;
    }
    if (a[0].type == PT_LIST) {
        for (uint32_t i = 0; i < a[0].u.list->count; i++) {
            if (pt_loose_equals(a[0].u.list->items[i], a[1])) {
                *result = pt_bool(true);
                return true;
            }
        }
        *result = pt_bool(false);
        return true;
    }
    return PT_TYPE_ERROR("contains requires a string or a list");
}

PT_FN(pt_fn_starts_with)
{
    pt_s text = {NULL, 0}, prefix = {NULL, 0};
    if (!pt_arg_string(a[0], "starts_with", &text, error) || !pt_arg_string(a[1], "starts_with", &prefix, error)) {
        return false;
    }
    *result = pt_bool(prefix.n <= text.n && memcmp(text.s, prefix.s, prefix.n) == 0);
    return true;
}

PT_FN(pt_fn_ends_with)
{
    pt_s text = {NULL, 0}, suffix = {NULL, 0};
    if (!pt_arg_string(a[0], "ends_with", &text, error) || !pt_arg_string(a[1], "ends_with", &suffix, error)) {
        return false;
    }
    *result = pt_bool(suffix.n <= text.n && memcmp(text.s + text.n - suffix.n, suffix.s, suffix.n) == 0);
    return true;
}

PT_FN(pt_fn_length)
{
    switch (a[0].type) {
        case PT_NULL: *result = pt_number(0); return true;
        case PT_STRING:
        case PT_SAFE: *result = pt_number((double)pt_utf8_length(a[0].u.str.s, a[0].u.str.n)); return true;
        case PT_LIST: *result = pt_number((double)a[0].u.list->count); return true;
        case PT_MAP: *result = pt_number((double)a[0].u.map->count); return true;
        default: return PT_TYPE_ERROR("length requires a string, list, map or null");
    }
}

/* ---- collections ---- */

#define PT_RANGE_LIMIT 1000000

PT_FN(pt_fn_keys)
{
    pt_vec keys;
    pt_vec_init(&keys, arena);
    if (a[0].type == PT_MAP) {
        const pt_map *map = a[0].u.map;
        for (uint32_t i = 0; i < map->used; i++) {
            if (map->entries[i].live) {
                pt_vec_push(&keys, pt_string(map->entries[i].key));
            }
        }
    } else if (a[0].type == PT_LIST) {
        for (uint32_t i = 0; i < a[0].u.list->count; i++) {
            pt_vec_push(&keys, pt_number(i));
        }
    } else {
        return PT_TYPE_ERROR("keys requires a map or a list");
    }
    *result = pt_list_value(pt_vec_list(&keys));
    return true;
}

PT_FN(pt_fn_values)
{
    if (a[0].type == PT_MAP) {
        pt_vec values;
        pt_vec_init(&values, arena);
        const pt_map *map = a[0].u.map;
        for (uint32_t i = 0; i < map->used; i++) {
            if (map->entries[i].live) {
                pt_vec_push(&values, map->entries[i].value);
            }
        }
        *result = pt_list_value(pt_vec_list(&values));
        return true;
    }
    if (a[0].type == PT_LIST) {
        *result = a[0];
        return true;
    }
    return PT_TYPE_ERROR("values requires a map or a list");
}

static bool pt_end_item(pt_value value, const char *name, bool last, pt_value *result, pt_function_error *error)
{
    if (value.type == PT_LIST) {
        uint32_t count = value.u.list->count;
        *result = count == 0 ? pt_null() : value.u.list->items[last ? count - 1 : 0];
        return true;
    }
    if (pt_is_string(value)) {
        pt_s text = value.u.str;
        if (text.n == 0) {
            *result = pt_null();
            return true;
        }
        size_t start = 0, width;
        if (last) {
            start = text.n - 1;
            while (start > 0 && ((unsigned char)text.s[start] & 0xC0) == 0x80) {
                start--;
            }
            width = text.n - start;
        } else {
            width = pt_utf8_width((unsigned char)text.s[0]);
        }
        *result = pt_string((pt_s){text.s + start, width});
        return true;
    }
    return pt_type_error(error, zend_strpprintf(0, "%s requires a list or a string", name));
}

PT_FN(pt_fn_first) { return pt_end_item(a[0], "first", false, result, error); }
PT_FN(pt_fn_last) { return pt_end_item(a[0], "last", true, result, error); }

PT_FN(pt_fn_reverse)
{
    if (a[0].type == PT_LIST) {
        uint32_t count = a[0].u.list->count;
        pt_list *list = pt_list_new(arena, count);
        for (uint32_t i = 0; i < count; i++) {
            list->items[i] = a[0].u.list->items[count - 1 - i];
        }
        *result = pt_list_value(list);
        return true;
    }
    if (pt_is_string(a[0])) {
        pt_s text = a[0].u.str;
        char *out = pt_alloc(arena, text.n + 1);
        size_t at = text.n;
        for (size_t i = 0; i < text.n;) {
            size_t w = pt_utf8_width((unsigned char)text.s[i]);
            at -= w;
            memcpy(out + at, text.s + i, w);
            i += w;
        }
        *result = pt_string((pt_s){out, text.n});
        return true;
    }
    return PT_TYPE_ERROR("reverse requires a list or a string");
}

PT_FN(pt_fn_slice)
{
    bool is_list = a[0].type == PT_LIST;
    if (!is_list && !pt_is_string(a[0])) {
        return PT_TYPE_ERROR("slice requires a list or a string");
    }
    zend_long size = is_list ? (zend_long)a[0].u.list->count : (zend_long)pt_utf8_length(a[0].u.str.s, a[0].u.str.n);
    zend_long from = 0;
    if (!pt_to_integer(a[1], &from, error)) {
        return false;
    }
    if (from < 0) {
        from = from + size < 0 ? 0 : from + size;
    }
    if (from >= size) {
        *result = is_list ? pt_list_value(pt_list_new(arena, 0)) : pt_string(PT_S(""));
        return true;
    }
    zend_long count = size - from;
    if (n > 2 && !pt_to_integer(a[2], &count, error)) {
        return false;
    }
    if (count < 0) {
        count = 0;
    }
    if (count > size - from) {
        count = size - from;
    }
    if (is_list) {
        pt_list *list = pt_list_new(arena, (uint32_t)count);
        for (zend_long i = 0; i < count; i++) {
            list->items[i] = a[0].u.list->items[from + i];
        }
        *result = pt_list_value(list);
    } else {
        size_t start = pt_utf8_offset(a[0].u.str, (size_t)from);
        pt_s rest = {a[0].u.str.s + start, a[0].u.str.n - start};
        size_t end = pt_utf8_offset(rest, (size_t)count);
        *result = pt_string((pt_s){rest.s, end});
    }
    return true;
}

static bool pt_canonical_index(pt_s segment, zend_long *index)
{
    if (segment.n == 0 || (segment.n > 1 && segment.s[0] == '0')) {
        return false;
    }
    zend_long value = 0;
    for (size_t i = 0; i < segment.n; i++) {
        if (segment.s[i] < '0' || segment.s[i] > '9') {
            return false;
        }
        if (value > (ZEND_LONG_MAX - 9) / 10) {
            value = ZEND_LONG_MAX;
            continue;
        }
        value = value * 10 + (segment.s[i] - '0');
    }
    *index = value;
    return true;
}

static pt_value pt_lookup_path(pt_value value, pt_s path)
{
    pt_value current = value;
    size_t start = 0;
    for (;;) {
        const char *dot = memchr(path.s + start, '.', path.n - start);
        size_t end = dot ? (size_t)(dot - path.s) : path.n;
        pt_s segment = {path.s + start, end - start};
        zend_long index = 0;
        if (current.type == PT_MAP) {
            pt_value *found = pt_map_get(current.u.map, segment.s, segment.n);
            current = found ? *found : pt_null();
        } else if (current.type == PT_LIST && pt_canonical_index(segment, &index)) {
            current = index < (zend_long)current.u.list->count ? current.u.list->items[index] : pt_null();
        } else {
            return pt_null();
        }
        if (dot == NULL) {
            return current;
        }
        start = end + 1;
    }
}

typedef struct pt_keyed {
    pt_value item, key;
    uint32_t index;
} pt_keyed;

static int pt_keyed_order(const pt_keyed *a, const pt_keyed *b)
{
    int order = 0;
    if (!pt_compare(a->key, b->key, &order)) {
        order = 0;
    }
    if (order != 0) {
        return order;
    }
    return a->index < b->index ? -1 : (a->index > b->index ? 1 : 0);
}

static void pt_merge_sort(pt_keyed *items, pt_keyed *scratch, uint32_t count)
{
    if (count < 2) {
        return;
    }
    uint32_t half = count / 2;
    pt_merge_sort(items, scratch, half);
    pt_merge_sort(items + half, scratch, count - half);
    uint32_t i = 0, j = half, k = 0;
    while (i < half && j < count) {
        scratch[k++] = pt_keyed_order(&items[j], &items[i]) < 0 ? items[j++] : items[i++];
    }
    while (i < half) {
        scratch[k++] = items[i++];
    }
    while (j < count) {
        scratch[k++] = items[j++];
    }
    memcpy(items, scratch, sizeof(pt_keyed) * count);
}

PT_FN(pt_fn_sort)
{
    pt_list *list;
    if (!pt_arg_list(a[0], "sort", &list, error)) {
        return false;
    }
    pt_s path = {NULL, 0};
    if (n > 1 && !pt_arg_string(a[1], "sort", &path, error)) {
        return false;
    }
    uint32_t count = list->count;
    pt_keyed *keyed = pt_alloc(arena, sizeof(pt_keyed) * (count ? count : 1));
    bool all_numbers = true, all_strings = true;
    for (uint32_t i = 0; i < count; i++) {
        keyed[i].item = list->items[i];
        keyed[i].key = path.s == NULL ? list->items[i] : pt_lookup_path(list->items[i], path);
        keyed[i].index = i;
        if (keyed[i].key.type != PT_NUMBER) {
            all_numbers = false;
        }
        if (!pt_is_string(keyed[i].key)) {
            all_strings = false;
        }
    }
    if (!all_numbers && !all_strings) {
        return PT_TYPE_ERROR("sort requires all numbers or all strings");
    }
    pt_keyed *scratch = pt_alloc(arena, sizeof(pt_keyed) * (count ? count : 1));
    pt_merge_sort(keyed, scratch, count);
    pt_list *sorted = pt_list_new(arena, count);
    for (uint32_t i = 0; i < count; i++) {
        sorted->items[i] = keyed[i].item;
    }
    *result = pt_list_value(sorted);
    return true;
}

PT_FN(pt_fn_join)
{
    pt_s separator = PT_S(",");
    if (n > 1 && !pt_arg_string(a[1], "join", &separator, error)) {
        return false;
    }
    pt_list *list;
    if (!pt_arg_list(a[0], "join", &list, error)) {
        return false;
    }
    pt_buf buf;
    pt_buf_init(&buf, arena);
    for (uint32_t i = 0; i < list->count; i++) {
        pt_s text = {NULL, 0};
        if (!pt_stringify_arg(arena, list->items[i], &text, error)) {
            return false;
        }
        if (i) {
            pt_buf_adds(&buf, separator);
        }
        pt_buf_adds(&buf, text);
    }
    *result = pt_string(pt_buf_done(&buf));
    return true;
}

PT_FN(pt_fn_range)
{
    double start, end, increment = 1.0;
    if (!pt_to_number(a[0], &start, error) || !pt_to_number(a[1], &end, error)) {
        return false;
    }
    if (n > 2 && !pt_to_number(a[2], &increment, error)) {
        return false;
    }
    if (increment == 0.0) {
        return PT_TYPE_ERROR("range requires a non-zero step");
    }
    zend_long count = zend_dval_to_lval(floor((end - start) / increment)) + 1;
    if (count > PT_RANGE_LIMIT) {
        error->code = "E_RUNTIME_LIMIT";
        error->message = zend_strpprintf(0, "range would produce more than %d elements", PT_RANGE_LIMIT);
        return false;
    }
    pt_list *list = pt_list_new(arena, count > 0 ? (uint32_t)count : 0);
    for (zend_long i = 0; i < count; i++) {
        list->items[i] = pt_number(start + (double)i * increment);
    }
    *result = pt_list_value(list);
    return true;
}

PT_FN(pt_fn_default)
{
    *result = pt_truthy(a[0]) ? a[0] : a[1];
    return true;
}

/* ---- numbers ---- */

typedef struct pt_decimal {
    bool negative;
    pt_buf integer, fraction;
} pt_decimal;

static void pt_zeros(pt_buf *buf, size_t count)
{
    for (size_t i = 0; i < count; i++) {
        pt_buf_addc(buf, '0');
    }
}

/* Positional decimal expansion without exponent. */
static void pt_positional(pt_arena *arena, double value, pt_decimal *decimal)
{
    pt_buf_init(&decimal->integer, arena);
    pt_buf_init(&decimal->fraction, arena);
    decimal->negative = false;
    if (value == 0) {
        pt_buf_addc(&decimal->integer, '0');
        return;
    }
    char digits[32];
    size_t k = 0;
    int exponent = 0;
    pt_shortest_digits(value, &decimal->negative, digits, &k, &exponent);
    if (exponent <= 0) {
        pt_buf_addc(&decimal->integer, '0');
        pt_zeros(&decimal->fraction, (size_t)-exponent);
        pt_buf_add(&decimal->fraction, digits, k);
    } else if ((size_t)exponent >= k) {
        pt_buf_add(&decimal->integer, digits, k);
        pt_zeros(&decimal->integer, (size_t)exponent - k);
    } else {
        pt_buf_add(&decimal->integer, digits, (size_t)exponent);
        pt_buf_add(&decimal->fraction, digits + exponent, k - (size_t)exponent);
    }
}

/* FUN-22: rounds the positional digits half away from zero. */
static void pt_round_decimal(pt_arena *arena, double value, size_t decimals, pt_decimal *decimal)
{
    pt_positional(arena, value, decimal);
    if (decimal->fraction.n <= decimals) {
        pt_zeros(&decimal->fraction, decimals - decimal->fraction.n);
        return;
    }
    bool round_up = decimal->fraction.s[decimals] >= '5';
    pt_buf kept;
    pt_buf_init(&kept, arena);
    pt_buf_add(&kept, decimal->integer.s, decimal->integer.n);
    pt_buf_add(&kept, decimal->fraction.s, decimals);
    pt_s digits = pt_buf_done(&kept);
    char *d = (char *)digits.s;
    size_t length = digits.n;
    if (round_up) {
        size_t index = length;
        bool carry = true;
        while (index > 0 && carry) {
            index--;
            if (d[index] == '9') {
                d[index] = '0';
            } else {
                d[index]++;
                carry = false;
            }
        }
        if (carry) {
            pt_buf grown;
            pt_buf_init(&grown, arena);
            pt_buf_addc(&grown, '1');
            pt_buf_add(&grown, d, length);
            digits = pt_buf_done(&grown);
            d = (char *)digits.s;
            length = digits.n;
        }
    }
    size_t split = length - decimals;
    pt_buf_init(&decimal->integer, arena);
    pt_buf_init(&decimal->fraction, arena);
    if (split == 0) {
        pt_buf_addc(&decimal->integer, '0');
    } else {
        pt_buf_add(&decimal->integer, d, split);
    }
    pt_buf_add(&decimal->fraction, d + split, decimals);
}

static bool pt_decimals_arg(pt_value *a, uint32_t n, const char *name, zend_long *places, pt_function_error *error)
{
    *places = 0;
    if (n > 1 && !pt_to_integer(a[1], places, error)) {
        return false;
    }
    if (*places < 0) {
        return PT_TYPE_ERROR("%s requires a non-negative decimal count", name);
    }
    return true;
}

PT_FN(pt_fn_number)
{
    zend_long places = 0;
    if (!pt_decimals_arg(a, n, "number", &places, error)) {
        return false;
    }
    double value = 0;
    if (!pt_to_number(a[0], &value, error)) {
        return false;
    }
    pt_s point = PT_S("."), thousands = PT_S(",");
    if (n > 2 && !pt_arg_string(a[2], "number", &point, error)) {
        return false;
    }
    if (n > 3 && !pt_arg_string(a[3], "number", &thousands, error)) {
        return false;
    }
    pt_decimal decimal;
    pt_round_decimal(arena, value, (size_t)places, &decimal);
    pt_s integer = pt_buf_done(&decimal.integer);
    pt_s fraction = pt_buf_done(&decimal.fraction);
    bool all_zero = true;
    for (size_t i = 0; i < integer.n; i++) {
        all_zero = all_zero && integer.s[i] == '0';
    }
    for (size_t i = 0; i < fraction.n; i++) {
        all_zero = all_zero && fraction.s[i] == '0';
    }
    pt_buf buf;
    pt_buf_init(&buf, arena);
    if (decimal.negative && !all_zero) {
        pt_buf_addc(&buf, '-');
    }
    size_t head = integer.n % 3 == 0 ? 3 : integer.n % 3;
    pt_buf_add(&buf, integer.s, head);
    for (size_t i = head; i < integer.n; i += 3) {
        pt_buf_adds(&buf, thousands);
        pt_buf_add(&buf, integer.s + i, 3);
    }
    if (places > 0) {
        pt_buf_adds(&buf, point);
        pt_buf_adds(&buf, fraction);
    }
    *result = pt_string(pt_buf_done(&buf));
    return true;
}

PT_FN(pt_fn_round)
{
    zend_long places = 0;
    if (!pt_decimals_arg(a, n, "round", &places, error)) {
        return false;
    }
    double value = 0;
    if (!pt_to_number(a[0], &value, error)) {
        return false;
    }
    pt_decimal decimal;
    pt_round_decimal(arena, value, (size_t)places, &decimal);
    pt_buf text;
    pt_buf_init(&text, arena);
    pt_buf_add(&text, decimal.integer.s, decimal.integer.n);
    if (decimal.fraction.n) {
        pt_buf_addc(&text, '.');
        pt_buf_add(&text, decimal.fraction.s, decimal.fraction.n);
    }
    double rounded = zend_strtod(pt_buf_done(&text).s, NULL);
    *result = pt_number(decimal.negative && rounded != 0 ? -rounded : rounded);
    return true;
}

PT_FN(pt_fn_floor)
{
    double value = 0;
    return pt_to_number(a[0], &value, error) && pt_finite_result(floor(value), result, error);
}

PT_FN(pt_fn_ceil)
{
    double value = 0;
    return pt_to_number(a[0], &value, error) && pt_finite_result(ceil(value), result, error);
}

PT_FN(pt_fn_abs)
{
    double value = 0;
    if (!pt_to_number(a[0], &value, error)) {
        return false;
    }
    *result = pt_number(fabs(value));
    return true;
}

static bool pt_extreme(pt_value *a, uint32_t n, const char *name, bool minimum, pt_value *result, pt_function_error *error)
{
    for (uint32_t i = 0; i < n; i++) {
        if (a[i].type != PT_NUMBER) {
            return pt_type_error(error, zend_strpprintf(0, "%s accepts only numbers", name));
        }
    }
    double best = a[0].u.number;
    for (uint32_t i = 1; i < n; i++) {
        double value = a[i].u.number;
        if (minimum ? value < best : value > best) {
            best = value;
        }
    }
    *result = pt_number(best);
    return true;
}

PT_FN(pt_fn_min) { return pt_extreme(a, n, "min", true, result, error); }
PT_FN(pt_fn_max) { return pt_extreme(a, n, "max", false, result, error); }

PT_FN(pt_fn_num)
{
    double value = 0;
    if (!pt_to_number(a[0], &value, error)) {
        return false;
    }
    *result = pt_number(value);
    return true;
}

/* ---- dates ---- */

static const char *const pt_day_short[] = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
static const char *const pt_day_long[] = {"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"};
static const char *const pt_month_short[] = {"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};
static const char *const pt_month_long[] = {"January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"};

static bool pt_digits(const char *s, size_t count)
{
    for (size_t i = 0; i < count; i++) {
        if (s[i] < '0' || s[i] > '9') {
            return false;
        }
    }
    return true;
}

static int pt_number_of(const char *s, size_t count)
{
    int value = 0;
    for (size_t i = 0; i < count; i++) {
        value = value * 10 + (s[i] - '0');
    }
    return value;
}

/* The length of a text before the end of a PCRE `$`: a final line feed is not part of the match. */
static size_t pt_dollar(pt_s text)
{
    return text.n > 0 && text.s[text.n - 1] == '\n' ? text.n - 1 : text.n;
}

/* The offset in seconds of `Z` or `±HH:MM` in s[0..length). */
static bool pt_offset_at(const char *s, size_t length, zend_long *offset)
{
    if (length == 1 && s[0] == 'Z') {
        *offset = 0;
        return true;
    }
    if (length != 6 || (s[0] != '+' && s[0] != '-') || !pt_digits(s + 1, 2) || s[3] != ':' || !pt_digits(s + 4, 2)) {
        return false;
    }
    int hours = pt_number_of(s + 1, 2), minutes = pt_number_of(s + 4, 2);
    if (hours > 23 || minutes > 59) {
        return false;
    }
    *offset = (s[0] == '-' ? -1 : 1) * (hours * 3600 + minutes * 60);
    return true;
}

/* parseOffset: `Z`, or `±HH:MM` before the end of a PCRE `$`. */
static bool pt_parse_offset(pt_s text, zend_long *offset)
{
    if (text.n == 1 && text.s[0] == 'Z') {
        *offset = 0;
        return true;
    }
    size_t length = pt_dollar(text);
    return length == 6 && pt_offset_at(text.s, length, offset);
}

/* (int) floor($a / $b) of PHP: an exact quotient of integers is an integer, any other a float. */
static zend_long pt_floor_div(zend_long a, zend_long b)
{
    if (a % b == 0) {
        return a / b;
    }
    return zend_dval_to_lval(floor((double)a / (double)b));
}

static zend_long pt_days_from_civil(zend_long year, zend_long month, zend_long day)
{
    zend_long y = month <= 2 ? year - 1 : year;
    zend_long era = pt_floor_div(y, 400);
    zend_long yoe = y - era * 400;
    zend_long mp = (month + 9) % 12;
    zend_long doy = (153 * mp + 2) / 5 + day - 1;
    zend_long doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    return era * 146097 + doe - 719468;
}

static void pt_civil_from_days(zend_long days, zend_long *year, zend_long *month, zend_long *day)
{
    zend_long z = days + 719468;
    zend_long era = pt_floor_div(z, 146097);
    zend_long doe = z - era * 146097;
    zend_long yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    zend_long y = yoe + era * 400;
    zend_long doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    zend_long mp = (5 * doy + 2) / 153;
    *day = doy - (153 * mp + 2) / 5 + 1;
    *month = mp < 10 ? mp + 3 : mp - 9;
    *year = *month <= 2 ? y + 1 : y;
}

static bool pt_not_a_date(pt_s text, pt_function_error *error)
{
    zend_string *quoted = pt_json_quote(text.s, text.n);
    zend_string *message = zend_strpprintf(0, "%s is not a date", ZSTR_VAL(quoted));
    zend_string_release(quoted);
    return pt_type_error(error, message);
}

/* Unix seconds of a date value (FUN-37). */
static bool pt_unix_seconds(pt_value value, zend_long env_offset, zend_long *seconds, pt_function_error *error)
{
    if (value.type == PT_NUMBER) {
        *seconds = pt_truncate(value.u.number);
        return true;
    }
    if (!pt_is_string(value)) {
        return PT_TYPE_ERROR("date requires a number or a string");
    }
    pt_s text = value.u.str;
    size_t length = pt_dollar(text);
    const char *s = text.s;
    /* ^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?(Z|[+-]\d{2}:\d{2})?$ */
    if (length < 10 || !pt_digits(s, 4) || s[4] != '-' || !pt_digits(s + 5, 2) || s[7] != '-' || !pt_digits(s + 8, 2)) {
        return pt_not_a_date(text, error);
    }
    size_t at = 10;
    int hour = 0, minute = 0, second = 0;
    if (at < length && (s[at] == ' ' || s[at] == 'T') && length - at >= 9 && pt_digits(s + at + 1, 2) && s[at + 3] == ':' && pt_digits(s + at + 4, 2) && s[at + 6] == ':' && pt_digits(s + at + 7, 2)) {
        hour = pt_number_of(s + at + 1, 2);
        minute = pt_number_of(s + at + 4, 2);
        second = pt_number_of(s + at + 7, 2);
        at += 9;
    }
    zend_long offset = env_offset;
    if (at < length) {
        bool zone = (length - at == 1 && s[at] == 'Z') || (length - at == 6 && (s[at] == '+' || s[at] == '-') && pt_digits(s + at + 1, 2) && s[at + 3] == ':' && pt_digits(s + at + 4, 2));
        if (!zone) {
            return pt_not_a_date(text, error);
        }
        /* An offset beyond 23:59 matches the text but is no offset; it counts as 0 like (int) null. */
        if (!pt_offset_at(s + at, length - at, &offset)) {
            offset = 0;
        }
    }
    int year = pt_number_of(s, 4), month = pt_number_of(s + 5, 2), day = pt_number_of(s + 8, 2);
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
        return pt_not_a_date(text, error);
    }
    *seconds = pt_days_from_civil(year, month, day) * 86400 + hour * 3600 + minute * 60 + second - offset;
    return true;
}

static void pt_append_number(pt_buf *buf, const char *format, zend_long value)
{
    char text[32];
    int written = snprintf(text, sizeof(text), format, (long long)value);
    pt_buf_add(buf, text, (size_t)written);
}

static pt_s pt_format_date(pt_arena *arena, zend_long seconds, pt_s format, zend_long offset)
{
    zend_long local = seconds + offset;
    zend_long days = pt_floor_div(local, 86400);
    zend_long second_of_day = local - days * 86400;
    zend_long year = 0, month = 0, day = 0;
    pt_civil_from_days(days, &year, &month, &day);
    zend_long hour = second_of_day / 3600;
    zend_long minute = (second_of_day % 3600) / 60;
    zend_long second = second_of_day % 60;
    zend_long weekday = ((days % 7) + 11) % 7;
    zend_long magnitude = offset < 0 ? -offset : offset;
    pt_buf buf;
    pt_buf_init(&buf, arena);
    for (size_t i = 0; i < format.n; i++) {
        char c = format.s[i];
        switch (c) {
            case '\\':
                if (i + 1 < format.n) {
                    pt_buf_addc(&buf, format.s[i + 1]);
                }
                i++;
                break;
            case 'Y': pt_append_number(&buf, "%04lld", year); break;
            case 'y': pt_append_number(&buf, "%02lld", year % 100); break;
            case 'm': pt_append_number(&buf, "%02lld", month); break;
            case 'n': pt_append_number(&buf, "%lld", month); break;
            case 'd': pt_append_number(&buf, "%02lld", day); break;
            case 'j': pt_append_number(&buf, "%lld", day); break;
            case 'H': pt_append_number(&buf, "%02lld", hour); break;
            case 'G': pt_append_number(&buf, "%lld", hour); break;
            case 'i': pt_append_number(&buf, "%02lld", minute); break;
            case 's': pt_append_number(&buf, "%02lld", second); break;
            case 'D': pt_buf_add(&buf, pt_day_short[weekday], strlen(pt_day_short[weekday])); break;
            case 'l': pt_buf_add(&buf, pt_day_long[weekday], strlen(pt_day_long[weekday])); break;
            case 'N': pt_append_number(&buf, "%lld", weekday == 0 ? 7 : weekday); break;
            case 'w': pt_append_number(&buf, "%lld", weekday); break;
            case 'M': pt_buf_add(&buf, pt_month_short[month - 1], strlen(pt_month_short[month - 1])); break;
            case 'F': pt_buf_add(&buf, pt_month_long[month - 1], strlen(pt_month_long[month - 1])); break;
            case 'U': pt_append_number(&buf, "%lld", seconds); break;
            case 'P': {
                char text[16];
                int written = snprintf(text, sizeof(text), "%c%02lld:%02lld", offset < 0 ? '-' : '+', (long long)(magnitude / 3600), (long long)((magnitude % 3600) / 60));
                pt_buf_add(&buf, text, (size_t)written);
                break;
            }
            default: pt_buf_addc(&buf, c);
        }
    }
    return pt_buf_done(&buf);
}

PT_FN(pt_fn_date)
{
    if (a[0].type == PT_NULL) {
        *result = pt_string(PT_S(""));
        return true;
    }
    zend_long offset = 0;
    if (!pt_parse_offset(env->timezone, &offset)) {
        zend_string *quoted = pt_json_quote(env->timezone.s, env->timezone.n);
        zend_string *message = zend_strpprintf(0, "%s is not a time zone offset", ZSTR_VAL(quoted));
        zend_string_release(quoted);
        return pt_type_error(error, message);
    }
    zend_long seconds = 0;
    if (!pt_unix_seconds(a[0], offset, &seconds, error)) {
        return false;
    }
    pt_s format = {NULL, 0};
    if (!pt_arg_string(a[1], "date", &format, error)) {
        return false;
    }
    *result = pt_string(pt_format_date(arena, seconds, format, offset));
    return true;
}

PT_FN(pt_fn_now)
{
    *result = pt_number(env->now);
    return true;
}

/* ---- table ---- */

#define PT_MANY UINT32_MAX

static const pt_builtin pt_builtins[] = {
    {"escape", 1, 1, pt_fn_escape},
    {"raw", 1, 1, pt_fn_raw},
    {"json", 1, 1, pt_fn_json},
    {"url", 1, 1, pt_fn_url},
    {"nl2br", 1, 1, pt_fn_nl2br},
    {"str", 1, 1, pt_fn_str},
    {"type", 1, 1, pt_fn_type},
    {"upper", 1, 1, pt_fn_upper},
    {"lower", 1, 1, pt_fn_lower},
    {"trim", 1, 2, pt_fn_trim},
    {"replace", 3, 3, pt_fn_replace},
    {"split", 2, 2, pt_fn_split},
    {"truncate", 2, 3, pt_fn_truncate},
    {"contains", 2, 2, pt_fn_contains},
    {"starts_with", 2, 2, pt_fn_starts_with},
    {"ends_with", 2, 2, pt_fn_ends_with},
    {"length", 1, 1, pt_fn_length},
    {"keys", 1, 1, pt_fn_keys},
    {"values", 1, 1, pt_fn_values},
    {"first", 1, 1, pt_fn_first},
    {"last", 1, 1, pt_fn_last},
    {"reverse", 1, 1, pt_fn_reverse},
    {"slice", 2, 3, pt_fn_slice},
    {"sort", 1, 2, pt_fn_sort},
    {"join", 1, 2, pt_fn_join},
    {"range", 2, 3, pt_fn_range},
    {"default", 2, 2, pt_fn_default},
    {"number", 1, 4, pt_fn_number},
    {"round", 1, 2, pt_fn_round},
    {"floor", 1, 1, pt_fn_floor},
    {"ceil", 1, 1, pt_fn_ceil},
    {"abs", 1, 1, pt_fn_abs},
    {"min", 1, PT_MANY, pt_fn_min},
    {"max", 1, PT_MANY, pt_fn_max},
    {"num", 1, 1, pt_fn_num},
    {"date", 2, 2, pt_fn_date},
    {"now", 0, 0, pt_fn_now},
};

const pt_builtin *pt_builtin_find(const char *name, size_t length)
{
    for (size_t i = 0; i < sizeof(pt_builtins) / sizeof(pt_builtins[0]); i++) {
        if (strlen(pt_builtins[i].name) == length && memcmp(pt_builtins[i].name, name, length) == 0) {
            return &pt_builtins[i];
        }
    }
    return NULL;
}
