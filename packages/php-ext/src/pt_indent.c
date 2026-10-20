/*
 * Format\Indent: the edits that set the indentation of the lines of a template, by the nesting of HTML elements and
 * template blocks, or the tag where the HTML structure fails. A byte-for-byte port of packages/php/src/Format/Indent.php:
 * the scan reads the structure into steps (a change of depth at an offset, with `dedent` for a tag that takes one level
 * from its own line) and ranges (the line starts that keep their indentation, and the HTML tags that span lines); the
 * lines then take the depth of their start.
 */
#include "pt.h"
#include <string.h>

/* The names of the library's constants, as ASCII strings. */
static const char *const pt_indent_void[] = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
};
static const char *const pt_indent_raw[] = {"script", "style", "textarea"};
static const char *const pt_indent_kept[] = {"pre", "script", "style", "textarea"};
static const char *const pt_indent_open_block[] = {"if", "for", "ifblock"};
static const char *const pt_indent_branch[] = {"elseif", "else"};

#define PT_INDENT_IN(value, list) pt_indent_in((value), (list), sizeof(list) / sizeof((list)[0]))
#define PT_INDENT_ITEMS(type, vec) ((type *)(vec).items)

typedef struct pt_indent_tag {
    pt_s kind;
    zend_long start;
    zend_long end;
} pt_indent_tag;

typedef struct pt_indent_range {
    zend_long start;
    zend_long end;
} pt_indent_range;

/* An open HTML element, or a name of one in a snapshot of the open elements. */
typedef struct pt_indent_element {
    pt_s name;
    zend_long start;
} pt_indent_element;

typedef struct pt_indent_step {
    zend_long index;
    zend_long delta;
    bool dedent;
    uint32_t order;
} pt_indent_step;

/* A template block: the open elements at its start, and the open elements at the end of its branches. */
typedef struct pt_indent_block {
    pt_indent_element *start;
    uint32_t start_count;
    pt_indent_element *branch_end;
    uint32_t branch_end_count;
    bool has_branch_end;
    bool has_else;
} pt_indent_block;

/* A growable array in the arena: a full array is copied to a block of twice the capacity. */
typedef struct pt_indent_vec {
    void *items;
    uint32_t count;
    uint32_t capacity;
} pt_indent_vec;

/* The state of one scan. */
typedef struct pt_indent_scan {
    pt_arena *arena;
    pt_s text;
    const pt_indent_tag *tags;
    uint32_t tag_count;
    uint32_t next;
    bool counted;
    pt_indent_vec steps;
    pt_indent_vec kept;
    pt_indent_vec inside;
    pt_indent_vec elements;
    pt_indent_vec blocks;
} pt_indent_scan;

/* The failure of a scan: the offset of the tag and the message (owned by the caller once set). */
typedef struct pt_indent_error {
    zend_long index;
    zend_string *message;
} pt_indent_error;

static bool pt_indent_in(pt_s value, const char *const *list, size_t count)
{
    for (size_t i = 0; i < count; i++) {
        if (pt_eq(value, list[i], strlen(list[i]))) {
            return true;
        }
    }

    return false;
}

static void *pt_indent_push(pt_arena *arena, pt_indent_vec *vec, size_t size)
{
    if (vec->count == vec->capacity) {
        uint32_t capacity = vec->capacity == 0 ? 8 : vec->capacity * 2;
        void *items = pt_alloc(arena, size * capacity);
        if (vec->count > 0) {
            memcpy(items, vec->items, size * vec->count);
        }
        vec->items = items;
        vec->capacity = capacity;
    }

    return (char *)vec->items + size * vec->count++;
}

static void pt_indent_add_step(pt_indent_scan *scan, zend_long index, zend_long delta, bool dedent)
{
    pt_indent_step *step = pt_indent_push(scan->arena, &scan->steps, sizeof(pt_indent_step));
    step->index = index;
    step->delta = delta;
    step->dedent = dedent;
    step->order = scan->steps.count - 1;
}

/* A copy of the open elements, so that a later change of the stack does not change it. */
static pt_indent_element *pt_indent_snapshot(pt_arena *arena, const pt_indent_vec *elements)
{
    pt_indent_element *copy = pt_alloc(arena, sizeof(pt_indent_element) * (elements->count + 1));
    if (elements->count > 0) {
        memcpy(copy, elements->items, sizeof(pt_indent_element) * elements->count);
    }

    return copy;
}

static bool pt_indent_same_names(const pt_indent_element *left, uint32_t left_count, const pt_indent_element *right, uint32_t right_count)
{
    if (left_count != right_count) {
        return false;
    }
    for (uint32_t i = 0; i < left_count; i++) {
        if (!pt_eq(left[i].name, right[i].name.s, right[i].name.n)) {
            return false;
        }
    }

    return true;
}

static bool pt_indent_any_name_in(const pt_indent_vec *elements, const char *const *list, size_t count)
{
    const pt_indent_element *items = PT_INDENT_ITEMS(pt_indent_element, *elements);
    for (uint32_t i = 0; i < elements->count; i++) {
        if (pt_indent_in(items[i].name, list, count)) {
            return true;
        }
    }

    return false;
}

static bool pt_indent_within(const pt_indent_vec *ranges, zend_long index)
{
    const pt_indent_range *items = PT_INDENT_ITEMS(pt_indent_range, *ranges);
    for (uint32_t i = 0; i < ranges->count; i++) {
        if (items[i].start < index && index < items[i].end) {
            return true;
        }
    }

    return false;
}

/* strtolower of an element name: the names are ASCII letters, digits and hyphens. */
static pt_s pt_indent_lower(pt_arena *arena, const char *bytes, size_t length)
{
    char *copy = pt_alloc(arena, length + 1);
    for (size_t i = 0; i < length; i++) {
        char c = bytes[i];
        copy[i] = (c >= 'A' && c <= 'Z') ? (char)(c + 32) : c;
    }

    return (pt_s){copy, length};
}

static bool pt_indent_is_letter(char c)
{
    return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
}

static bool pt_indent_is_name_char(char c)
{
    return pt_indent_is_letter(c) || (c >= '0' && c <= '9') || c == '-';
}

/* Whether the text at `position` is "</" and then the raw element name in lower case, the length included. */
static bool pt_indent_raw_close_at(pt_s text, zend_long position, pt_s raw)
{
    zend_long length = (zend_long)text.n - position;
    if (length < (zend_long)raw.n + 2 || text.s[position + 1] != '/') {
        return false;
    }
    for (size_t i = 0; i < raw.n; i++) {
        char c = text.s[position + 2 + i];
        if (c >= 'A' && c <= 'Z') {
            c = (char)(c + 32);
        }
        if (c != raw.s[i]) {
            return false;
        }
    }

    return true;
}

/* The offset from which a change of depth applies to the line of a tag: the line start less one (the newline before
 * it) when the tag starts its line after horizontal space only, else the offset of the tag. */
static zend_long pt_indent_before_line(pt_s text, zend_long index)
{
    zend_long limit = index < (zend_long)text.n ? index : (zend_long)text.n;
    zend_long line_start = 0;
    if (index > 0) {
        for (zend_long i = limit - 1; i >= 0; i--) {
            if (text.s[i] == '\n') {
                line_start = i + 1;
                break;
            }
        }
    }
    for (zend_long i = line_start; i < limit; i++) {
        if (text.s[i] != ' ' && text.s[i] != '\t') {
            return index;
        }
    }

    return line_start - 1;
}

/* Template tags are opaque to the HTML scan; block tags open, branch and close template blocks. Every branch of a block
 * must end with the same open HTML elements, and a block without an else branch with those of its start. */
static bool pt_indent_template_tag(pt_indent_scan *scan, const pt_indent_tag *tag, pt_indent_error *error)
{
    pt_indent_range *kept = pt_indent_push(scan->arena, &scan->kept, sizeof(pt_indent_range));
    kept->start = tag->start;
    kept->end = tag->end;

    if (PT_INDENT_IN(tag->kind, pt_indent_open_block)) {
        pt_indent_block *opened = pt_indent_push(scan->arena, &scan->blocks, sizeof(pt_indent_block));
        opened->start = pt_indent_snapshot(scan->arena, &scan->elements);
        opened->start_count = scan->elements.count;
        opened->branch_end = NULL;
        opened->branch_end_count = 0;
        opened->has_branch_end = false;
        opened->has_else = false;
        if (scan->counted) {
            pt_indent_add_step(scan, tag->end, 1, false);
        }

        return true;
    }
    if (!PT_INDENT_IN(tag->kind, pt_indent_branch) && !PT_EQ(tag->kind, "close")) {
        return true;
    }
    if (scan->blocks.count == 0) {
        return true;
    }

    pt_indent_block *last = &PT_INDENT_ITEMS(pt_indent_block, scan->blocks)[scan->blocks.count - 1];
    pt_indent_block block = *last;
    if (block.has_branch_end && !pt_indent_same_names(block.branch_end, block.branch_end_count, PT_INDENT_ITEMS(pt_indent_element, scan->elements), scan->elements.count)) {
        error->index = tag->start;
        error->message = zend_string_init(ZEND_STRL("the HTML elements open at the end of this branch differ from those of the first branch"), 0);
        return false;
    }

    if (PT_EQ(tag->kind, "close")) {
        if (!block.has_else && !pt_indent_same_names(block.start, block.start_count, PT_INDENT_ITEMS(pt_indent_element, scan->elements), scan->elements.count)) {
            error->index = tag->start;
            error->message = zend_string_init(ZEND_STRL("a template block without an else branch must end with the HTML elements open at its start"), 0);
            return false;
        }
        scan->blocks.count--;
        // The close tag aligns with the start of its block; the elements that every branch opened apply after it.
        zend_long opened = (zend_long)scan->elements.count - (zend_long)block.start_count;
        if (opened != 0) {
            pt_indent_add_step(scan, pt_indent_before_line(scan->text, tag->start), -opened, false);
            pt_indent_add_step(scan, tag->end, opened, false);
        }
        if (scan->counted) {
            pt_indent_add_step(scan, tag->start, -1, true);
        }

        return true;
    }

    last->branch_end = pt_indent_snapshot(scan->arena, &scan->elements);
    last->branch_end_count = scan->elements.count;
    last->has_branch_end = true;
    if (PT_EQ(tag->kind, "else")) {
        last->has_else = true;
    }
    // The next branch starts from the elements open at the start of the block.
    pt_indent_add_step(scan, pt_indent_before_line(scan->text, tag->start), (zend_long)block.start_count - (zend_long)scan->elements.count, false);
    scan->elements.count = 0;
    for (uint32_t i = 0; i < block.start_count; i++) {
        *(pt_indent_element *)pt_indent_push(scan->arena, &scan->elements, sizeof(pt_indent_element)) = block.start[i];
    }
    if (scan->counted) {
        pt_indent_add_step(scan, tag->start, 0, true);
    }

    return true;
}

/* Moves past one HTML tag from the `<` at `start`, reading the template tags inside it; `end` is the offset after `>`. */
static bool pt_indent_html_tag_end(pt_indent_scan *scan, zend_long start, zend_long *end, pt_indent_error *error)
{
    pt_s text = scan->text;
    zend_long length = (zend_long)text.n;
    int quote = 0;
    zend_long quote_start = 0;
    zend_long index = start + 1;
    while (index < length) {
        if (scan->next < scan->tag_count && scan->tags[scan->next].start == index) {
            const pt_indent_tag *tag = &scan->tags[scan->next];
            if (!pt_indent_template_tag(scan, tag, error)) {
                return false;
            }
            scan->next++;
            index = tag->end;
            continue;
        }
        char character = text.s[index];
        if (quote != 0) {
            if (character == quote) {
                pt_indent_range *kept = pt_indent_push(scan->arena, &scan->kept, sizeof(pt_indent_range));
                kept->start = quote_start;
                kept->end = index;
                quote = 0;
            }
        } else if (character == '"' || character == '\'') {
            quote = character;
            quote_start = index;
        } else if (character == '>') {
            *end = index + 1;
            return true;
        }
        index++;
    }

    error->index = start;
    error->message = zend_string_init(ZEND_STRL("the HTML tag is not closed with \">\""), 0);
    return false;
}

static int pt_indent_step_compare(const void *left, const void *right)
{
    const pt_indent_step *a = left;
    const pt_indent_step *b = right;
    if (a->index != b->index) {
        return a->index < b->index ? -1 : 1;
    }

    return a->order < b->order ? -1 : (a->order > b->order ? 1 : 0);
}

/* Reads the structure of the text into steps and ranges; the steps are sorted by offset, stable. */
static bool pt_indent_scan_text(pt_indent_scan *scan, pt_indent_error *error)
{
    pt_s text = scan->text;
    zend_long length = (zend_long)text.n;
    bool has_raw = false;
    pt_s raw = {NULL, 0};
    bool has_kept_start = false;
    zend_long kept_start = 0;
    zend_long position = 0;
    while (position < length) {
        if (scan->next < scan->tag_count && scan->tags[scan->next].start == position) {
            const pt_indent_tag *tag = &scan->tags[scan->next];
            if (!pt_indent_template_tag(scan, tag, error)) {
                return false;
            }
            scan->next++;
            position = tag->end;
            continue;
        }
        if (text.s[position] != '<') {
            position++;
            continue;
        }
        if (has_raw && !pt_indent_raw_close_at(text, position, raw)) {
            position++;
            continue;
        }
        if (length - position >= 4 && memcmp(text.s + position, "<!--", 4) == 0) {
            zend_long end = length;
            for (zend_long i = position + 4; i + 3 <= length; i++) {
                if (memcmp(text.s + i, "-->", 3) == 0) {
                    end = i + 3;
                    break;
                }
            }
            pt_indent_range *kept = pt_indent_push(scan->arena, &scan->kept, sizeof(pt_indent_range));
            kept->start = position;
            kept->end = end;
            // Template tags inside an HTML comment are still template tags; the comment keeps its lines.
            while (scan->next < scan->tag_count && scan->tags[scan->next].start < end) {
                const pt_indent_tag *tag = &scan->tags[scan->next++];
                if (!pt_indent_template_tag(scan, tag, error)) {
                    return false;
                }
            }
            position = end;
            continue;
        }
        int second = position + 1 < length ? text.s[position + 1] : -1;
        if (second == '!' || second == '?') {
            zend_long end;
            if (!pt_indent_html_tag_end(scan, position, &end, error)) {
                return false;
            }
            position = end;
            continue;
        }

        // The tag name, matched as ^<(/?)([A-Za-z][A-Za-z0-9-]*) on at most 64 bytes.
        zend_long window = length - position < 64 ? length - position : 64;
        const char *w = text.s + position;
        zend_long index = 1;
        bool closing = false;
        if (index < window && w[index] == '/') {
            closing = true;
            index++;
        }
        if (index >= window || !pt_indent_is_letter(w[index])) {
            position++;
            continue;
        }
        zend_long name_start = index;
        index++;
        while (index < window && pt_indent_is_name_char(w[index])) {
            index++;
        }
        pt_s name = pt_indent_lower(scan->arena, w + name_start, (size_t)(index - name_start));

        zend_long end;
        if (!pt_indent_html_tag_end(scan, position, &end, error)) {
            return false;
        }
        if (memchr(text.s + position, '\n', (size_t)(end - position)) != NULL) {
            pt_indent_range *inside = pt_indent_push(scan->arena, &scan->inside, sizeof(pt_indent_range));
            inside->start = position;
            inside->end = end;
        }

        if (closing) {
            if (PT_INDENT_IN(name, pt_indent_void)) {
                position = end;
                continue;
            }
            if (scan->elements.count == 0) {
                error->index = position;
                error->message = zend_strpprintf(0, "the end tag </%.*s> has no open element", (int)name.n, name.s);
                return false;
            }
            const pt_indent_element *open = &PT_INDENT_ITEMS(pt_indent_element, scan->elements)[scan->elements.count - 1];
            if (!pt_eq(open->name, name.s, name.n)) {
                error->index = position;
                error->message = zend_strpprintf(0, "the end tag </%.*s> does not match the open element <%.*s>", (int)name.n, name.s, (int)open->name.n, open->name.s);
                return false;
            }
            pt_indent_add_step(scan, position, -1, true);
            scan->elements.count--;
            if (PT_INDENT_IN(name, pt_indent_kept) && !pt_indent_any_name_in(&scan->elements, pt_indent_kept, sizeof(pt_indent_kept) / sizeof(pt_indent_kept[0])) && has_kept_start) {
                zend_long newline = length;
                const char *found = memchr(text.s + position, '\n', (size_t)(length - position));
                if (found != NULL) {
                    newline = found - text.s;
                }
                pt_indent_range *kept = pt_indent_push(scan->arena, &scan->kept, sizeof(pt_indent_range));
                kept->start = kept_start;
                kept->end = newline;
                has_kept_start = false;
            }
            has_raw = false;
            position = end;
            continue;
        }

        bool self_closing = end >= 2 && text.s[end - 2] == '/';
        if (!PT_INDENT_IN(name, pt_indent_void) && !self_closing) {
            pt_indent_element *element = pt_indent_push(scan->arena, &scan->elements, sizeof(pt_indent_element));
            element->name = name;
            element->start = position;
            pt_indent_add_step(scan, end, 1, false);
            if (PT_INDENT_IN(name, pt_indent_kept) && !has_kept_start) {
                has_kept_start = true;
                kept_start = end;
            }
            if (PT_INDENT_IN(name, pt_indent_raw)) {
                has_raw = true;
                raw = name;
            }
        }
        position = end;
    }

    if (scan->elements.count > 0) {
        const pt_indent_element *open = &PT_INDENT_ITEMS(pt_indent_element, scan->elements)[scan->elements.count - 1];
        error->index = open->start;
        error->message = zend_strpprintf(0, "the element <%.*s> is not closed", (int)open->name.n, open->name.s);
        return false;
    }
    if (scan->steps.count > 1) {
        qsort(scan->steps.items, scan->steps.count, sizeof(pt_indent_step), pt_indent_step_compare);
    }

    return true;
}

/* Lines and edits (Indent::lines and the loop of Indent::edits): every line that does not keep its indentation gets
 * the indentation of its depth, and an edit when its current indentation differs. The depth of a line is the sum of the
 * steps before its start; a line that starts with a dedent tag takes one level less. */
static void pt_indent_lines(pt_indent_scan *scan, pt_s unit, bool has_range, zend_long range_start, zend_long range_end, zval *edits)
{
    pt_s text = scan->text;
    zend_long length = (zend_long)text.n;
    const pt_indent_step *steps = PT_INDENT_ITEMS(pt_indent_step, scan->steps);
    uint32_t step_count = scan->steps.count;
    uint32_t step = 0;
    uint32_t dedent_cursor = 0;
    zend_long depth = 0;
    zend_long line_start = 0;
    for (;;) {
        while (step < step_count && steps[step].index < line_start) {
            depth += steps[step].delta;
            step++;
        }
        zend_long first = line_start;
        while (first < length && (text.s[first] == ' ' || text.s[first] == '\t')) {
            first++;
        }
        if (!pt_indent_within(&scan->kept, line_start)) {
            bool blank = first == length || text.s[first] == '\n' || text.s[first] == '\r';
            while (dedent_cursor < step_count && steps[dedent_cursor].index < first) {
                dedent_cursor++;
            }
            bool dedents = false;
            for (uint32_t k = dedent_cursor; k < step_count && steps[k].index == first; k++) {
                if (steps[k].dedent) {
                    dedents = true;
                    break;
                }
            }
            zend_long level = depth + (pt_indent_within(&scan->inside, line_start) ? 1 : 0);
            if (dedents) {
                level--;
            }
            // The formatter empties a blank line.
            zend_long repeat = blank || level < 0 ? 0 : level;
            size_t indentation_length = unit.n * (size_t)repeat;
            char *indentation = pt_alloc(scan->arena, indentation_length + 1);
            for (zend_long k = 0; k < repeat; k++) {
                memcpy(indentation + k * unit.n, unit.s, unit.n);
            }
            bool in_range = !has_range || !(line_start < range_start || line_start >= range_end);
            size_t current_length = (size_t)(first - line_start);
            if (in_range && !(current_length == indentation_length && memcmp(text.s + line_start, indentation, indentation_length) == 0)) {
                zval edit;
                array_init(&edit);
                add_assoc_long_ex(&edit, ZEND_STRL("start"), line_start);
                add_assoc_long_ex(&edit, ZEND_STRL("end"), first);
                add_assoc_stringl_ex(&edit, ZEND_STRL("text"), indentation, indentation_length);
                add_next_index_zval(edits, &edit);
            }
        }
        const char *newline = memchr(text.s + line_start, '\n', (size_t)(length - line_start));
        if (newline == NULL) {
            break;
        }
        line_start = (newline - text.s) + 1;
    }
}

/* Reads one tag of the list: the kind is a string, the offsets are ints. */
static bool pt_indent_read_tag(HashTable *tag, pt_indent_tag *out)
{
    zval *kind = zend_hash_str_find(tag, ZEND_STRL("kind"));
    if (kind == NULL) {
        return false;
    }
    ZVAL_DEREF(kind);
    if (Z_TYPE_P(kind) != IS_STRING) {
        return false;
    }
    out->kind = (pt_s){Z_STRVAL_P(kind), Z_STRLEN_P(kind)};

    return pt_tag_int(tag, "start", &out->start) && pt_tag_int(tag, "end", &out->end);
}

/* Indent::__construct, private: the class has no instances, its methods are static. */
ZEND_METHOD(Polyspec_Template_Format_Indent, __construct)
{
    ZEND_PARSE_PARAMETERS_START(3, 3)
    ZEND_PARSE_PARAMETERS_END();
}

/* Indent::edits: the edits of the lines, or the error of the structure. */
ZEND_METHOD(Polyspec_Template_Format_Indent, edits)
{
    zend_string *text_string, *unit_string, *blocks_string;
    HashTable *tags;
    HashTable *range = NULL;
    ZEND_PARSE_PARAMETERS_START(5, 5)
        Z_PARAM_STR(text_string)
        Z_PARAM_ARRAY_HT(tags)
        Z_PARAM_STR(unit_string)
        Z_PARAM_STR(blocks_string)
        Z_PARAM_ARRAY_HT_OR_NULL(range)
    ZEND_PARSE_PARAMETERS_END();

    pt_arena arena;
    pt_arena_init(&arena);
    uint32_t tag_count = zend_hash_num_elements(tags);
    pt_indent_tag *items = pt_alloc(&arena, sizeof(pt_indent_tag) * (tag_count + 1));
    uint32_t count = 0;
    zval *value;
    ZEND_HASH_FOREACH_VAL(tags, value) {
        ZVAL_DEREF(value);
        if (Z_TYPE_P(value) != IS_ARRAY || !pt_indent_read_tag(Z_ARRVAL_P(value), &items[count])) {
            pt_arena_free(&arena);
            zend_type_error("Polyspec\\Template\\Format\\Indent::edits(): each tag must be an array with a string kind and int start and end");
            RETURN_THROWS();
        }
        if (items[count].start < 0 || items[count].end < 0) {
            pt_arena_free(&arena);
            zend_value_error("Polyspec\\Template\\Format\\Indent::edits(): the offsets of a tag must not be negative");
            RETURN_THROWS();
        }
        count++;
    } ZEND_HASH_FOREACH_END();

    bool has_range = range != NULL;
    zend_long range_start = 0;
    zend_long range_end = 0;
    if (has_range && !(pt_tag_int(range, "start", &range_start) && pt_tag_int(range, "end", &range_end))) {
        pt_arena_free(&arena);
        zend_type_error("Polyspec\\Template\\Format\\Indent::edits(): the range must be null or an array with int start and end");
        RETURN_THROWS();
    }

    pt_indent_scan scan;
    memset(&scan, 0, sizeof(scan));
    scan.arena = &arena;
    scan.text = (pt_s){ZSTR_VAL(text_string), ZSTR_LEN(text_string)};
    scan.tags = items;
    scan.tag_count = count;
    scan.counted = zend_string_equals_literal(blocks_string, "indent");

    pt_indent_error error = {0, NULL};
    if (!pt_indent_scan_text(&scan, &error)) {
        pt_arena_free(&arena);
        array_init(return_value);
        zval detail;
        array_init(&detail);
        add_assoc_long_ex(&detail, ZEND_STRL("index"), error.index);
        add_assoc_str_ex(&detail, ZEND_STRL("message"), error.message);
        add_assoc_zval_ex(return_value, ZEND_STRL("error"), &detail);
        return;
    }

    zval edits;
    array_init(&edits);
    pt_indent_lines(&scan, (pt_s){ZSTR_VAL(unit_string), ZSTR_LEN(unit_string)}, has_range, range_start, range_end, &edits);
    pt_arena_free(&arena);
    array_init(return_value);
    add_assoc_zval_ex(return_value, ZEND_STRL("edits"), &edits);
}
