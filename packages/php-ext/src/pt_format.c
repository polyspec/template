/*
 * The value classes and the helpers of the formatter (S10): FormatError and FormatResult hold the text or the
 * error of a format, Expression joins the tokens of a tag with the separators of the style, and Invariant compares
 * two ASTs without their spans and indentation. Each method is the method of the library class with the same name.
 * The tag bodies (Body) and the analyzers (PackageAnalyzer) are registered here too, and Formatter::format calls them
 * and the classes above.
 */
#include "pt.h"
#include "Zend/zend_exceptions.h"
#include "ext/spl/spl_exceptions.h"

static zend_class_entry *pt_format_error_ce;
static zend_class_entry *pt_format_result_ce;
static zend_class_entry *pt_fmt_analyzer_ce;
static zend_class_entry *pt_fmt_package_analyzer_ce;

void pt_format_register(zend_class_entry *error, zend_class_entry *result, zend_class_entry *analyzer,
    zend_class_entry *package_analyzer)
{
    pt_format_error_ce = error;
    pt_format_result_ce = result;
    pt_fmt_analyzer_ce = analyzer;
    pt_fmt_package_analyzer_ce = package_analyzer;
}

/* ----------------------------------------------------------------------------------------------- */
/* FormatError and FormatResult                                                                     */
/* ----------------------------------------------------------------------------------------------- */

/* Sets the five properties of a FormatError; a NULL code is null. */
static void pt_fmt_error_fill(zend_object *self, zend_string *reason, zend_string *code, zend_long line, zend_long col,
    zend_string *message)
{
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
    pt_fmt_error_fill(Z_OBJ_P(ZEND_THIS), reason, code, line, col, message);
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

static bool pt_fmt_starts_with_dot(pt_s text)
{
    return text.n > 0 && text.s[0] == '.';
}

/* A name that can be called or indexed: a variable or a function name, not a keyword. */
static bool pt_fmt_is_name(const pt_format_token *token)
{
    return PT_EQ(token->kind, "variable")
        || (PT_EQ(token->kind, "function") && !pt_fmt_starts_with_dot(token->text));
}

/* DOT_IDENT and DOT_INDEX tokens (EXP-5), which stay adjacent to the token on their left. */
static bool pt_fmt_is_accessor(const pt_format_token *token)
{
    return PT_EQ(token->kind, "property")
        || (PT_EQ(token->kind, "function") && pt_fmt_starts_with_dot(token->text));
}

/* Whether the token can end an operand, so that a following `-` is binary and a following `[` is an index. */
static bool pt_fmt_ends_operand(const pt_format_token *token)
{
    if (token == NULL) {
        return false;
    }
    if (PT_EQ(token->text, ")") || PT_EQ(token->text, "]")) {
        return true;
    }
    if (PT_EQ(token->kind, "keyword")) {
        return !PT_EQ(token->text, "in");
    }

    return !PT_EQ(token->kind, "operator");
}

static const char *pt_fmt_separator(const pt_format_token *previous, const pt_format_token *current, bool previous_unary)
{
    if (PT_EQ(previous->text, "::") || PT_EQ(current->text, "::")) {
        return "";
    }
    if (PT_EQ(current->text, ",") || PT_EQ(current->text, ")")
        || PT_EQ(current->text, "]") || pt_fmt_is_accessor(current)) {
        return "";
    }
    if (PT_EQ(previous->text, "(") || PT_EQ(previous->text, "[")
        || PT_EQ(previous->text, "...") || previous_unary) {
        return "";
    }
    if (PT_EQ(current->text, "(")) {
        return pt_fmt_is_name(previous) || pt_fmt_is_accessor(previous) ? "" : " ";
    }
    if (PT_EQ(current->text, "[")) {
        return pt_fmt_ends_operand(previous) ? "" : " ";
    }

    return " ";
}

/* Reads one token: an array with the string values of the keys text and kind. */
static bool pt_fmt_token_read(zval *value, pt_format_token *token)
{
    if (Z_TYPE_P(value) != IS_ARRAY) {
        return false;
    }
    zval *text = zend_hash_str_find(Z_ARRVAL_P(value), ZEND_STRL("text"));
    zval *kind = zend_hash_str_find(Z_ARRVAL_P(value), ZEND_STRL("kind"));
    if (text == NULL || Z_TYPE_P(text) != IS_STRING || kind == NULL || Z_TYPE_P(kind) != IS_STRING) {
        return false;
    }
    token->text = (pt_s){Z_STRVAL_P(text), Z_STRLEN_P(text)};
    token->kind = (pt_s){Z_STRVAL_P(kind), Z_STRLEN_P(kind)};

    return true;
}

zend_string *pt_format_join(const pt_format_token *tokens, uint32_t count)
{
    bool *unary = emalloc(sizeof(bool) * count);
    for (uint32_t i = 0; i < count; i++) {
        bool minus = PT_EQ(tokens[i].text, "-");
        unary[i] = PT_EQ(tokens[i].text, "!")
            || (minus && !pt_fmt_ends_operand(i > 0 ? &tokens[i - 1] : NULL));
    }
    smart_str output = {0};
    smart_str_appendl(&output, tokens[0].text.s, tokens[0].text.n);
    for (uint32_t i = 1; i < count; i++) {
        smart_str_appends(&output, pt_fmt_separator(&tokens[i - 1], &tokens[i], unary[i - 1]));
        smart_str_appendl(&output, tokens[i].text.s, tokens[i].text.n);
    }
    efree(unary);
    smart_str_0(&output);

    return output.s;
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
    pt_format_token *items = emalloc(sizeof(pt_format_token) * count);
    uint32_t index = 0;
    zval *value;
    ZEND_HASH_FOREACH_VAL(tokens, value) {
        if (!pt_fmt_token_read(value, &items[index])) {
            efree(items);
            zend_argument_type_error(1, "must be a list of arrays with the string keys text and kind");
            return;
        }
        index++;
    } ZEND_HASH_FOREACH_END();

    zend_string *joined = pt_format_join(items, count);
    efree(items);
    RETURN_NEW_STR(joined);
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

/* ----------------------------------------------------------------------------------------------- */
/* PackageAnalyzer                                                                                  */
/* ----------------------------------------------------------------------------------------------- */

/* PackageAnalyzer::analyze and parse call the static method of AstProgram with the same three arguments; an exception
 * of the call passes unchanged. */
static void pt_package_analyzer_delegate(INTERNAL_FUNCTION_PARAMETERS, const char *method, size_t length)
{
    zend_string *source, *name;
    zval *options;
    ZEND_PARSE_PARAMETERS_START(3, 3)
        Z_PARAM_STR(source)
        Z_PARAM_STR(name)
        Z_PARAM_ARRAY(options)
    ZEND_PARSE_PARAMETERS_END();

    zend_string *class_name = zend_string_init(ZEND_STRL("Polyspec\\Template\\AstProgram"), 0);
    zend_class_entry *program = zend_lookup_class(class_name);
    zend_string_release(class_name);
    zend_function *target = program != NULL ? zend_hash_str_find_ptr(&program->function_table, method, length) : NULL;
    if (target == NULL) {
        zend_throw_error(NULL, "The class Polyspec\\Template\\AstProgram is not loaded");
        RETURN_THROWS();
    }
    zval arguments[3];
    ZVAL_STR_COPY(&arguments[0], source);
    ZVAL_STR_COPY(&arguments[1], name);
    ZVAL_COPY(&arguments[2], options);
    zend_call_known_function(target, NULL, program, return_value, 3, arguments, NULL);
    zval_ptr_dtor(&arguments[0]);
    zval_ptr_dtor(&arguments[1]);
    zval_ptr_dtor(&arguments[2]);
}

ZEND_METHOD(Polyspec_Template_Format_PackageAnalyzer, analyze)
{
    pt_package_analyzer_delegate(INTERNAL_FUNCTION_PARAM_PASSTHRU, ZEND_STRL("analyze"));
}

ZEND_METHOD(Polyspec_Template_Format_PackageAnalyzer, parse)
{
    pt_package_analyzer_delegate(INTERNAL_FUNCTION_PARAM_PASSTHRU, ZEND_STRL("parse"));
}

/* ----------------------------------------------------------------------------------------------- */
/* Body                                                                                             */
/* ----------------------------------------------------------------------------------------------- */

/* A token of a tag body: its byte range in the source and its EDT-8 kind, borrowed from the array of the call. */
typedef struct pt_body_token {
    size_t start, end;
    zend_string *kind;
} pt_body_token;

/* The tag kinds that Body formats (the kinds of the library's match, besides the two that are kept as written). */
static bool pt_body_is_kind(zend_string *kind)
{
    static const char *const kinds[] = {
        "echo", "if", "elseif", "else", "close", "ifblock", "include", "block", "for", "assignment",
    };
    pt_s text = {ZSTR_VAL(kind), ZSTR_LEN(kind)};
    for (size_t i = 0; i < sizeof(kinds) / sizeof(kinds[0]); i++) {
        if (pt_eq(text, kinds[i], strlen(kinds[i]))) {
            return true;
        }
    }

    return false;
}

/* Reads one token of a body; its range lies inside the body [from, to] and its kind is a string. */
static bool pt_body_token_read(zval *value, size_t body_start, size_t body_end, pt_body_token *token)
{
    if (Z_TYPE_P(value) != IS_ARRAY) {
        return false;
    }
    zval *start = zend_hash_str_find(Z_ARRVAL_P(value), ZEND_STRL("start"));
    zval *end = zend_hash_str_find(Z_ARRVAL_P(value), ZEND_STRL("end"));
    zval *kind = zend_hash_str_find(Z_ARRVAL_P(value), ZEND_STRL("kind"));
    if (start == NULL || Z_TYPE_P(start) != IS_LONG || end == NULL || Z_TYPE_P(end) != IS_LONG
        || kind == NULL || Z_TYPE_P(kind) != IS_STRING) {
        return false;
    }
    zend_long from = Z_LVAL_P(start);
    zend_long to = Z_LVAL_P(end);
    if (from < (zend_long)body_start || to < from || (size_t)to > body_end) {
        return false;
    }
    token->start = (size_t)from;
    token->end = (size_t)to;
    token->kind = Z_STR_P(kind);

    return true;
}

/* Whether the bytes are all spaces, tabs, carriage returns and line feeds (the WHITESPACE pattern of Body). */
static bool pt_body_is_whitespace(const char *bytes, size_t length)
{
    for (size_t i = 0; i < length; i++) {
        if (bytes[i] != ' ' && bytes[i] != '\t' && bytes[i] != '\r' && bytes[i] != '\n') {
            return false;
        }
    }

    return true;
}

/* Whether a code point is one that JavaScript's String.prototype.trim removes (the TRIM class of Body). */
static bool pt_body_is_trimmed(uint32_t code)
{
    switch (code) {
        case 0x09: case 0x0A: case 0x0B: case 0x0C: case 0x0D: case 0x20: case 0xA0: case 0x1680:
        case 0x2028: case 0x2029: case 0x202F: case 0x205F: case 0x3000: case 0xFEFF:
            return true;
        default:
            return code >= 0x2000 && code <= 0x200A;
    }
}

/* The code point of the valid UTF-8 sequence of `width` bytes at bytes. */
static uint32_t pt_body_code_point(const char *bytes, size_t width)
{
    const unsigned char *s = (const unsigned char *)bytes;
    switch (width) {
        case 1:
            return s[0];
        case 2:
            return ((s[0] & 0x1Fu) << 6) | (s[1] & 0x3Fu);
        case 3:
            return ((s[0] & 0x0Fu) << 12) | ((s[1] & 0x3Fu) << 6) | (s[2] & 0x3Fu);
        default:
            return ((s[0] & 0x07u) << 18) | ((s[1] & 0x3Fu) << 12) | ((s[2] & 0x3Fu) << 6) | (s[3] & 0x3Fu);
    }
}

/* The text of [start, end) of the source without the code points that trim removes at both ends. The library
 * runs preg_replace with the /u flag, which gives null for invalid UTF-8, and casts that null to the empty text. */
static zend_string *pt_body_trimmed(zend_string *source, size_t start, size_t end)
{
    const char *text = ZSTR_VAL(source) + start;
    size_t length = end - start;
    if (pt_utf8_first_invalid(text, length) != length) {
        return ZSTR_EMPTY_ALLOC();
    }
    size_t first = 0;
    size_t last = length;
    while (first < last) {
        size_t width = pt_utf8_width((unsigned char)text[first]);
        if (!pt_body_is_trimmed(pt_body_code_point(text + first, width))) {
            break;
        }
        first += width;
    }
    while (last > first) {
        size_t begin = last - 1;
        while (begin > first && ((unsigned char)text[begin] & 0xC0) == 0x80) {
            begin--;
        }
        if (!pt_body_is_trimmed(pt_body_code_point(text + begin, last - begin))) {
            break;
        }
        last = begin;
    }

    return zend_string_init(text + first, last - first, 0);
}

/* Splits a block tag body at the spaces and tabs outside string literals (Body::words). Each word is a range of the
 * text: a word is never joined from parts that are not next to each other. */
static uint32_t pt_body_words(const char *text, size_t length, pt_s *words)
{
    uint32_t count = 0;
    size_t begin = 0;
    size_t end = 0; /* the current word is [begin, end) and is empty when begin equals end */
    bool quoted = false;
    char quote = 0;
    for (size_t index = 0; index < length; index++) {
        char c = text[index];
        if (quoted) {
            end = index + 1;
            if (c == '\\') {
                if (index + 1 < length) {
                    end = index + 2;
                }
                index++;
            } else if (c == quote) {
                quoted = false;
            }
            continue;
        }
        if (c == ' ' || c == '\t') {
            if (begin != end) {
                words[count++] = (pt_s){text + begin, end - begin};
            }
            begin = index + 1;
            end = index + 1;
            continue;
        }
        if (c == '"' || c == '\'') {
            quote = c;
            quoted = true;
        }
        if (begin == end) {
            begin = index;
        }
        end = index + 1;
    }
    if (begin != end) {
        words[count++] = (pt_s){text + begin, end - begin};
    }

    return count;
}

/* Appends the text of a token of the source. */
static void pt_body_append(smart_str *out, zend_string *source, const pt_body_token *token)
{
    smart_str_appendl(out, ZSTR_VAL(source) + token->start, token->end - token->start);
}

/* `sigil rest` as Body::withRest writes it: the sigil alone for an empty rest, and null when there is no rest. Takes
 * the rest. */
static zend_string *pt_body_with_rest(const char *sigil, zend_string *rest)
{
    if (rest == NULL) {
        return NULL;
    }
    smart_str out = {0};
    smart_str_appends(&out, sigil);
    if (ZSTR_LEN(rest) > 0) {
        smart_str_appendc(&out, ' ');
        smart_str_append(&out, rest);
    }
    zend_string_release(rest);
    smart_str_0(&out);

    return out.s;
}

/* The expression tokens that start at `from` joined with the separators of the style (Body::expressionText). Returns
 * null when anything other than whitespace lies between them, or when there is no token. Returns a new string. */
static zend_string *pt_body_expression(zend_string *source, size_t body_end, const pt_body_token *tokens, uint32_t count,
    size_t from)
{
    if (count == 0) {
        return NULL;
    }
    pt_format_token *joined = emalloc(sizeof(pt_format_token) * count);
    size_t cursor = from;
    for (uint32_t i = 0; i < count; i++) {
        const pt_body_token *token = &tokens[i];
        if (token->start < cursor || !pt_body_is_whitespace(ZSTR_VAL(source) + cursor, token->start - cursor)) {
            efree(joined);
            return NULL;
        }
        joined[i].text = (pt_s){ZSTR_VAL(source) + token->start, token->end - token->start};
        joined[i].kind = (pt_s){ZSTR_VAL(token->kind), ZSTR_LEN(token->kind)};
        cursor = token->end;
    }
    if (!pt_body_is_whitespace(ZSTR_VAL(source) + cursor, body_end - cursor)) {
        efree(joined);
        return NULL;
    }
    zend_string *text = pt_format_join(joined, count);
    efree(joined);

    return text;
}

/* The formatted body of a tag whose kind is known; tokens[0] is the sigil and the rest follow it. Returns a new string,
 * or null for a tag that is kept as written. */
static zend_string *pt_body_format(zend_string *kind, zend_string *source, size_t body_end, const pt_body_token *tokens,
    uint32_t count)
{
    const pt_body_token *sigil = &tokens[0];
    const pt_body_token *rest = tokens + 1;
    uint32_t rest_count = count - 1;

    if (zend_string_equals_literal(kind, "echo")) {
        return pt_body_with_rest("=", pt_body_expression(source, body_end, rest, rest_count, sigil->end));
    }
    if (zend_string_equals_literal(kind, "if")) {
        return pt_body_with_rest("?", pt_body_expression(source, body_end, rest, rest_count, sigil->end));
    }
    if (zend_string_equals_literal(kind, "elseif")) {
        return pt_body_with_rest(":?", pt_body_expression(source, body_end, rest, rest_count, sigil->end));
    }
    if (zend_string_equals_literal(kind, "else")) {
        return zend_string_init(":", 1, 0);
    }
    if (zend_string_equals_literal(kind, "close")) {
        return zend_string_init("/", 1, 0);
    }
    if (zend_string_equals_literal(kind, "ifblock")) {
        return pt_body_with_rest("?#", pt_body_trimmed(source, sigil->end, body_end));
    }
    if (zend_string_equals_literal(kind, "include")) {
        return pt_body_with_rest("+", pt_body_trimmed(source, sigil->end, body_end));
    }
    if (zend_string_equals_literal(kind, "block")) {
        zend_string *after = pt_body_trimmed(source, sigil->end, body_end);
        pt_s *words = emalloc(sizeof(pt_s) * (ZSTR_LEN(after) + 1));
        uint32_t word_count = pt_body_words(ZSTR_VAL(after), ZSTR_LEN(after), words);
        smart_str joined = {0};
        for (uint32_t i = 0; i < word_count; i++) {
            if (i > 0) {
                smart_str_appendc(&joined, ' ');
            }
            smart_str_appendl(&joined, words[i].s, words[i].n);
        }
        efree(words);
        zend_string_release(after);
        smart_str_0(&joined);
        zend_string *imploded = joined.s != NULL ? joined.s : ZSTR_EMPTY_ALLOC();

        return pt_body_with_rest("#", imploded);
    }
    if (zend_string_equals_literal(kind, "for")) {
        // The loop variable and its `=`, then the iterated expression.
        if (rest_count < 3) {
            return NULL;
        }
        zend_string *iter = pt_body_expression(source, body_end, rest + 2, rest_count - 2, rest[1].end);
        if (iter == NULL) {
            return NULL;
        }
        smart_str out = {0};
        smart_str_appends(&out, "@ ");
        pt_body_append(&out, source, &rest[0]);
        smart_str_appends(&out, " = ");
        smart_str_append(&out, iter);
        zend_string_release(iter);
        smart_str_0(&out);

        return out.s;
    }
    /* assignment: the assigned name and its operator, then the value unless the operator is `++` or `--`. */
    if (rest_count < 2) {
        return NULL;
    }
    const pt_body_token *name = &rest[0];
    const pt_body_token *op = &rest[1];
    smart_str out = {0};
    if (rest_count == 2) {
        if (!pt_body_is_whitespace(ZSTR_VAL(source) + op->end, body_end - op->end)) {
            return NULL;
        }
        smart_str_appendc(&out, ':');
        pt_body_append(&out, source, name);
        pt_body_append(&out, source, op);
        smart_str_0(&out);

        return out.s;
    }
    zend_string *value = pt_body_expression(source, body_end, rest + 2, rest_count - 2, op->end);
    if (value == NULL) {
        return NULL;
    }
    smart_str_appendc(&out, ':');
    pt_body_append(&out, source, name);
    smart_str_appendc(&out, ' ');
    pt_body_append(&out, source, op);
    smart_str_appendc(&out, ' ');
    smart_str_append(&out, value);
    zend_string_release(value);
    smart_str_0(&out);

    return out.s;
}

ZEND_METHOD(Polyspec_Template_Format_Body, format)
{
    zend_string *kind, *source;
    zend_long body_start, body_end;
    HashTable *tokens;
    ZEND_PARSE_PARAMETERS_START(5, 5)
        Z_PARAM_STR(kind)
        Z_PARAM_STR(source)
        Z_PARAM_LONG(body_start)
        Z_PARAM_LONG(body_end)
        Z_PARAM_ARRAY_HT(tokens)
    ZEND_PARSE_PARAMETERS_END();
    if (body_start < 0 || body_end < body_start || (size_t)body_end > ZSTR_LEN(source)) {
        zend_argument_value_error(3, "must be a range inside the source");
        RETURN_THROWS();
    }
    // A body with a line terminator, a comment and a directive are kept as written.
    for (zend_long i = body_start; i < body_end; i++) {
        if (ZSTR_VAL(source)[i] == '\r' || ZSTR_VAL(source)[i] == '\n') {
            RETURN_NULL();
        }
    }
    if (zend_string_equals_literal(kind, "comment") || zend_string_equals_literal(kind, "directive")) {
        RETURN_NULL();
    }
    if (!pt_body_is_kind(kind)) {
        zend_throw_exception_ex(spl_ce_LogicException, 0, "unknown tag kind %.*s", (int)ZSTR_LEN(kind), ZSTR_VAL(kind));
        RETURN_THROWS();
    }
    uint32_t count = zend_hash_num_elements(tokens);
    if (count == 0) {
        zend_argument_value_error(5, "must not be empty: the first token is the sigil");
        RETURN_THROWS();
    }
    if (!zend_array_is_list(tokens)) {
        zend_argument_type_error(5, "must be a list of arrays with the int keys start and end and the string key kind");
        RETURN_THROWS();
    }
    pt_body_token *items = emalloc(sizeof(pt_body_token) * count);
    uint32_t index = 0;
    zval *value;
    ZEND_HASH_FOREACH_VAL(tokens, value) {
        if (!pt_body_token_read(value, (size_t)body_start, (size_t)body_end, &items[index])) {
            efree(items);
            zend_argument_type_error(5, "must be a list of arrays with the int keys start and end inside the body and the string key kind");
            RETURN_THROWS();
        }
        index++;
    } ZEND_HASH_FOREACH_END();

    zend_string *text = pt_body_format(kind, source, (size_t)body_end, items, count);
    efree(items);
    if (text == NULL) {
        RETURN_NULL();
    }
    RETURN_STR(text);
}

/* ----------------------------------------------------------------------------------------------- */
/* Formatter                                                                                        */
/* ----------------------------------------------------------------------------------------------- */

#define PT_FMT_BOM "\xEF\xBB\xBF"
#define PT_FMT_WHERE "Polyspec\\Template\\Format\\Formatter::format(): "
#define PT_FMT_SOURCE "Polyspec\\Template\\Source"
#define PT_FMT_BODY "Polyspec\\Template\\Format\\Body"
#define PT_FMT_INDENT "Polyspec\\Template\\Format\\Indent"

/* A TemplateError or an InvalidArgumentException of an analyzer call, which Formatter turns into a FormatError. */
typedef struct pt_fmt_caught {
    zend_string *code;    /* the errorCode of a TemplateError, owned; null for an InvalidArgumentException */
    zend_long line, col;
    zend_string *message; /* owned */
} pt_fmt_caught;

/* One edit of the text: [start, end) is replaced by text (owned). The index keeps the order of equal starts. */
typedef struct pt_fmt_edit {
    zend_long start, end;
    zend_string *text;
    uint32_t index;
} pt_fmt_edit;

typedef struct pt_fmt_edits {
    pt_fmt_edit *items;
    uint32_t count, capacity;
} pt_fmt_edits;

/* The options of Formatter::format, read as the library reads them (before the byte order mark is removed). */
typedef struct pt_fmt_options {
    bool indenting;       /* false for indent => null */
    zend_string *indent;  /* the indent unit, owned; set when indenting */
    bool counted;         /* templateBlocks is indent */
    zend_string *name;    /* owned */
    zval parse_options;   /* the array passed to the analyzer: delimiters when they are set */
    bool ranged;
    zend_long range_start, range_end;
} pt_fmt_options;

/* `Class::name(...)` of a static method of a class of the extension, looked up by its name: the result is set in
 * result (null first), and the caller checks EG(exception). `name` is the method name in lower case. */
static void pt_fmt_static(const char *class_name, const char *name, size_t length, zval *result, uint32_t count,
    zval *args)
{
    zend_string *lookup = zend_string_init(class_name, strlen(class_name), 0);
    zend_class_entry *ce = zend_lookup_class(lookup);
    zend_string_release(lookup);
    ZEND_ASSERT(ce != NULL);
    zend_function *fn = zend_hash_str_find_ptr(&ce->function_table, name, length);
    ZEND_ASSERT(fn != NULL);
    ZVAL_NULL(result);
    zend_call_known_function(fn, NULL, ce, result, count, args, NULL);
}

/* `$analyzer->name(...)` of an object of a class that implements Analyzer: the result is set in result (null first),
 * and the caller checks EG(exception). `name` is the method name in lower case. */
static void pt_fmt_method(zval *object, const char *name, size_t length, zval *result, uint32_t count, zval *args)
{
    zend_class_entry *ce = Z_OBJCE_P(object);
    zend_function *fn = zend_hash_str_find_ptr(&ce->function_table, name, length);
    ZEND_ASSERT(fn != NULL);
    ZVAL_NULL(result);
    zend_call_known_instance_method(fn, Z_OBJ_P(object), result, count, args);
}

/* The array value of a key of an array (dereferenced), or null when it is missing. */
static zval *pt_fmt_field(HashTable *table, const char *key, size_t length)
{
    zval *value = zend_hash_str_find(table, key, length);
    if (value != NULL) {
        ZVAL_DEREF(value);
    }

    return value;
}

/* Reads an int field of an array; false when it is missing or not an int. */
static bool pt_fmt_int(HashTable *table, const char *key, size_t length, zend_long *value)
{
    zval *field = pt_fmt_field(table, key, length);
    if (field == NULL || Z_TYPE_P(field) != IS_LONG) {
        return false;
    }
    *value = Z_LVAL_P(field);

    return true;
}

static void pt_fmt_malformed(void)
{
    zend_type_error(PT_FMT_WHERE "the analysis of the analyzer is malformed");
}

/* Sets the result to the FormatResult of a text (FormatResult::text). */
static void pt_fmt_text_result(zval *result, zend_string *text, bool changed)
{
    object_init_ex(result, pt_format_result_ce);
    pt_fmt_result_fill(Z_OBJ_P(result), text, changed, NULL);
}

/* Sets the result to FormatResult::error of a FormatError with these fields (the code is null when it is NULL). */
static void pt_fmt_error_result(zval *result, const char *reason, zend_string *code, zend_long line, zend_long col,
    zend_string *message)
{
    zval error;
    zend_string *reason_string = zend_string_init(reason, strlen(reason), 0);
    object_init_ex(&error, pt_format_error_ce);
    pt_fmt_error_fill(Z_OBJ(error), reason_string, code, line, col, message);
    zend_string_release(reason_string);
    object_init_ex(result, pt_format_result_ce);
    pt_fmt_result_fill(Z_OBJ_P(result), NULL, false, Z_OBJ(error));
    zval_ptr_dtor(&error);
}

/* Takes the exception of an analyzer call when it is an instance of base: a TemplateError keeps its code, line and
 * column; an InvalidArgumentException has none. The exception is cleared and the function returns true. Any other
 * exception stays set and the function returns false. */
static bool pt_fmt_take(zend_class_entry *base, pt_fmt_caught *caught)
{
    zend_object *exception = EG(exception);
    if (exception == NULL || !instanceof_function(exception->ce, base)) {
        return false;
    }
    zval rv;
    caught->code = NULL;
    caught->line = 0;
    caught->col = 0;
    caught->message = zval_get_string(zend_read_property(zend_ce_exception, exception, ZEND_STRL("message"), 1, &rv));
    if (base == pt_error_ce) {
        caught->code = zval_get_string(zend_read_property(pt_error_ce, exception, ZEND_STRL("errorCode"), 1, &rv));
        caught->line = zval_get_long(zend_read_property(pt_error_ce, exception, ZEND_STRL("errorLine"), 1, &rv));
        caught->col = zval_get_long(zend_read_property(pt_error_ce, exception, ZEND_STRL("errorCol"), 1, &rv));
    }
    zend_clear_exception();

    return true;
}

static void pt_fmt_caught_free(pt_fmt_caught *caught)
{
    if (caught->code != NULL) {
        zend_string_release(caught->code);
    }
    zend_string_release(caught->message);
}

static void pt_fmt_edits_add(pt_fmt_edits *edits, zend_long start, zend_long end, zend_string *text)
{
    if (edits->count == edits->capacity) {
        edits->capacity = edits->capacity == 0 ? 8 : edits->capacity * 2;
        edits->items = erealloc(edits->items, sizeof(pt_fmt_edit) * edits->capacity);
    }
    edits->items[edits->count] = (pt_fmt_edit){start, end, text, edits->count};
    edits->count++;
}

static void pt_fmt_edits_free(pt_fmt_edits *edits)
{
    for (uint32_t i = 0; i < edits->count; i++) {
        zend_string_release(edits->items[i].text);
    }
    if (edits->items != NULL) {
        efree(edits->items);
    }
}

/* Orders edits by start; equal starts keep their order (the library's usort is stable). */
static int pt_fmt_edit_compare(const void *left, const void *right)
{
    const pt_fmt_edit *a = left;
    const pt_fmt_edit *b = right;
    if (a->start != b->start) {
        return a->start < b->start ? -1 : 1;
    }

    return a->index < b->index ? -1 : (a->index > b->index);
}

/* substr($text, $from, $length) of the library: the bytes of the text, with a negative length counted from its end. */
static void pt_fmt_substr(smart_str *out, zend_string *text, zend_long from, zend_long length)
{
    zend_long total = (zend_long)ZSTR_LEN(text);
    if (from > total) {
        return;
    }
    zend_long available = total - from;
    if (length < 0) {
        length = available + length;
        if (length <= 0) {
            return;
        }
    }
    if (length > available) {
        length = available;
    }
    smart_str_appendl(out, ZSTR_VAL(text) + from, (size_t)length);
}

/* Formatter::apply of the library: the edits in order, each replacing its range. */
static zend_string *pt_fmt_apply(zend_string *text, const pt_fmt_edits *edits)
{
    smart_str output = {0};
    zend_long cursor = 0;
    for (uint32_t i = 0; i < edits->count; i++) {
        pt_fmt_substr(&output, text, cursor, edits->items[i].start - cursor);
        smart_str_append(&output, edits->items[i].text);
        cursor = edits->items[i].end;
    }
    pt_fmt_substr(&output, text, cursor, (zend_long)ZSTR_LEN(text) - cursor);
    smart_str_0(&output);

    return output.s != NULL ? output.s : ZSTR_EMPTY_ALLOC();
}

/* [line, col] of an offset of a text: Source::position(Source::lineIndex($text), $offset). */
static bool pt_fmt_position(zend_string *text, zend_long offset, zend_long *line, zend_long *col)
{
    zval text_argument, lines, position_arguments[2], position;
    ZVAL_STR_COPY(&text_argument, text);
    pt_fmt_static(PT_FMT_SOURCE, "lineindex", 9, &lines, 1, &text_argument);
    zval_ptr_dtor(&text_argument);
    if (EG(exception)) {
        return false;
    }
    ZVAL_COPY_VALUE(&position_arguments[0], &lines);
    ZVAL_LONG(&position_arguments[1], offset);
    pt_fmt_static(PT_FMT_SOURCE, "position", 8, &position, 2, position_arguments);
    zval_ptr_dtor(&lines);
    if (EG(exception)) {
        return false;
    }
    zval *line_value = zend_hash_index_find(Z_ARRVAL(position), 0);
    zval *col_value = zend_hash_index_find(Z_ARRVAL(position), 1);
    *line = line_value != NULL ? zval_get_long(line_value) : 0;
    *col = col_value != NULL ? zval_get_long(col_value) : 0;
    zval_ptr_dtor(&position);

    return true;
}

/* The indent unit of the library: a run of spaces or one tab. */
static bool pt_fmt_is_unit(zend_string *unit)
{
    size_t length = ZSTR_LEN(unit);
    const char *bytes = ZSTR_VAL(unit);
    if (length == 1 && bytes[0] == '\t') {
        return true;
    }
    if (length == 0) {
        return false;
    }
    for (size_t i = 0; i < length; i++) {
        if (bytes[i] != ' ') {
            return false;
        }
    }

    return true;
}

/* An option of the array, dereferenced; null when the array is null or the key is missing. */
static zval *pt_fmt_option(HashTable *options, const char *key, size_t length)
{
    return options != NULL ? pt_fmt_field(options, key, length) : NULL;
}

/* Reads the options of format as the library does, and throws the library's errors for the values it refuses. */
static bool pt_fmt_read_options(HashTable *options, pt_fmt_options *out)
{
    zval *value;
    array_init(&out->parse_options);

    value = pt_fmt_option(options, ZEND_STRL("indent"));
    if (value == NULL) {
        out->indenting = true;
        out->indent = zend_string_init("  ", 2, 0);
    } else if (Z_TYPE_P(value) == IS_NULL) {
        out->indenting = false;
    } else if (Z_TYPE_P(value) == IS_STRING) {
        out->indenting = true;
        out->indent = zend_string_copy(Z_STR_P(value));
        if (!pt_fmt_is_unit(out->indent)) {
            zend_throw_exception(spl_ce_InvalidArgumentException, "indent must be a run of spaces or one tab", 0);
            return false;
        }
    } else {
        zend_type_error(PT_FMT_WHERE "indent must be a string or null");
        return false;
    }

    value = pt_fmt_option(options, ZEND_STRL("templateBlocks"));
    if (value == NULL || Z_TYPE_P(value) == IS_NULL) {
        out->counted = true;
    } else if (Z_TYPE_P(value) == IS_STRING && zend_string_equals_literal(Z_STR_P(value), "indent")) {
        out->counted = true;
    } else if (Z_TYPE_P(value) == IS_STRING && zend_string_equals_literal(Z_STR_P(value), "flat")) {
        out->counted = false;
    } else {
        zend_throw_exception(spl_ce_InvalidArgumentException, "templateBlocks must be indent or flat", 0);
        return false;
    }

    value = pt_fmt_option(options, ZEND_STRL("name"));
    if (value == NULL || Z_TYPE_P(value) == IS_NULL) {
        out->name = zend_string_init("template.tpl", 12, 0);
    } else if (Z_TYPE_P(value) == IS_STRING) {
        out->name = zend_string_copy(Z_STR_P(value));
    } else {
        zend_type_error(PT_FMT_WHERE "name must be a string or null");
        return false;
    }

    value = pt_fmt_option(options, ZEND_STRL("delimiters"));
    if (value != NULL && Z_TYPE_P(value) != IS_NULL) {
        zval copy;
        ZVAL_COPY(&copy, value);
        zend_hash_str_update(Z_ARRVAL(out->parse_options), ZEND_STRL("delimiters"), &copy);
    }

    value = pt_fmt_option(options, ZEND_STRL("range"));
    if (value != NULL && Z_TYPE_P(value) != IS_NULL) {
        if (Z_TYPE_P(value) != IS_ARRAY || !pt_fmt_int(Z_ARRVAL_P(value), ZEND_STRL("start"), &out->range_start)
            || !pt_fmt_int(Z_ARRVAL_P(value), ZEND_STRL("end"), &out->range_end)) {
            zend_type_error(PT_FMT_WHERE "range must be null or an array with int start and end");
            return false;
        }
        out->ranged = true;
    }

    return true;
}

static void pt_fmt_options_free(pt_fmt_options *options)
{
    if (options->indent != NULL) {
        zend_string_release(options->indent);
    }
    if (options->name != NULL) {
        zend_string_release(options->name);
    }
    zval_ptr_dtor(&options->parse_options);
}

/* The tag edits of the library's loop over the accepted tags: the body of each tag that changes (Body::format). */
static bool pt_fmt_tag_edits(zend_string *text, HashTable *tags, HashTable *tokens, const pt_fmt_options *options,
    pt_fmt_edits *edits)
{
    zval *tag_value;
    ZEND_HASH_FOREACH_VAL(tags, tag_value) {
        ZVAL_DEREF(tag_value);
        zend_long start, end, body_start, body_end;
        if (Z_TYPE_P(tag_value) != IS_ARRAY) {
            pt_fmt_malformed();
            return false;
        }
        HashTable *tag = Z_ARRVAL_P(tag_value);
        zval *kind = pt_fmt_field(tag, ZEND_STRL("kind"));
        if (kind == NULL || Z_TYPE_P(kind) != IS_STRING || !pt_fmt_int(tag, ZEND_STRL("start"), &start)
            || !pt_fmt_int(tag, ZEND_STRL("end"), &end) || !pt_fmt_int(tag, ZEND_STRL("bodyStart"), &body_start)
            || !pt_fmt_int(tag, ZEND_STRL("bodyEnd"), &body_end)) {
            pt_fmt_malformed();
            return false;
        }
        if (zend_string_equals_literal(Z_STR_P(kind), "directive")) {
            continue;
        }
        if (options->ranged && (start < options->range_start || end > options->range_end)) {
            continue;
        }

        zval body_tokens;
        array_init(&body_tokens);
        zval *token_value;
        ZEND_HASH_FOREACH_VAL(tokens, token_value) {
            ZVAL_DEREF(token_value);
            zend_long token_start, token_end;
            if (Z_TYPE_P(token_value) != IS_ARRAY || !pt_fmt_int(Z_ARRVAL_P(token_value), ZEND_STRL("start"), &token_start)
                || !pt_fmt_int(Z_ARRVAL_P(token_value), ZEND_STRL("end"), &token_end)) {
                zval_ptr_dtor(&body_tokens);
                pt_fmt_malformed();
                return false;
            }
            if (token_start >= body_start && token_end <= body_end) {
                zval copy;
                ZVAL_COPY(&copy, token_value);
                zend_hash_next_index_insert(Z_ARRVAL(body_tokens), &copy);
            }
        } ZEND_HASH_FOREACH_END();

        zval args[5], body;
        ZVAL_STR_COPY(&args[0], Z_STR_P(kind));
        ZVAL_STR_COPY(&args[1], text);
        ZVAL_LONG(&args[2], body_start);
        ZVAL_LONG(&args[3], body_end);
        ZVAL_COPY_VALUE(&args[4], &body_tokens);
        pt_fmt_static(PT_FMT_BODY, "format", 6, &body, 5, args);
        zval_ptr_dtor(&args[0]);
        zval_ptr_dtor(&args[1]);
        zval_ptr_dtor(&body_tokens);
        if (EG(exception)) {
            return false;
        }
        if (Z_TYPE(body) != IS_STRING) {
            continue;
        }
        size_t length = (size_t)(body_end - body_start);
        if (ZSTR_LEN(Z_STR(body)) == length && memcmp(ZSTR_VAL(Z_STR(body)), ZSTR_VAL(text) + body_start, length) == 0) {
            zval_ptr_dtor(&body);
        } else {
            pt_fmt_edits_add(edits, body_start, body_end, Z_STR(body));
        }
    } ZEND_HASH_FOREACH_END();

    return true;
}

/* Formatter::format after its options are read: the analysis, the tag and line edits, the parse of the result and the
 * invariant. Sets result and returns true, or returns false with an exception set. */
static bool pt_fmt_run(zend_string *source, HashTable *options, zval *analyzer, zval *result)
{
    pt_fmt_options settings = {0};
    pt_fmt_edits edits = {0};
    pt_fmt_caught caught = {0};
    zend_string *text = NULL, *formatted = NULL;
    zval analysis, after, args[3];
    zend_long line = 0, col = 0;
    bool ok = false;
    ZVAL_NULL(&analysis);
    ZVAL_NULL(&after);

    if (!pt_fmt_read_options(options, &settings)) {
        goto done;
    }
    size_t shift = ZSTR_LEN(source) >= 3 && memcmp(ZSTR_VAL(source), PT_FMT_BOM, 3) == 0 ? 3 : 0;
    text = zend_string_init(ZSTR_VAL(source) + shift, ZSTR_LEN(source) - shift, 0);

    ZVAL_STR_COPY(&args[0], text);
    ZVAL_STR_COPY(&args[1], settings.name);
    ZVAL_COPY(&args[2], &settings.parse_options);
    pt_fmt_method(analyzer, ZEND_STRL("analyze"), &analysis, 3, args);
    zval_ptr_dtor(&args[0]);
    zval_ptr_dtor(&args[1]);
    zval_ptr_dtor(&args[2]);
    if (EG(exception)) {
        if (pt_fmt_take(pt_error_ce, &caught)) {
            pt_fmt_error_result(result, "parse", caught.code, caught.line, caught.col, caught.message);
            pt_fmt_caught_free(&caught);
            ok = true;
        } else if (pt_fmt_take(spl_ce_InvalidArgumentException, &caught)) {
            pt_fmt_error_result(result, "parse", NULL, 0, 0, caught.message);
            pt_fmt_caught_free(&caught);
            ok = true;
        }
        goto done;
    }

    if (Z_TYPE(analysis) != IS_ARRAY) {
        pt_fmt_malformed();
        goto done;
    }
    zval *tags = pt_fmt_field(Z_ARRVAL(analysis), ZEND_STRL("tags"));
    zval *tokens = pt_fmt_field(Z_ARRVAL(analysis), ZEND_STRL("tokens"));
    zval *ast = pt_fmt_field(Z_ARRVAL(analysis), ZEND_STRL("ast"));
    if (tags == NULL || Z_TYPE_P(tags) != IS_ARRAY || tokens == NULL || Z_TYPE_P(tokens) != IS_ARRAY || ast == NULL) {
        pt_fmt_malformed();
        goto done;
    }
    /* The range is shifted by the byte order mark, which the analysis does not see. */
    settings.range_start -= (zend_long)shift;
    settings.range_end -= (zend_long)shift;

    if (!pt_fmt_tag_edits(text, Z_ARRVAL_P(tags), Z_ARRVAL_P(tokens), &settings, &edits)) {
        goto done;
    }
    if (settings.indenting) {
        zval indent_args[5], indentation;
        ZVAL_STR_COPY(&indent_args[0], text);
        ZVAL_COPY(&indent_args[1], tags);
        ZVAL_STR_COPY(&indent_args[2], settings.indent);
        ZVAL_STRING(&indent_args[3], settings.counted ? "indent" : "flat");
        if (settings.ranged) {
            array_init(&indent_args[4]);
            add_assoc_long_ex(&indent_args[4], ZEND_STRL("start"), settings.range_start);
            add_assoc_long_ex(&indent_args[4], ZEND_STRL("end"), settings.range_end);
        } else {
            ZVAL_NULL(&indent_args[4]);
        }
        pt_fmt_static(PT_FMT_INDENT, "edits", 5, &indentation, 5, indent_args);
        for (uint32_t i = 0; i < 5; i++) {
            zval_ptr_dtor(&indent_args[i]);
        }
        if (EG(exception)) {
            goto done;
        }
        if (Z_TYPE(indentation) != IS_ARRAY) {
            zval_ptr_dtor(&indentation);
            pt_fmt_malformed();
            goto done;
        }
        zval *failure = pt_fmt_field(Z_ARRVAL(indentation), ZEND_STRL("error"));
        if (failure != NULL) {
            zend_long index = 0;
            zval *message = Z_TYPE_P(failure) == IS_ARRAY
                ? pt_fmt_field(Z_ARRVAL_P(failure), ZEND_STRL("message")) : NULL;
            bool located = Z_TYPE_P(failure) == IS_ARRAY && pt_fmt_int(Z_ARRVAL_P(failure), ZEND_STRL("index"), &index);
            if (!located || message == NULL || Z_TYPE_P(message) != IS_STRING) {
                zval_ptr_dtor(&indentation);
                pt_fmt_malformed();
                goto done;
            }
            bool positioned = pt_fmt_position(text, index, &line, &col);
            if (positioned) {
                pt_fmt_error_result(result, "html", NULL, line, col, Z_STR_P(message));
                ok = true;
            }
            zval_ptr_dtor(&indentation);
            goto done;
        }
        zval *list = pt_fmt_field(Z_ARRVAL(indentation), ZEND_STRL("edits"));
        if (list == NULL || Z_TYPE_P(list) != IS_ARRAY) {
            zval_ptr_dtor(&indentation);
            pt_fmt_malformed();
            goto done;
        }
        zval *item;
        ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(list), item) {
            ZVAL_DEREF(item);
            zend_long start, end;
            zval *edit_text = Z_TYPE_P(item) == IS_ARRAY ? pt_fmt_field(Z_ARRVAL_P(item), ZEND_STRL("text")) : NULL;
            if (Z_TYPE_P(item) != IS_ARRAY || !pt_fmt_int(Z_ARRVAL_P(item), ZEND_STRL("start"), &start)
                || !pt_fmt_int(Z_ARRVAL_P(item), ZEND_STRL("end"), &end) || edit_text == NULL
                || Z_TYPE_P(edit_text) != IS_STRING) {
                zval_ptr_dtor(&indentation);
                pt_fmt_malformed();
                goto done;
            }
            pt_fmt_edits_add(&edits, start, end, zend_string_copy(Z_STR_P(edit_text)));
        } ZEND_HASH_FOREACH_END();
        zval_ptr_dtor(&indentation);

        if (edits.count > 1) {
            qsort(edits.items, edits.count, sizeof(pt_fmt_edit), pt_fmt_edit_compare);
        }
    }
    if (edits.count == 0) {
        pt_fmt_text_result(result, source, false);
        ok = true;
        goto done;
    }

    if (!pt_fmt_position(text, edits.items[0].start, &line, &col)) {
        goto done;
    }
    formatted = pt_fmt_apply(text, &edits);

    ZVAL_STR_COPY(&args[0], formatted);
    ZVAL_STR_COPY(&args[1], settings.name);
    ZVAL_COPY(&args[2], &settings.parse_options);
    pt_fmt_method(analyzer, ZEND_STRL("parse"), &after, 3, args);
    zval_ptr_dtor(&args[0]);
    zval_ptr_dtor(&args[1]);
    zval_ptr_dtor(&args[2]);
    if (EG(exception)) {
        if (pt_fmt_take(pt_error_ce, &caught)) {
            zend_string *message = zend_strpprintf(0, "formatted text does not parse: %s", ZSTR_VAL(caught.message));
            pt_fmt_error_result(result, "invariant", NULL, line, col, message);
            zend_string_release(message);
            pt_fmt_caught_free(&caught);
            ok = true;
        }
        goto done;
    }

    zval left, right, stripped;
    if (settings.indenting) {
        pt_fmt_without_line_indentation(ast, &stripped);
        pt_fmt_without_spans(&stripped, &left);
        zval_ptr_dtor(&stripped);
        pt_fmt_without_line_indentation(&after, &stripped);
        pt_fmt_without_spans(&stripped, &right);
        zval_ptr_dtor(&stripped);
    } else {
        pt_fmt_without_spans(ast, &left);
        pt_fmt_without_spans(&after, &right);
    }
    bool same = pt_fmt_equal(&left, &right);
    zval_ptr_dtor(&left);
    zval_ptr_dtor(&right);
    if (!same) {
        zend_string *message = zend_string_init(ZEND_STRL("formatted text parses to a different AST"), 0);
        pt_fmt_error_result(result, "invariant", NULL, line, col, message);
        zend_string_release(message);
        ok = true;
        goto done;
    }

    if (shift > 0) {
        zend_string *with_bom = zend_string_concat2(PT_FMT_BOM, 3, ZSTR_VAL(formatted), ZSTR_LEN(formatted));
        pt_fmt_text_result(result, with_bom, true);
        zend_string_release(with_bom);
    } else {
        pt_fmt_text_result(result, formatted, true);
    }
    ok = true;

done:
    zval_ptr_dtor(&analysis);
    zval_ptr_dtor(&after);
    if (formatted != NULL) {
        zend_string_release(formatted);
    }
    if (text != NULL) {
        zend_string_release(text);
    }
    pt_fmt_edits_free(&edits);
    pt_fmt_options_free(&settings);

    return ok;
}

ZEND_METHOD(Polyspec_Template_Format_Formatter, format)
{
    zend_string *source;
    HashTable *options = NULL;
    zend_object *analyzer = NULL;
    ZEND_PARSE_PARAMETERS_START(1, 3)
        Z_PARAM_STR(source)
        Z_PARAM_OPTIONAL
        Z_PARAM_ARRAY_HT(options)
        Z_PARAM_OBJ_OF_CLASS(analyzer, pt_fmt_analyzer_ce)
    ZEND_PARSE_PARAMETERS_END();

    /* The default analyzer is the PackageAnalyzer of the library (new PackageAnalyzer()). */
    zval analyzer_value;
    if (analyzer != NULL) {
        ZVAL_OBJ_COPY(&analyzer_value, analyzer);
    } else {
        object_init_ex(&analyzer_value, pt_fmt_package_analyzer_ce);
    }
    bool ok = pt_fmt_run(source, options, &analyzer_value, return_value);
    zval_ptr_dtor(&analyzer_value);
    if (!ok) {
        RETURN_THROWS();
    }
}
