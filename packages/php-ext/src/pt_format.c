/*
 * The value classes and the helpers of the formatter (S10): FormatError and FormatResult hold the text or the
 * error of a format, Expression joins the tokens of a tag with the separators of the style, and Invariant compares
 * two ASTs without their spans and indentation. Each method is the method of the library class with the same name.
 */
#include "pt.h"

static zend_class_entry *pt_format_error_ce;
static zend_class_entry *pt_format_result_ce;

void pt_format_register(zend_class_entry *error, zend_class_entry *result)
{
    pt_format_error_ce = error;
    pt_format_result_ce = result;
}

/* ----------------------------------------------------------------------------------------------- */
/* FormatError and FormatResult                                                                     */
/* ----------------------------------------------------------------------------------------------- */

ZEND_METHOD(Polyspec_Template_Format_FormatError, __construct)
{
    zend_string *reason, *code = NULL, *message;
    zend_long line, col;
    ZEND_PARSE_PARAMETERS_START(5, 5)
        Z_PARAM_STR(reason)
        Z_PARAM_STR_OR_NULL(code)
        Z_PARAM_LONG(line)
        Z_PARAM_LONG(col)
        Z_PARAM_STR(message)
    ZEND_PARSE_PARAMETERS_END();
    zend_object *self = Z_OBJ_P(ZEND_THIS);
    zend_update_property_str(pt_format_error_ce, self, ZEND_STRL("reason"), reason);
    if (code != NULL) {
        zend_update_property_str(pt_format_error_ce, self, ZEND_STRL("code"), code);
    } else {
        zend_update_property_null(pt_format_error_ce, self, ZEND_STRL("code"));
    }
    zend_update_property_long(pt_format_error_ce, self, ZEND_STRL("line"), line);
    zend_update_property_long(pt_format_error_ce, self, ZEND_STRL("col"), col);
    zend_update_property_str(pt_format_error_ce, self, ZEND_STRL("message"), message);
}

/* Puts one property of a FormatError into an array under the property's name. */
static void pt_fmt_error_put(zval *array, zend_object *object, const char *name, size_t length)
{
    zval rv, copy;
    zval *value = zend_read_property(pt_format_error_ce, object, name, length, 1, &rv);
    ZVAL_COPY(&copy, value);
    zend_hash_str_update(Z_ARRVAL_P(array), name, length, &copy);
}

ZEND_METHOD(Polyspec_Template_Format_FormatError, toArray)
{
    ZEND_PARSE_PARAMETERS_NONE();
    zend_object *self = Z_OBJ_P(ZEND_THIS);
    array_init(return_value);
    pt_fmt_error_put(return_value, self, ZEND_STRL("reason"));
    pt_fmt_error_put(return_value, self, ZEND_STRL("code"));
    pt_fmt_error_put(return_value, self, ZEND_STRL("line"));
    pt_fmt_error_put(return_value, self, ZEND_STRL("col"));
    pt_fmt_error_put(return_value, self, ZEND_STRL("message"));
}

/* Sets the three properties of a FormatResult; a NULL text, a NULL error and the changed flag as the library. */
static void pt_fmt_result_fill(zend_object *object, zend_string *text, bool changed, zend_object *error)
{
    if (text != NULL) {
        zend_update_property_str(pt_format_result_ce, object, ZEND_STRL("text"), text);
    } else {
        zend_update_property_null(pt_format_result_ce, object, ZEND_STRL("text"));
    }
    zend_update_property_bool(pt_format_result_ce, object, ZEND_STRL("changed"), changed);
    if (error != NULL) {
        zval value;
        ZVAL_OBJ(&value, error);
        zend_update_property(pt_format_result_ce, object, ZEND_STRL("error"), &value);
    } else {
        zend_update_property_null(pt_format_result_ce, object, ZEND_STRL("error"));
    }
}

ZEND_METHOD(Polyspec_Template_Format_FormatResult, __construct)
{
    zend_string *text = NULL;
    bool changed;
    zend_object *error = NULL;
    ZEND_PARSE_PARAMETERS_START(3, 3)
        Z_PARAM_STR_OR_NULL(text)
        Z_PARAM_BOOL(changed)
        Z_PARAM_OBJ_OF_CLASS_OR_NULL(error, pt_format_error_ce)
    ZEND_PARSE_PARAMETERS_END();
    pt_fmt_result_fill(Z_OBJ_P(ZEND_THIS), text, changed, error);
}

ZEND_METHOD(Polyspec_Template_Format_FormatResult, text)
{
    zend_string *text;
    bool changed;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_STR(text)
        Z_PARAM_BOOL(changed)
    ZEND_PARSE_PARAMETERS_END();
    object_init_ex(return_value, pt_format_result_ce);
    pt_fmt_result_fill(Z_OBJ_P(return_value), text, changed, NULL);
}

ZEND_METHOD(Polyspec_Template_Format_FormatResult, error)
{
    zend_object *error;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_OBJ_OF_CLASS(error, pt_format_error_ce)
    ZEND_PARSE_PARAMETERS_END();
    object_init_ex(return_value, pt_format_result_ce);
    pt_fmt_result_fill(Z_OBJ_P(return_value), NULL, false, error);
}

/* ----------------------------------------------------------------------------------------------- */
/* Expression                                                                                       */
/* ----------------------------------------------------------------------------------------------- */

typedef struct pt_fmt_token {
    zend_string *text;
    zend_string *kind;
} pt_fmt_token;

static bool pt_fmt_starts_with_dot(zend_string *text)
{
    return ZSTR_LEN(text) > 0 && ZSTR_VAL(text)[0] == '.';
}

/* A name that can be called or indexed: a variable or a function name, not a keyword. */
static bool pt_fmt_is_name(const pt_fmt_token *token)
{
    return zend_string_equals_literal(token->kind, "variable")
        || (zend_string_equals_literal(token->kind, "function") && !pt_fmt_starts_with_dot(token->text));
}

/* DOT_IDENT and DOT_INDEX tokens (EXP-5), which stay adjacent to the token on their left. */
static bool pt_fmt_is_accessor(const pt_fmt_token *token)
{
    return zend_string_equals_literal(token->kind, "property")
        || (zend_string_equals_literal(token->kind, "function") && pt_fmt_starts_with_dot(token->text));
}

/* Whether the token can end an operand, so that a following `-` is binary and a following `[` is an index. */
static bool pt_fmt_ends_operand(const pt_fmt_token *token)
{
    if (token == NULL) {
        return false;
    }
    if (zend_string_equals_literal(token->text, ")") || zend_string_equals_literal(token->text, "]")) {
        return true;
    }
    if (zend_string_equals_literal(token->kind, "keyword")) {
        return !zend_string_equals_literal(token->text, "in");
    }

    return !zend_string_equals_literal(token->kind, "operator");
}

static const char *pt_fmt_separator(const pt_fmt_token *previous, const pt_fmt_token *current, bool previous_unary)
{
    if (zend_string_equals_literal(previous->text, "::") || zend_string_equals_literal(current->text, "::")) {
        return "";
    }
    if (zend_string_equals_literal(current->text, ",") || zend_string_equals_literal(current->text, ")")
        || zend_string_equals_literal(current->text, "]") || pt_fmt_is_accessor(current)) {
        return "";
    }
    if (zend_string_equals_literal(previous->text, "(") || zend_string_equals_literal(previous->text, "[")
        || zend_string_equals_literal(previous->text, "...") || previous_unary) {
        return "";
    }
    if (zend_string_equals_literal(current->text, "(")) {
        return pt_fmt_is_name(previous) || pt_fmt_is_accessor(previous) ? "" : " ";
    }
    if (zend_string_equals_literal(current->text, "[")) {
        return pt_fmt_ends_operand(previous) ? "" : " ";
    }

    return " ";
}

/* Reads one token: an array with the string values of the keys text and kind. */
static bool pt_fmt_token_read(zval *value, pt_fmt_token *token)
{
    if (Z_TYPE_P(value) != IS_ARRAY) {
        return false;
    }
    zval *text = zend_hash_str_find(Z_ARRVAL_P(value), ZEND_STRL("text"));
    zval *kind = zend_hash_str_find(Z_ARRVAL_P(value), ZEND_STRL("kind"));
    if (text == NULL || Z_TYPE_P(text) != IS_STRING || kind == NULL || Z_TYPE_P(kind) != IS_STRING) {
        return false;
    }
    token->text = Z_STR_P(text);
    token->kind = Z_STR_P(kind);

    return true;
}

ZEND_METHOD(Polyspec_Template_Format_Expression, join)
{
    HashTable *tokens;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_ARRAY_HT(tokens)
    ZEND_PARSE_PARAMETERS_END();
    if (zend_hash_num_elements(tokens) == 0) {
        RETURN_EMPTY_STRING();
    }
    if (!zend_array_is_list(tokens)) {
        zend_argument_type_error(1, "must be a list of arrays with the string keys text and kind");
        return;
    }
    uint32_t count = zend_hash_num_elements(tokens);
    pt_fmt_token *items = emalloc(sizeof(pt_fmt_token) * count);
    bool *unary = emalloc(sizeof(bool) * count);
    uint32_t index = 0;
    zval *value;
    ZEND_HASH_FOREACH_VAL(tokens, value) {
        if (!pt_fmt_token_read(value, &items[index])) {
            efree(items);
            efree(unary);
            zend_argument_type_error(1, "must be a list of arrays with the string keys text and kind");
            return;
        }
        index++;
    } ZEND_HASH_FOREACH_END();

    for (uint32_t i = 0; i < count; i++) {
        bool minus = zend_string_equals_literal(items[i].text, "-");
        unary[i] = zend_string_equals_literal(items[i].text, "!")
            || (minus && !pt_fmt_ends_operand(i > 0 ? &items[i - 1] : NULL));
    }
    smart_str output = {0};
    smart_str_append(&output, items[0].text);
    for (uint32_t i = 1; i < count; i++) {
        smart_str_appends(&output, pt_fmt_separator(&items[i - 1], &items[i], unary[i - 1]));
        smart_str_append(&output, items[i].text);
    }
    efree(items);
    efree(unary);
    smart_str_0(&output);
    RETURN_NEW_STR(output.s);
}

/* ----------------------------------------------------------------------------------------------- */
/* Invariant                                                                                        */
/* ----------------------------------------------------------------------------------------------- */

/* Copies an AST value without its `span` fields; a list stays a list (array_is_list decides the keys). */
static void pt_fmt_without_spans(zval *value, zval *result)
{
    if (Z_TYPE_P(value) != IS_ARRAY) {
        ZVAL_COPY(result, value);
        return;
    }
    HashTable *source = Z_ARRVAL_P(value);
    bool list = zend_array_is_list(source);
    array_init(result);
    zend_ulong index;
    zend_string *key;
    zval *field;
    ZEND_HASH_FOREACH_KEY_VAL(source, index, key, field) {
        if (key != NULL && zend_string_equals_literal(key, "span")) {
            continue;
        }
        zval copy;
        pt_fmt_without_spans(field, &copy);
        if (list) {
            zend_hash_next_index_insert(Z_ARRVAL_P(result), &copy);
        } else if (key != NULL) {
            zend_hash_update(Z_ARRVAL_P(result), key, &copy);
        } else {
            zend_hash_index_update(Z_ARRVAL_P(result), index, &copy);
        }
    } ZEND_HASH_FOREACH_END();
}

/* The text without the spaces and tabs at the start of each line: the byte form of the replacement of
 * `(^|\n)[ \t]+` by its first group. */
static zend_string *pt_fmt_strip_indentation(zend_string *text)
{
    const char *bytes = ZSTR_VAL(text);
    size_t length = ZSTR_LEN(text);
    smart_str output = {0};
    size_t i = 0;
    while (i < length) {
        bool at_line_start = i == 0 || bytes[i - 1] == '\n';
        if (at_line_start && (bytes[i] == ' ' || bytes[i] == '\t')) {
            while (i < length && (bytes[i] == ' ' || bytes[i] == '\t')) {
                i++;
            }
            continue;
        }
        smart_str_appendc(&output, bytes[i]);
        i++;
    }
    smart_str_0(&output);

    return output.s != NULL ? output.s : ZSTR_EMPTY_ALLOC();
}

/* Whether a value is a Text node with the empty value, which the list drops (Invariant::withoutLineIndentation). */
static bool pt_fmt_is_empty_text_node(zval *item)
{
    if (Z_TYPE_P(item) != IS_ARRAY) {
        return false;
    }
    zval *type = zend_hash_str_find(Z_ARRVAL_P(item), ZEND_STRL("type"));
    zval *value = zend_hash_str_find(Z_ARRVAL_P(item), ZEND_STRL("value"));

    return type != NULL && Z_TYPE_P(type) == IS_STRING && zend_string_equals_literal(Z_STR_P(type), "Text")
        && value != NULL && Z_TYPE_P(value) == IS_STRING && Z_STRLEN_P(value) == 0;
}

static void pt_fmt_without_line_indentation(zval *value, zval *result)
{
    if (Z_TYPE_P(value) != IS_ARRAY) {
        ZVAL_COPY(result, value);
        return;
    }
    HashTable *source = Z_ARRVAL_P(value);
    array_init(result);
    if (zend_array_is_list(source)) {
        zval *field;
        ZEND_HASH_FOREACH_VAL(source, field) {
            zval item;
            pt_fmt_without_line_indentation(field, &item);
            if (pt_fmt_is_empty_text_node(&item)) {
                zval_ptr_dtor(&item);
            } else {
                zend_hash_next_index_insert(Z_ARRVAL_P(result), &item);
            }
        } ZEND_HASH_FOREACH_END();
        return;
    }
    zval *type = zend_hash_str_find(source, ZEND_STRL("type"));
    bool text_node = type != NULL && Z_TYPE_P(type) == IS_STRING && zend_string_equals_literal(Z_STR_P(type), "Text");
    zend_ulong index;
    zend_string *key;
    zval *field;
    ZEND_HASH_FOREACH_KEY_VAL(source, index, key, field) {
        zval copy;
        if (text_node && key != NULL && zend_string_equals_literal(key, "value") && Z_TYPE_P(field) == IS_STRING) {
            ZVAL_STR(&copy, pt_fmt_strip_indentation(Z_STR_P(field)));
        } else {
            pt_fmt_without_line_indentation(field, &copy);
        }
        if (key != NULL) {
            zend_hash_update(Z_ARRVAL_P(result), key, &copy);
        } else {
            zend_hash_index_update(Z_ARRVAL_P(result), index, &copy);
        }
    } ZEND_HASH_FOREACH_END();
}

/* The structural equality of two values: arrays by their keys and values, anything else by identity (===). */
static bool pt_fmt_equal(zval *left, zval *right)
{
    if (Z_TYPE_P(left) != IS_ARRAY || Z_TYPE_P(right) != IS_ARRAY) {
        return zend_is_identical(left, right);
    }
    HashTable *a = Z_ARRVAL_P(left);
    HashTable *b = Z_ARRVAL_P(right);
    if (zend_hash_num_elements(a) != zend_hash_num_elements(b) || zend_array_is_list(a) != zend_array_is_list(b)) {
        return false;
    }
    zend_ulong index;
    zend_string *key;
    zval *item;
    ZEND_HASH_FOREACH_KEY_VAL(a, index, key, item) {
        zval *other = key != NULL ? zend_hash_find(b, key) : zend_hash_index_find(b, index);
        if (other == NULL || !pt_fmt_equal(item, other)) {
            return false;
        }
    } ZEND_HASH_FOREACH_END();

    return true;
}

ZEND_METHOD(Polyspec_Template_Format_Invariant, withoutSpans)
{
    zval *value;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_ZVAL(value)
    ZEND_PARSE_PARAMETERS_END();
    pt_fmt_without_spans(value, return_value);
}

ZEND_METHOD(Polyspec_Template_Format_Invariant, withoutLineIndentation)
{
    zval *value;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_ZVAL(value)
    ZEND_PARSE_PARAMETERS_END();
    pt_fmt_without_line_indentation(value, return_value);
}

ZEND_METHOD(Polyspec_Template_Format_Invariant, sameTree)
{
    zval *left, *right;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_ZVAL(left)
        Z_PARAM_ZVAL(right)
    ZEND_PARSE_PARAMETERS_END();
    zval a, b;
    pt_fmt_without_spans(left, &a);
    pt_fmt_without_spans(right, &b);
    bool same = pt_fmt_equal(&a, &b);
    zval_ptr_dtor(&a);
    zval_ptr_dtor(&b);
    RETURN_BOOL(same);
}
