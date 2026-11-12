/*
 * The classes Ast, Parser\Scanner and Parser\Standalone of the PHP package. The tag scanner and the standalone line
 * groups are the functions of pt_parse.c that the parser itself uses; the AST helpers give the node shape and the
 * canonical JSON of an AST (AST-7, AST-10).
 */
#include "pt.h"
#include "ext/json/php_json.h"

#define PT_LOOP_META_COUNT 6

static const char *const pt_loop_meta_fields[PT_LOOP_META_COUNT] = {"index_", "key_", "value_", "last_", "first_", "size_"};

/* ----------------------------------------------------------------------------------------------- */
/* Constants: arrays are immutable and persistent, declared at module start (as                     */
/* RuntimeEnvironment::DEFAULT_LIMITS), since gen_stub does not take an array constant.            */
/* ----------------------------------------------------------------------------------------------- */

static HashTable *pt_persistent_table(uint32_t size)
{
    HashTable *table = pemalloc(sizeof(HashTable), 1);
    zend_hash_init(table, size, NULL, NULL, 1);
    return table;
}

static void pt_persistent_string(HashTable *table, const char *bytes)
{
    zval value;
    ZVAL_STR(&value, zend_string_init_interned(bytes, strlen(bytes), 1));
    zend_hash_next_index_insert(table, &value);
}

/* Makes the table an immutable array value. */
static void pt_immutable_array(zval *value, HashTable *table)
{
    GC_SET_REFCOUNT(table, 2);
    GC_ADD_FLAGS(table, IS_ARRAY_IMMUTABLE);
    ZVAL_ARR(value, table);
    Z_TYPE_INFO_P(value) = IS_ARRAY;
}

static void pt_declare_array_constant(zend_class_entry *ce, const char *name, HashTable *table)
{
    zval value;
    pt_immutable_array(&value, table);
    zend_declare_class_constant_ex(ce, zend_string_init_interned(name, strlen(name), 1), &value, ZEND_ACC_PUBLIC, NULL);
}

void pt_ast_declare_constants(zend_class_entry *ce)
{
    HashTable *fields = pt_persistent_table(PT_LOOP_META_COUNT);
    for (size_t i = 0; i < PT_LOOP_META_COUNT; i++) {
        pt_persistent_string(fields, pt_loop_meta_fields[i]);
    }
    pt_declare_array_constant(ce, "LOOP_META_FIELDS", fields);
}

void pt_scanner_declare_constants(zend_class_entry *ce)
{
    HashTable *sigils = pt_persistent_table(PT_SIGIL_COUNT);
    for (size_t i = 0; i < PT_SIGIL_COUNT; i++) {
        pt_persistent_string(sigils, pt_sigils[i]);
    }
    pt_declare_array_constant(ce, "SIGILS", sigils);

    HashTable *wrappers = pt_persistent_table(PT_WRAPPER_COUNT);
    for (size_t w = 0; w < PT_WRAPPER_COUNT; w++) {
        HashTable *pair = pt_persistent_table(2);
        pt_persistent_string(pair, pt_wrappers[w][0]);
        pt_persistent_string(pair, pt_wrappers[w][1]);
        zval item;
        pt_immutable_array(&item, pair);
        zend_hash_next_index_insert(wrappers, &item);
    }
    pt_declare_array_constant(ce, "WRAPPERS", wrappers);
}

/* ----------------------------------------------------------------------------------------------- */
/* Ast                                                                                              */
/* ----------------------------------------------------------------------------------------------- */

void pt_ast_is_loop_meta_field(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *name;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(name)
    ZEND_PARSE_PARAMETERS_END();
    for (size_t i = 0; i < PT_LOOP_META_COUNT; i++) {
        if (zend_string_equals_cstr(name, pt_loop_meta_fields[i], strlen(pt_loop_meta_fields[i]))) {
            RETURN_TRUE;
        }
    }
    RETURN_FALSE;
}

/* ['type' => $type, ...$fields, 'span' => [$start, $end]]: a field with the key of an earlier entry replaces its value
 * in place, and an integer key is appended, as the spread of PHP does. */
void pt_ast_node(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *type;
    HashTable *fields;
    zend_long start, end;
    ZEND_PARSE_PARAMETERS_START(4, 4)
        Z_PARAM_STR(type)
        Z_PARAM_ARRAY_HT(fields)
        Z_PARAM_LONG(start)
        Z_PARAM_LONG(end)
    ZEND_PARSE_PARAMETERS_END();
    array_init(return_value);
    add_assoc_str_ex(return_value, "type", 4, zend_string_copy(type));
    zend_string *key;
    zend_ulong index;
    zval *value;
    ZEND_HASH_FOREACH_KEY_VAL(fields, index, key, value) {
        zval copy;
        ZVAL_COPY(&copy, value);
        if (key == NULL) {
            (void)index; /* an integer key is appended, not kept */
            zend_hash_next_index_insert(Z_ARRVAL_P(return_value), &copy);
        } else {
            zend_hash_update(Z_ARRVAL_P(return_value), key, &copy);
        }
    } ZEND_HASH_FOREACH_END();
    zval span;
    array_init(&span);
    add_next_index_long(&span, start);
    add_next_index_long(&span, end);
    add_assoc_zval_ex(return_value, "span", 4, &span);
}

static bool pt_canonical_json(smart_str *out, zval *value);

/* json_encode of a string with the given options; a string that does not encode writes nothing, as (string) false. */
static void pt_append_json_string(smart_str *out, zend_string *text, int options)
{
    zval value;
    ZVAL_STR(&value, text);
    smart_str json = {0};
    if (php_json_encode(&json, &value, options) == SUCCESS && json.s != NULL) {
        smart_str_append(out, json.s);
    }
    smart_str_free(&json);
}

/* json_encode of a float, as the library writes it: an integral float within the safe range as an integer. */
static void pt_append_json_double(smart_str *out, zval *value)
{
    double number = Z_DVAL_P(value);
    if (pt_is_integer(number) && fabs(number) <= PT_MAX_SAFE) {
        smart_str_append_long(out, (zend_long)number);
        return;
    }
    smart_str json = {0};
    if (php_json_encode(&json, value, 0) == SUCCESS && json.s != NULL) {
        smart_str_append(out, json.s);
    }
    smart_str_free(&json);
}

/* Ast::toJson: the canonical JSON of nested arrays. A list (array_is_list) is written as an array, anything else as
 * an object whose keys are written as json_encode writes the string of the key. */
static bool pt_canonical_json(smart_str *out, zval *value)
{
    ZVAL_DEREF(value);
    switch (Z_TYPE_P(value)) {
        case IS_NULL:
            smart_str_appendl(out, "null", 4);
            return true;
        case IS_FALSE:
            smart_str_appendl(out, "false", 5);
            return true;
        case IS_TRUE:
            smart_str_appendl(out, "true", 4);
            return true;
        case IS_LONG:
            smart_str_append_long(out, Z_LVAL_P(value));
            return true;
        case IS_DOUBLE:
            pt_append_json_double(out, value);
            return true;
        case IS_STRING:
            pt_append_json_string(out, Z_STR_P(value), PHP_JSON_UNESCAPED_SLASHES | PHP_JSON_UNESCAPED_UNICODE);
            return true;
        case IS_ARRAY: {
            HashTable *table = Z_ARRVAL_P(value);
            bool list = true;
            zend_ulong expected = 0, index;
            zend_string *key;
            ZEND_HASH_FOREACH_KEY(table, index, key) {
                if (key != NULL || index != expected) {
                    list = false;
                    break;
                }
                expected++;
            } ZEND_HASH_FOREACH_END();
            smart_str_appendc(out, list ? '[' : '{');
            bool first = true;
            zval *item;
            ZEND_HASH_FOREACH_KEY_VAL(table, index, key, item) {
                if (!first) {
                    smart_str_appendc(out, ',');
                }
                first = false;
                if (list) {
                    if (!pt_canonical_json(out, item)) {
                        return false;
                    }
                    continue;
                }
                if (key != NULL) {
                    pt_append_json_string(out, key, 0);
                } else {
                    zend_string *name = zend_long_to_str((zend_long)index);
                    pt_append_json_string(out, name, 0);
                    zend_string_release(name);
                }
                smart_str_appendc(out, ':');
                if (!pt_canonical_json(out, item)) {
                    return false;
                }
            } ZEND_HASH_FOREACH_END();
            smart_str_appendc(out, list ? ']' : '}');
            return true;
        }
        default:
            zend_type_error("array_is_list(): Argument #1 ($array) must be of type array, %s given", zend_zval_value_name(value));
            return false;
    }
}

void pt_ast_to_json(INTERNAL_FUNCTION_PARAMETERS)
{
    zval *node;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_ZVAL(node)
    ZEND_PARSE_PARAMETERS_END();
    smart_str out = {0};
    if (!pt_canonical_json(&out, node)) {
        smart_str_free(&out);
        RETURN_THROWS();
    }
    smart_str_0(&out);
    RETURN_STR(smart_str_extract(&out));
}

/* ----------------------------------------------------------------------------------------------- */
/* Parser\Scanner                                                                                   */
/* ----------------------------------------------------------------------------------------------- */

/* An offset of the scanner is not negative: the library would read it from the end of the text. */
static bool pt_offset_ok(uint32_t argument, zend_long offset)
{
    if (offset < 0) {
        zend_argument_value_error(argument, "must be greater than or equal to 0");
        return false;
    }
    return true;
}

/* The byte of a one-byte delimiter, or -1 for any other string (which never equals a byte of the text). */
static int pt_delimiter_byte(const zend_string *delimiter)
{
    return ZSTR_LEN(delimiter) == 1 ? (unsigned char)ZSTR_VAL(delimiter)[0] : -1;
}

void pt_scanner_skip_horizontal_space(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *text;
    zend_long index;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_STR(text)
        Z_PARAM_LONG(index)
    ZEND_PARSE_PARAMETERS_END();
    if (!pt_offset_ok(2, index)) {
        RETURN_THROWS();
    }
    RETURN_LONG((zend_long)pt_scan_skip_horizontal(ZSTR_VAL(text), ZSTR_LEN(text), (size_t)index));
}

void pt_scanner_is_horizontal_space(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *character;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(character)
    ZEND_PARSE_PARAMETERS_END();
    RETURN_BOOL(pt_scan_is_horizontal(ZSTR_VAL(character), ZSTR_LEN(character)));
}

void pt_scanner_sigil_after(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *text;
    zend_long open;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_STR(text)
        Z_PARAM_LONG(open)
    ZEND_PARSE_PARAMETERS_END();
    if (!pt_offset_ok(2, open)) {
        RETURN_THROWS();
    }
    const char *sigil = pt_scan_sigil_after(ZSTR_VAL(text), ZSTR_LEN(text), (size_t)open);
    if (sigil == NULL) {
        RETURN_NULL();
    }
    RETURN_STRING(sigil);
}

void pt_scanner_starts_tag(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *text, *close;
    zend_long open;
    ZEND_PARSE_PARAMETERS_START(3, 3)
        Z_PARAM_STR(text)
        Z_PARAM_LONG(open)
        Z_PARAM_STR(close)
    ZEND_PARSE_PARAMETERS_END();
    if (!pt_offset_ok(2, open)) {
        RETURN_THROWS();
    }
    RETURN_BOOL(pt_scan_starts_tag(ZSTR_VAL(text), ZSTR_LEN(text), (size_t)open, pt_delimiter_byte(close)));
}

void pt_scanner_wrapped_tag_at(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *text, *open, *close;
    zend_long index;
    ZEND_PARSE_PARAMETERS_START(4, 4)
        Z_PARAM_STR(text)
        Z_PARAM_LONG(index)
        Z_PARAM_STR(open)
        Z_PARAM_STR(close)
    ZEND_PARSE_PARAMETERS_END();
    if (!pt_offset_ok(2, index)) {
        RETURN_THROWS();
    }
    int wrapper = pt_scan_wrapped_tag_at(ZSTR_VAL(text), ZSTR_LEN(text), (size_t)index, pt_delimiter_byte(open), pt_delimiter_byte(close));
    if (wrapper < 0) {
        RETURN_NULL();
    }
    array_init(return_value);
    add_next_index_string(return_value, pt_wrappers[wrapper][0]);
    add_next_index_string(return_value, pt_wrappers[wrapper][1]);
}

void pt_scanner_is_delimiter_char(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *character;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(character)
    ZEND_PARSE_PARAMETERS_END();
    RETURN_BOOL(pt_scan_delimiter_char(ZSTR_VAL(character), ZSTR_LEN(character)));
}

void pt_scanner_parse_delimiters(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *value;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(value)
    ZEND_PARSE_PARAMETERS_END();
    char open, close;
    if (!pt_parse_delimiters(ZSTR_VAL(value), ZSTR_LEN(value), &open, &close)) {
        RETURN_NULL();
    }
    array_init(return_value);
    add_next_index_stringl(return_value, &open, 1);
    add_next_index_stringl(return_value, &close, 1);
}

/* ----------------------------------------------------------------------------------------------- */
/* Parser\Standalone                                                                                */
/* ----------------------------------------------------------------------------------------------- */

/* A tag of the argument with its position among the arguments, for a stable sort by start. */
typedef struct pt_ordered_tag {
    pt_syntax_tag tag;
    size_t order;
} pt_ordered_tag;

static int pt_ordered_tag_compare(const void *left, const void *right)
{
    const pt_ordered_tag *a = left, *b = right;
    if (a->tag.start != b->tag.start) {
        return a->tag.start < b->tag.start ? -1 : 1;
    }
    return a->order < b->order ? -1 : (a->order > b->order ? 1 : 0);
}

bool pt_tag_int(HashTable *tag, const char *key, zend_long *value)
{
    zval *field = zend_hash_str_find(tag, key, strlen(key));
    if (field == NULL) {
        return false;
    }
    ZVAL_DEREF(field);
    if (Z_TYPE_P(field) != IS_LONG) {
        return false;
    }
    *value = Z_LVAL_P(field);
    return true;
}

/* Standalone::ranges: the tags are read as the library reads them, sorted by start (stably), each offset clamped to
 * the text as substr clamps it. */
void pt_standalone_ranges_of(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *text;
    HashTable *tags;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_STR(text)
        Z_PARAM_ARRAY_HT(tags)
    ZEND_PARSE_PARAMETERS_END();
    size_t length = ZSTR_LEN(text);
    pt_arena arena;
    pt_arena_init(&arena);
    pt_ordered_tag *items = pt_alloc(&arena, sizeof(pt_ordered_tag) * (zend_hash_num_elements(tags) + 1));
    uint32_t count = 0;
    zval *value;
    ZEND_HASH_FOREACH_VAL(tags, value) {
        ZVAL_DEREF(value);
        zend_long start, end;
        if (Z_TYPE_P(value) != IS_ARRAY || !pt_tag_int(Z_ARRVAL_P(value), "start", &start) || !pt_tag_int(Z_ARRVAL_P(value), "end", &end)) {
            pt_arena_free(&arena);
            zend_type_error("Polyspec\\Template\\Parser\\Standalone::ranges(): each tag must be an array with int start and end");
            RETURN_THROWS();
        }
        if (start < 0 || end < 0) {
            pt_arena_free(&arena);
            zend_value_error("Polyspec\\Template\\Parser\\Standalone::ranges(): the offsets of a tag must not be negative");
            RETURN_THROWS();
        }
        zval *echo = zend_hash_str_find(Z_ARRVAL_P(value), "echo", 4);
        pt_ordered_tag *item = &items[count];
        item->tag = (pt_syntax_tag){
            (size_t)start > length ? length : (size_t)start,
            (size_t)end > length ? length : (size_t)end,
            0, 0, echo != NULL && zend_is_true(echo), NULL,
        };
        item->order = count;
        count++;
    } ZEND_HASH_FOREACH_END();
    qsort(items, count, sizeof(pt_ordered_tag), pt_ordered_tag_compare);
    pt_syntax_tag *sorted = pt_alloc(&arena, sizeof(pt_syntax_tag) * (count + 1));
    for (uint32_t i = 0; i < count; i++) {
        sorted[i] = items[i].tag;
    }
    pt_lines lines;
    pt_lines_build(&arena, &lines, ZSTR_VAL(text), length);
    pt_ranges ranges = pt_standalone_ranges(&arena, &lines, ZSTR_VAL(text), length, sorted, count);
    array_init(return_value);
    for (uint32_t i = 0; i < ranges.count; i++) {
        zval pair;
        array_init(&pair);
        add_next_index_long(&pair, (zend_long)ranges.v[i].start);
        add_next_index_long(&pair, (zend_long)ranges.v[i].end);
        add_next_index_zval(return_value, &pair);
    }
    pt_arena_free(&arena);
}
