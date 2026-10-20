/*
 * The decode of the AST JSON (AST-10): the JSON text is validated against the schema of the contract, which the
 * extension holds as pt_ast_schema, and read as the AST arrays of the parser. The validator follows the keywords of
 * the library's validator (opis/json-schema, draft-07) for the keywords the schema uses, builds the same tree of
 * errors, and names the invalid node the way the library does: the deepest instance location, then the least
 * pointer, then the first error without sub-errors. A failure is an AstDecodeError with the same pointer and reason.
 */
#include "php.h"
#include "ext/json/php_json.h"
#include "ext/spl/spl_exceptions.h"
#include "Zend/zend_exceptions.h"
#include "Zend/zend_smart_str.h"
#include "pt.h"
#include "pt_ast_schema.h"

#include <math.h>
#include <stdio.h>
#include <string.h>

/* The lists of pointers that a decode owns or borrows; the owner frees the items array. */
typedef struct pt_dec_list {
    void **items;
    size_t count, capacity;
} pt_dec_list;

/* An error of the tree of the library: a leaf has a message; a wrapper has sub-errors and no message. */
typedef struct pt_dec_err {
    zend_string *pointer; /* the JSON Pointer of the instance location, escaped as RFC 6901 */
    size_t depth;         /* the number of tokens of that pointer */
    zend_string *message; /* the formatted message of a leaf, NULL for a wrapper */
    bool combined;        /* the combined error of a keyword group, which the top level splices */
    pt_dec_list subs;
} pt_dec_err;

typedef struct pt_dec_ctx {
    zval *root;           /* the schema that the $ref of the form #/... resolves in */
    char *path;           /* the JSON Pointer of the instance location that is validated now */
    size_t path_len, path_capacity;
    size_t depth;
    pt_dec_list nodes;    /* every error that the decode made, freed when it ends */
} pt_dec_ctx;

typedef enum pt_dec_type {
    PT_DEC_NULL,
    PT_DEC_BOOLEAN,
    PT_DEC_INTEGER,
    PT_DEC_NUMBER,
    PT_DEC_STRING,
    PT_DEC_ARRAY,
    PT_DEC_OBJECT
} pt_dec_type;

static const char *const pt_dec_type_names[] = {"null", "boolean", "integer", "number", "string", "array", "object"};

static void pt_dec_list_add(pt_dec_list *list, void *item)
{
    if (item == NULL) {
        return;
    }
    if (list->count == list->capacity) {
        list->capacity = list->capacity == 0 ? 4 : list->capacity * 2;
        list->items = erealloc(list->items, list->capacity * sizeof(void *));
    }
    list->items[list->count++] = item;
}

static void pt_dec_list_free(pt_dec_list *list)
{
    if (list->items != NULL) {
        efree(list->items);
    }
    list->items = NULL;
    list->count = list->capacity = 0;
}

static void pt_dec_throw_logic(const char *message)
{
    if (!EG(exception)) {
        zend_throw_exception(spl_ce_LogicException, message, 0);
    }
}

/* The JSON type of a value as the library names it: an integral number is an integer. */
static pt_dec_type pt_dec_json_type(zval *value)
{
    switch (Z_TYPE_P(value)) {
        case IS_NULL:
            return PT_DEC_NULL;
        case IS_TRUE:
        case IS_FALSE:
            return PT_DEC_BOOLEAN;
        case IS_LONG:
            return PT_DEC_INTEGER;
        case IS_DOUBLE:
            return (Z_DVAL_P(value) == 0.0 || fmod(Z_DVAL_P(value), 1.0) == 0.0) ? PT_DEC_INTEGER : PT_DEC_NUMBER;
        case IS_STRING:
            return PT_DEC_STRING;
        case IS_ARRAY:
            return PT_DEC_ARRAY;
        default:
            return PT_DEC_OBJECT;
    }
}

/* The JSON type of a value is the schema's name for it, or the name of its super type (integer is a number). */
static bool pt_dec_type_is(pt_dec_type type, zend_string *name)
{
    if (zend_string_equals_cstr(name, pt_dec_type_names[type], strlen(pt_dec_type_names[type]))) {
        return true;
    }
    return type == PT_DEC_INTEGER && zend_string_equals_literal(name, "number");
}

/* jsonTypeMatches: the schema's type, a name or a list of names, admits the type of the value. */
static bool pt_dec_type_allowed(pt_dec_type type, zval *allowed)
{
    if (Z_TYPE_P(allowed) == IS_STRING) {
        return pt_dec_type_is(type, Z_STR_P(allowed));
    }
    zval *name;
    ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(allowed), name) {
        if (Z_TYPE_P(name) == IS_STRING && pt_dec_type_is(type, Z_STR_P(name))) {
            return true;
        }
    } ZEND_HASH_FOREACH_END();
    return false;
}

/* ----------------------------------------------------------------------------------------------- */
/* The data path and the errors                                                                     */
/* ----------------------------------------------------------------------------------------------- */

static void pt_dec_reserve(pt_dec_ctx *c, size_t extra)
{
    if (c->path_len + extra <= c->path_capacity) {
        return;
    }
    size_t capacity = c->path_capacity == 0 ? 64 : c->path_capacity;
    while (capacity < c->path_len + extra) {
        capacity *= 2;
    }
    c->path = erealloc(c->path, capacity);
    c->path_capacity = capacity;
}

/* pushDataPath of a property name: the name is escaped as the JSON Pointer of the library (~ then /). */
static size_t pt_dec_push_name(pt_dec_ctx *c, zend_string *name)
{
    size_t mark = c->path_len;
    size_t extra = 1;
    for (size_t i = 0; i < ZSTR_LEN(name); i++) {
        extra += (ZSTR_VAL(name)[i] == '~' || ZSTR_VAL(name)[i] == '/') ? 2 : 1;
    }
    pt_dec_reserve(c, extra);
    c->path[c->path_len++] = '/';
    for (size_t i = 0; i < ZSTR_LEN(name); i++) {
        char ch = ZSTR_VAL(name)[i];
        if (ch == '~') {
            c->path[c->path_len++] = '~';
            c->path[c->path_len++] = '0';
        } else if (ch == '/') {
            c->path[c->path_len++] = '~';
            c->path[c->path_len++] = '1';
        } else {
            c->path[c->path_len++] = ch;
        }
    }
    c->depth++;
    return mark;
}

/* pushDataPath of an array index. */
static size_t pt_dec_push_index(pt_dec_ctx *c, zend_ulong index)
{
    char digits[32];
    int length = snprintf(digits, sizeof(digits), "%lu", (unsigned long)index);
    size_t mark = c->path_len;
    pt_dec_reserve(c, (size_t)length + 1);
    c->path[c->path_len++] = '/';
    memcpy(c->path + c->path_len, digits, (size_t)length);
    c->path_len += (size_t)length;
    c->depth++;
    return mark;
}

static void pt_dec_pop(pt_dec_ctx *c, size_t mark)
{
    c->path_len = mark;
    c->depth--;
}

/* A leaf at the current instance location. The message is taken. */
static pt_dec_err *pt_dec_leaf(pt_dec_ctx *c, zend_string *message)
{
    pt_dec_err *error = emalloc(sizeof(pt_dec_err));
    error->pointer = zend_string_init(c->path != NULL ? c->path : "", c->path_len, 0);
    error->depth = c->depth;
    error->message = message;
    error->combined = false;
    memset(&error->subs, 0, sizeof(error->subs));
    pt_dec_list_add(&c->nodes, error);
    return error;
}

/* A leaf with a message that is a constant text. */
static pt_dec_err *pt_dec_leaf_text(pt_dec_ctx *c, const char *text)
{
    return pt_dec_leaf(c, zend_string_init(text, strlen(text), 0));
}

/* A wrapper at the current instance location over the errors of the list, which the node takes. */
static pt_dec_err *pt_dec_wrap(pt_dec_ctx *c, pt_dec_list *list, bool combined)
{
    if (list->count == 0) {
        return NULL;
    }
    pt_dec_err *error = pt_dec_leaf(c, NULL);
    error->combined = combined;
    error->subs = *list;
    memset(list, 0, sizeof(*list));
    return error;
}

/* A group of keyword errors: none is null, one stands for itself, several make the combined error. */
static pt_dec_err *pt_dec_group(pt_dec_ctx *c, pt_dec_list *list)
{
    if (list->count == 1) {
        pt_dec_err *only = list->items[0];
        pt_dec_list_free(list);
        return only;
    }
    return pt_dec_wrap(c, list, true);
}

/* The errors of the keyword groups of a schema: a combined group is spliced into the schema's own list. */
static pt_dec_err *pt_dec_top(pt_dec_ctx *c, pt_dec_list *groups)
{
    if (groups->count <= 1) {
        return pt_dec_group(c, groups);
    }
    pt_dec_list flat = {NULL, 0, 0};
    for (size_t i = 0; i < groups->count; i++) {
        pt_dec_err *group = groups->items[i];
        if (group->combined) {
            for (size_t j = 0; j < group->subs.count; j++) {
                pt_dec_list_add(&flat, group->subs.items[j]);
            }
        } else {
            pt_dec_list_add(&flat, group);
        }
    }
    pt_dec_list_free(groups);
    return pt_dec_wrap(c, &flat, true);
}

static zend_string *pt_dec_finish(smart_str *text)
{
    return smart_str_extract(text);
}

/* ----------------------------------------------------------------------------------------------- */
/* Equality, patterns and lengths                                                                  */
/* ----------------------------------------------------------------------------------------------- */

static double pt_dec_as_double(zval *value)
{
    return Z_TYPE_P(value) == IS_LONG ? (double)Z_LVAL_P(value) : Z_DVAL_P(value);
}

/* Helper::equals for the scalars that the schema holds as const and enum. */
static bool pt_dec_equals(zval *expected, zval *data)
{
    switch (Z_TYPE_P(expected)) {
        case IS_STRING:
            return Z_TYPE_P(data) == IS_STRING && zend_string_equals(Z_STR_P(expected), Z_STR_P(data));
        case IS_NULL:
            return Z_TYPE_P(data) == IS_NULL;
        case IS_TRUE:
        case IS_FALSE:
            return Z_TYPE_P(expected) == Z_TYPE_P(data);
        case IS_LONG:
        case IS_DOUBLE:
            if (Z_TYPE_P(data) != IS_LONG && Z_TYPE_P(data) != IS_DOUBLE) {
                return false;
            }
            if (Z_TYPE_P(expected) == IS_LONG && Z_TYPE_P(data) == IS_LONG) {
                return Z_LVAL_P(expected) == Z_LVAL_P(data);
            }
            return pt_dec_as_double(expected) == pt_dec_as_double(data);
        default:
            pt_dec_throw_logic("the AST schema holds a const or enum value that the extension does not compare");
            return false;
    }
}

/* preg_match of the pattern wrapped as the library wraps it (\x07 delimiters, u and D modifiers). The call is PHP's own
 * preg_match, the engine that the library's matcher uses. */
static bool pt_dec_pattern_matches(zend_string *pattern, zend_string *subject)
{
    smart_str wrapped = {0};
    smart_str_appendc(&wrapped, '\x07');
    smart_str_append(&wrapped, pattern);
    smart_str_appendl(&wrapped, "\x07uD", 3);
    zval arguments[2];
    ZVAL_STR(&arguments[0], pt_dec_finish(&wrapped));
    ZVAL_STR_COPY(&arguments[1], subject);
    zval function;
    zval result;
    ZVAL_STRING(&function, "preg_match");
    call_user_function(NULL, NULL, &function, &result, 2, arguments);
    zval_ptr_dtor(&function);
    zval_ptr_dtor(&arguments[0]);
    zval_ptr_dtor(&arguments[1]);
    if (Z_TYPE(result) == IS_FALSE) {
        pt_dec_throw_logic("the pattern of the AST schema does not compile");
        return false;
    }
    return Z_TYPE(result) == IS_LONG && Z_LVAL(result) > 0;
}

/* getStringLength: the code points of a string, which is valid UTF-8 because JSON decoding checked it. */
static size_t pt_dec_code_points(zend_string *text)
{
    size_t count = 0;
    for (size_t i = 0; i < ZSTR_LEN(text); i++) {
        if ((((unsigned char)ZSTR_VAL(text)[i]) & 0xC0) != 0x80) {
            count++;
        }
    }
    return count;
}

/* ----------------------------------------------------------------------------------------------- */
/* The keywords                                                                                    */
/* ----------------------------------------------------------------------------------------------- */

static pt_dec_err *pt_dec_check(pt_dec_ctx *c, zval *schema, zval *data);

static pt_dec_err *pt_dec_kw_type(pt_dec_ctx *c, zval *allowed, zval *data)
{
    pt_dec_type type = pt_dec_json_type(data);
    if (pt_dec_type_allowed(type, allowed)) {
        return NULL;
    }
    smart_str text = {0};
    smart_str_appends(&text, "The data (");
    smart_str_appends(&text, pt_dec_type_names[type]);
    smart_str_appends(&text, ") must match the type: ");
    if (Z_TYPE_P(allowed) == IS_STRING) {
        smart_str_append(&text, Z_STR_P(allowed));
    } else {
        zval *name;
        bool first = true;
        ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(allowed), name) {
            if (!first) {
                smart_str_appends(&text, ", ");
            }
            smart_str_append(&text, Z_STR_P(name));
            first = false;
        } ZEND_HASH_FOREACH_END();
    }
    return pt_dec_leaf(c, pt_dec_finish(&text));
}

static pt_dec_err *pt_dec_kw_const(pt_dec_ctx *c, zval *expected, zval *data)
{
    if (pt_dec_equals(expected, data)) {
        return NULL;
    }
    return pt_dec_leaf_text(c, "The data must match the const value");
}

static pt_dec_err *pt_dec_kw_enum(pt_dec_ctx *c, zval *list, zval *data)
{
    zval *value;
    ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(list), value) {
        if (pt_dec_equals(value, data)) {
            return NULL;
        }
    } ZEND_HASH_FOREACH_END();
    return pt_dec_leaf_text(c, "The data should match one item from enum");
}

static pt_dec_err *pt_dec_kw_required(pt_dec_ctx *c, zval *names, zval *data)
{
    smart_str text = {0};
    smart_str_appends(&text, "The required properties (");
    size_t count = 0;
    zval *name;
    ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(names), name) {
        if (zend_hash_exists(Z_OBJPROP_P(data), Z_STR_P(name))) {
            continue;
        }
        if (count > 0) {
            smart_str_appends(&text, ", ");
        }
        smart_str_append(&text, Z_STR_P(name));
        count++;
    } ZEND_HASH_FOREACH_END();
    if (count == 0) {
        smart_str_free(&text);
        return NULL;
    }
    smart_str_appends(&text, ") are missing");
    return pt_dec_leaf(c, pt_dec_finish(&text));
}

static bool pt_dec_names_contain(pt_dec_list *names, zend_string *name)
{
    for (size_t i = 0; i < names->count; i++) {
        if (zend_string_equals((zend_string *)names->items[i], name)) {
            return true;
        }
    }
    return false;
}

/* properties: each present property is checked by its schema; the names checked are kept for additionalProperties. */
static pt_dec_err *pt_dec_kw_properties(pt_dec_ctx *c, zval *properties, zval *data, pt_dec_list *checked)
{
    pt_dec_list errors = {NULL, 0, 0};
    zend_string *name;
    zval *schema;
    ZEND_HASH_FOREACH_STR_KEY_VAL(Z_OBJPROP_P(properties), name, schema) {
        if (name == NULL) {
            pt_dec_throw_logic("the AST schema has a property name that is not a string");
            break;
        }
        zval *value = zend_hash_find(Z_OBJPROP_P(data), name);
        if (value == NULL) {
            continue;
        }
        pt_dec_list_add(checked, name);
        size_t mark = pt_dec_push_name(c, name);
        pt_dec_list_add(&errors, pt_dec_check(c, schema, value));
        pt_dec_pop(c, mark);
    } ZEND_HASH_FOREACH_END();
    return pt_dec_wrap(c, &errors, false);
}

/* additionalProperties: false, with the names of the object that no properties keyword of the schema checked. */
static pt_dec_err *pt_dec_kw_additional_false(pt_dec_ctx *c, zval *data, pt_dec_list *checked)
{
    smart_str text = {0};
    smart_str_appends(&text, "Additional object properties are not allowed: ");
    size_t count = 0;
    zend_string *name;
    ZEND_HASH_FOREACH_STR_KEY(Z_OBJPROP_P(data), name) {
        if (name == NULL) {
            pt_dec_throw_logic("the AST has a property name that is not a string");
            break;
        }
        if (pt_dec_names_contain(checked, name)) {
            continue;
        }
        if (count > 0) {
            smart_str_appends(&text, ", ");
        }
        smart_str_append(&text, name);
        count++;
    } ZEND_HASH_FOREACH_END();
    if (count == 0) {
        smart_str_free(&text);
        return NULL;
    }
    return pt_dec_leaf(c, pt_dec_finish(&text));
}

static pt_dec_err *pt_dec_kw_min_items(pt_dec_ctx *c, zval *min, zval *data)
{
    size_t count = zend_hash_num_elements(Z_ARRVAL_P(data));
    if ((zend_long)count >= Z_LVAL_P(min)) {
        return NULL;
    }
    smart_str text = {0};
    smart_str_appends(&text, "Array should have at least ");
    smart_str_append_long(&text, Z_LVAL_P(min));
    smart_str_appends(&text, " items, ");
    smart_str_append_long(&text, (zend_long)count);
    smart_str_appends(&text, " found");
    return pt_dec_leaf(c, pt_dec_finish(&text));
}

static pt_dec_err *pt_dec_kw_max_items(pt_dec_ctx *c, zval *max, zval *data)
{
    size_t count = zend_hash_num_elements(Z_ARRVAL_P(data));
    if ((zend_long)count <= Z_LVAL_P(max)) {
        return NULL;
    }
    smart_str text = {0};
    smart_str_appends(&text, "Array should have at most ");
    smart_str_append_long(&text, Z_LVAL_P(max));
    smart_str_appends(&text, " items, ");
    smart_str_append_long(&text, (zend_long)count);
    smart_str_appends(&text, " found");
    return pt_dec_leaf(c, pt_dec_finish(&text));
}

/* items: one schema for every element; the errors of the elements make the wrapper. */
static pt_dec_err *pt_dec_kw_items(pt_dec_ctx *c, zval *items, zval *data)
{
    pt_dec_list errors = {NULL, 0, 0};
    zend_ulong index = 0;
    zval *element;
    ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(data), element) {
        size_t mark = pt_dec_push_index(c, index);
        pt_dec_list_add(&errors, pt_dec_check(c, items, element));
        pt_dec_pop(c, mark);
        index++;
    } ZEND_HASH_FOREACH_END();
    return pt_dec_wrap(c, &errors, false);
}

static pt_dec_err *pt_dec_kw_min_length(pt_dec_ctx *c, zval *min, zval *data)
{
    size_t length = pt_dec_code_points(Z_STR_P(data));
    if ((zend_long)length >= Z_LVAL_P(min)) {
        return NULL;
    }
    smart_str text = {0};
    smart_str_appends(&text, "Minimum string length is ");
    smart_str_append_long(&text, Z_LVAL_P(min));
    smart_str_appends(&text, ", found ");
    smart_str_append_long(&text, (zend_long)length);
    return pt_dec_leaf(c, pt_dec_finish(&text));
}

static pt_dec_err *pt_dec_kw_pattern(pt_dec_ctx *c, zval *pattern, zval *data)
{
    if (pt_dec_pattern_matches(Z_STR_P(pattern), Z_STR_P(data))) {
        return NULL;
    }
    smart_str text = {0};
    smart_str_appends(&text, "The string should match pattern: ");
    smart_str_append(&text, Z_STR_P(pattern));
    return pt_dec_leaf(c, pt_dec_finish(&text));
}

static pt_dec_err *pt_dec_kw_minimum(pt_dec_ctx *c, zval *min, zval *data)
{
    double bound = pt_dec_as_double(min);
    if (pt_dec_as_double(data) >= bound) {
        return NULL;
    }
    smart_str text = {0};
    smart_str_appends(&text, "Number must be greater than or equal to ");
    smart_str_append_double(&text, bound, (int)EG(precision), false);
    return pt_dec_leaf(c, pt_dec_finish(&text));
}

/* allOf: the first subschema that fails is the error, wrapped. */
static pt_dec_err *pt_dec_kw_all_of(pt_dec_ctx *c, zval *schemas, zval *data)
{
    zval *schema;
    ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(schemas), schema) {
        pt_dec_err *error = pt_dec_check(c, schema, data);
        if (error != NULL) {
            pt_dec_list one = {NULL, 0, 0};
            pt_dec_list_add(&one, error);
            return pt_dec_wrap(c, &one, false);
        }
    } ZEND_HASH_FOREACH_END();
    return NULL;
}

/* if/then/else: the if schema decides the branch; a failing branch is the wrapped error. */
static pt_dec_err *pt_dec_kw_if(pt_dec_ctx *c, zval *if_schema, zval *then_schema, zval *else_schema, zval *data)
{
    bool if_failed = pt_dec_check(c, if_schema, data) != NULL;
    zval *branch = if_failed ? else_schema : then_schema;
    if (branch == NULL) {
        return NULL;
    }
    pt_dec_err *error = pt_dec_check(c, branch, data);
    if (error == NULL) {
        return NULL;
    }
    pt_dec_list one = {NULL, 0, 0};
    pt_dec_list_add(&one, error);
    return pt_dec_wrap(c, &one, false);
}

/* ----------------------------------------------------------------------------------------------- */
/* The schema                                                                                      */
/* ----------------------------------------------------------------------------------------------- */

/* The schema node that a $ref of the form #/a/b names, in the root schema. */
static zval *pt_dec_resolve(pt_dec_ctx *c, zend_string *ref)
{
    if (ZSTR_LEN(ref) < 2 || ZSTR_VAL(ref)[0] != '#' || ZSTR_VAL(ref)[1] != '/') {
        pt_dec_throw_logic("the AST schema holds a $ref that the extension does not resolve");
        return NULL;
    }
    zval *current = c->root;
    size_t start = 2;
    while (start <= ZSTR_LEN(ref)) {
        size_t end = start;
        while (end < ZSTR_LEN(ref) && ZSTR_VAL(ref)[end] != '/') {
            end++;
        }
        smart_str token = {0};
        for (size_t i = start; i < end; i++) {
            if (ZSTR_VAL(ref)[i] == '~' && i + 1 < end && ZSTR_VAL(ref)[i + 1] == '1') {
                smart_str_appendc(&token, '/');
                i++;
            } else if (ZSTR_VAL(ref)[i] == '~' && i + 1 < end && ZSTR_VAL(ref)[i + 1] == '0') {
                smart_str_appendc(&token, '~');
                i++;
            } else {
                smart_str_appendc(&token, ZSTR_VAL(ref)[i]);
            }
        }
        zend_string *name = pt_dec_finish(&token);
        zval *next = Z_TYPE_P(current) == IS_OBJECT ? zend_hash_find(Z_OBJPROP_P(current), name) : NULL;
        zend_string_release(name);
        if (next == NULL) {
            pt_dec_throw_logic("the AST schema holds a $ref that names no schema");
            return NULL;
        }
        current = next;
        start = end + 1;
    }
    return current;
}

/* The keyword group of the data type: object, array, string or number keywords, applied in the parser's order. */
static pt_dec_err *pt_dec_object_group(pt_dec_ctx *c, zval *schema, zval *data)
{
    pt_dec_list group = {NULL, 0, 0};
    pt_dec_list checked = {NULL, 0, 0};
    zval *kw;
    if ((kw = zend_hash_str_find(Z_OBJPROP_P(schema), "required", 8)) != NULL) {
        pt_dec_list_add(&group, pt_dec_kw_required(c, kw, data));
    }
    if ((kw = zend_hash_str_find(Z_OBJPROP_P(schema), "properties", 10)) != NULL) {
        pt_dec_list_add(&group, pt_dec_kw_properties(c, kw, data, &checked));
    }
    if ((kw = zend_hash_str_find(Z_OBJPROP_P(schema), "additionalProperties", 20)) != NULL) {
        pt_dec_list_add(&group, pt_dec_kw_additional_false(c, data, &checked));
    }
    pt_dec_list_free(&checked);
    return pt_dec_group(c, &group);
}

/* The validation of a value against a schema: the wrapper or the leaf of the errors, or NULL when it is valid. */
static pt_dec_err *pt_dec_check(pt_dec_ctx *c, zval *schema, zval *data)
{
    if (EG(exception)) {
        return NULL;
    }
    if (Z_TYPE_P(schema) != IS_OBJECT) {
        pt_dec_throw_logic("the AST schema holds a schema that is not an object");
        return NULL;
    }
    HashTable *keywords = Z_OBJPROP_P(schema);
    zval *ref = zend_hash_str_find(keywords, "$ref", 4);
    if (ref != NULL) {
        zval *target = pt_dec_resolve(c, Z_STR_P(ref));
        return target == NULL ? NULL : pt_dec_check(c, target, data);
    }

    pt_dec_list groups = {NULL, 0, 0};
    zval *kw;
    pt_dec_list before = {NULL, 0, 0};
    if ((kw = zend_hash_str_find(keywords, "type", 4)) != NULL) {
        pt_dec_list_add(&before, pt_dec_kw_type(c, kw, data));
    }
    if ((kw = zend_hash_str_find(keywords, "const", 5)) != NULL) {
        pt_dec_list_add(&before, pt_dec_kw_const(c, kw, data));
    }
    if ((kw = zend_hash_str_find(keywords, "enum", 4)) != NULL) {
        pt_dec_list_add(&before, pt_dec_kw_enum(c, kw, data));
    }
    pt_dec_list_add(&groups, pt_dec_group(c, &before));

    switch (pt_dec_json_type(data)) {
        case PT_DEC_OBJECT:
            pt_dec_list_add(&groups, pt_dec_object_group(c, schema, data));
            break;
        case PT_DEC_ARRAY: {
            pt_dec_list array = {NULL, 0, 0};
            if ((kw = zend_hash_str_find(keywords, "minItems", 8)) != NULL) {
                pt_dec_list_add(&array, pt_dec_kw_min_items(c, kw, data));
            }
            if ((kw = zend_hash_str_find(keywords, "maxItems", 8)) != NULL) {
                pt_dec_list_add(&array, pt_dec_kw_max_items(c, kw, data));
            }
            if ((kw = zend_hash_str_find(keywords, "items", 5)) != NULL) {
                pt_dec_list_add(&array, pt_dec_kw_items(c, kw, data));
            }
            pt_dec_list_add(&groups, pt_dec_group(c, &array));
            break;
        }
        case PT_DEC_STRING: {
            pt_dec_list string = {NULL, 0, 0};
            if ((kw = zend_hash_str_find(keywords, "minLength", 9)) != NULL) {
                pt_dec_list_add(&string, pt_dec_kw_min_length(c, kw, data));
            }
            if ((kw = zend_hash_str_find(keywords, "pattern", 7)) != NULL) {
                pt_dec_list_add(&string, pt_dec_kw_pattern(c, kw, data));
            }
            pt_dec_list_add(&groups, pt_dec_group(c, &string));
            break;
        }
        case PT_DEC_INTEGER:
        case PT_DEC_NUMBER:
            if ((kw = zend_hash_str_find(keywords, "minimum", 7)) != NULL) {
                pt_dec_list number = {NULL, 0, 0};
                pt_dec_list_add(&number, pt_dec_kw_minimum(c, kw, data));
                pt_dec_list_add(&groups, pt_dec_group(c, &number));
            }
            break;
        default:
            break;
    }

    pt_dec_list after = {NULL, 0, 0};
    if ((kw = zend_hash_str_find(keywords, "allOf", 5)) != NULL) {
        pt_dec_list_add(&after, pt_dec_kw_all_of(c, kw, data));
    }
    zval *then_schema = zend_hash_str_find(keywords, "then", 4);
    zval *else_schema = zend_hash_str_find(keywords, "else", 4);
    if ((kw = zend_hash_str_find(keywords, "if", 2)) != NULL) {
        pt_dec_list_add(&after, pt_dec_kw_if(c, kw, then_schema, else_schema, data));
    }
    pt_dec_list_add(&groups, pt_dec_group(c, &after));

    return pt_dec_top(c, &groups);
}

/* ----------------------------------------------------------------------------------------------- */
/* The schema is checked once per decode: a keyword or a form that the validator does not follow   */
/* fails loudly instead of being ignored.                                                          */
/* ----------------------------------------------------------------------------------------------- */

static bool pt_dec_is_annotation(const char *name, size_t length)
{
    static const char *const annotations[] = {"$schema", "$id", "title", "description", "definitions", NULL};
    for (size_t i = 0; annotations[i] != NULL; i++) {
        if (strlen(annotations[i]) == length && memcmp(annotations[i], name, length) == 0) {
            return true;
        }
    }
    return false;
}

static bool pt_dec_is_keyword(const char *name, size_t length)
{
    static const char *const keywords[] = {
        "$ref", "type", "const", "enum", "properties", "required", "additionalProperties", "if", "then", "else",
        "allOf", "items", "minItems", "maxItems", "minLength", "minimum", "pattern", NULL};
    for (size_t i = 0; keywords[i] != NULL; i++) {
        if (strlen(keywords[i]) == length && memcmp(keywords[i], name, length) == 0) {
            return true;
        }
    }
    return false;
}

static void pt_dec_scan_schema(zval *schema);

static void pt_dec_scan_value(zend_string *name, zval *value)
{
    if (EG(exception)) {
        return;
    }
    if (zend_string_equals_literal(name, "additionalProperties")) {
        if (Z_TYPE_P(value) != IS_FALSE) {
            pt_dec_throw_logic("the AST schema holds an additionalProperties that the extension does not validate");
        }
    } else if (zend_string_equals_literal(name, "items") || zend_string_equals_literal(name, "if")
            || zend_string_equals_literal(name, "then") || zend_string_equals_literal(name, "else")) {
        pt_dec_scan_schema(value);
    } else if (zend_string_equals_literal(name, "allOf")) {
        if (Z_TYPE_P(value) != IS_ARRAY) {
            pt_dec_throw_logic("the AST schema holds an allOf that is not a list");
            return;
        }
        zval *item;
        ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(value), item) {
            pt_dec_scan_schema(item);
        } ZEND_HASH_FOREACH_END();
    } else if (zend_string_equals_literal(name, "minItems") || zend_string_equals_literal(name, "maxItems")
            || zend_string_equals_literal(name, "minLength")) {
        if (Z_TYPE_P(value) != IS_LONG) {
            pt_dec_throw_logic("the AST schema holds a length keyword that is not an integer");
        }
    } else if (zend_string_equals_literal(name, "minimum")) {
        if (Z_TYPE_P(value) != IS_LONG && Z_TYPE_P(value) != IS_DOUBLE) {
            pt_dec_throw_logic("the AST schema holds a minimum that is not a number");
        }
    } else if (zend_string_equals_literal(name, "pattern") || zend_string_equals_literal(name, "$ref")) {
        if (Z_TYPE_P(value) != IS_STRING) {
            pt_dec_throw_logic("the AST schema holds a string keyword that is not a string");
        }
    } else if (zend_string_equals_literal(name, "type") || zend_string_equals_literal(name, "required")) {
        if (Z_TYPE_P(value) != IS_STRING && Z_TYPE_P(value) != IS_ARRAY) {
            pt_dec_throw_logic("the AST schema holds a list keyword that is neither a string nor a list");
        }
    }
}

/* Every keyword of a schema object must be one the validator follows; the maps of schemas are visited. */
static void pt_dec_scan_schema(zval *schema)
{
    if (Z_TYPE_P(schema) != IS_OBJECT) {
        pt_dec_throw_logic("the AST schema holds a schema that is not an object");
        return;
    }
    zend_string *name;
    zval *value;
    ZEND_HASH_FOREACH_STR_KEY_VAL(Z_OBJPROP_P(schema), name, value) {
        if (name == NULL) {
            pt_dec_throw_logic("the AST schema has a key that is not a string");
            return;
        }
        if (zend_string_equals_literal(name, "properties") || zend_string_equals_literal(name, "definitions")) {
            if (Z_TYPE_P(value) != IS_OBJECT) {
                pt_dec_throw_logic("the AST schema holds a map of schemas that is not an object");
                return;
            }
            zend_string *child_name;
            zval *child;
            ZEND_HASH_FOREACH_STR_KEY_VAL(Z_OBJPROP_P(value), child_name, child) {
                pt_dec_scan_schema(child);
            } ZEND_HASH_FOREACH_END();
            continue;
        }
        if (pt_dec_is_annotation(ZSTR_VAL(name), ZSTR_LEN(name))) {
            continue;
        }
        if (!pt_dec_is_keyword(ZSTR_VAL(name), ZSTR_LEN(name))) {
            zend_throw_exception_ex(spl_ce_LogicException, 0,
                "the AST schema keyword %s is not one that the extension validates", ZSTR_VAL(name));
            return;
        }
        pt_dec_scan_value(name, value);
        if (EG(exception)) {
            return;
        }
    } ZEND_HASH_FOREACH_END();
}

/* ----------------------------------------------------------------------------------------------- */
/* The decode                                                                                      */
/* ----------------------------------------------------------------------------------------------- */

/* The invalid node (AST-10): of the errors of the tree, the deepest instance location, then the least pointer, and
 * of several at that place the first one without sub-errors. Breadth first from the root, as the library walks it. */
static bool pt_dec_chosen_over(pt_dec_err *a, pt_dec_err *b)
{
    if (a->depth != b->depth) {
        return a->depth > b->depth;
    }
    int order = zend_binary_strcmp(ZSTR_VAL(a->pointer), ZSTR_LEN(a->pointer),
        ZSTR_VAL(b->pointer), ZSTR_LEN(b->pointer));
    if (order != 0) {
        return order < 0;
    }
    return a->subs.count == 0 && b->subs.count > 0;
}

static pt_dec_err *pt_dec_invalid_node(pt_dec_ctx *c, pt_dec_err *root)
{
    pt_dec_list queue = {NULL, 0, 0};
    size_t head = 0;
    pt_dec_err *found = root;
    pt_dec_list_add(&queue, root);
    while (head < queue.count) {
        pt_dec_err *current = queue.items[head++];
        if (pt_dec_chosen_over(current, found)) {
            found = current;
        }
        for (size_t i = 0; i < current->subs.count; i++) {
            pt_dec_list_add(&queue, current->subs.items[i]);
        }
    }
    pt_dec_list_free(&queue);
    (void)c;
    return found;
}

/* new AstDecodeError($pointer, $reason), thrown. */
static void pt_dec_throw_decode_error(zend_string *pointer, zend_string *reason)
{
    zval object;
    zval arguments[2];
    object_init_ex(&object, pt_ast_decode_error_ce);
    ZVAL_STR_COPY(&arguments[0], pointer);
    ZVAL_STR_COPY(&arguments[1], reason);
    zend_call_known_instance_method_with_2_params(Z_OBJCE(object)->constructor, Z_OBJ(object), NULL,
        &arguments[0], &arguments[1]);
    zval_ptr_dtor(&arguments[0]);
    zval_ptr_dtor(&arguments[1]);
    zend_throw_exception_object(&object);
}

/* The number literals of the AST are floats, as the parser makes them (the library's native()). */
static void pt_dec_native(HashTable *value)
{
    zval *item;
    ZEND_HASH_FOREACH_VAL(value, item) {
        if (Z_TYPE_P(item) == IS_ARRAY) {
            pt_dec_native(Z_ARRVAL_P(item));
        }
    } ZEND_HASH_FOREACH_END();
    zval *type = zend_hash_str_find(value, "type", 4);
    zval *kind = zend_hash_str_find(value, "kind", 4);
    if (type == NULL || Z_TYPE_P(type) != IS_STRING || !zend_string_equals_literal(Z_STR_P(type), "Literal")) {
        return;
    }
    if (kind == NULL || Z_TYPE_P(kind) != IS_STRING || !zend_string_equals_literal(Z_STR_P(kind), "number")) {
        return;
    }
    zval *literal = zend_hash_str_find(value, "value", 5);
    if (literal != NULL) {
        double number = zval_get_double(literal);
        ZVAL_DOUBLE(literal, number);
    }
}

/* AstDecoder::decode: the JSON text as an AST array, or the JsonException or AstDecodeError that the library throws. */
void pt_ast_decode(zend_string *json, zval *return_value)
{
    ZVAL_NULL(return_value);
    zval schema;
    if (php_json_decode_ex(&schema, pt_ast_schema, sizeof(pt_ast_schema) - 1, PHP_JSON_THROW_ON_ERROR, 512)
            == FAILURE) {
        return;
    }
    pt_dec_scan_schema(&schema);
    if (EG(exception)) {
        zval_ptr_dtor(&schema);
        return;
    }
    zval data;
    if (php_json_decode_ex(&data, ZSTR_VAL(json), ZSTR_LEN(json), PHP_JSON_THROW_ON_ERROR, 512) == FAILURE) {
        zval_ptr_dtor(&schema);
        return;
    }

    pt_dec_ctx context = {&schema, NULL, 0, 0, 0, {NULL, 0, 0}};
    pt_dec_err *error = pt_dec_check(&context, &schema, &data);
    if (EG(exception)) {
        zval_ptr_dtor(&data);
        zval_ptr_dtor(&schema);
        goto cleanup;
    }
    if (error != NULL) {
        pt_dec_err *node = pt_dec_invalid_node(&context, error);
        if (node->message == NULL) {
            pt_dec_throw_logic("the invalid node of the AST has no message");
        } else {
            pt_dec_throw_decode_error(node->pointer, node->message);
        }
        zval_ptr_dtor(&data);
        zval_ptr_dtor(&schema);
        goto cleanup;
    }
    zval_ptr_dtor(&schema);
    zval_ptr_dtor(&data);

    if (php_json_decode_ex(return_value, ZSTR_VAL(json), ZSTR_LEN(json),
            PHP_JSON_OBJECT_AS_ARRAY | PHP_JSON_THROW_ON_ERROR, 512) == FAILURE) {
        ZVAL_NULL(return_value);
        goto cleanup;
    }
    if (Z_TYPE_P(return_value) != IS_ARRAY) {
        zval_ptr_dtor(return_value);
        ZVAL_NULL(return_value);
        pt_dec_throw_logic("the schema accepted a template AST that is not an object");
        goto cleanup;
    }
    pt_dec_native(Z_ARRVAL_P(return_value));

cleanup:
    for (size_t i = 0; i < context.nodes.count; i++) {
        pt_dec_err *node = context.nodes.items[i];
        zend_string_release(node->pointer);
        if (node->message != NULL) {
            zend_string_release(node->message);
        }
        pt_dec_list_free(&node->subs);
        efree(node);
    }
    pt_dec_list_free(&context.nodes);
    if (context.path != NULL) {
        efree(context.path);
    }
}

ZEND_METHOD(Polyspec_Template_AstDecoder, decode)
{
    zend_string *json;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(json)
    ZEND_PARSE_PARAMETERS_END();

    pt_ast_decode(json, return_value);
}
