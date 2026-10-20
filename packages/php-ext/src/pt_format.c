/*
 * The value classes and the helpers of the formatter (S10): FormatError and FormatResult hold the text or the
 * error of a format, Expression joins the tokens of a tag with the separators of the style, and Invariant compares
 * two ASTs without their spans and indentation. Each method is the method of the library class with the same name.
 * The tag bodies (Body) and the analyzers (PackageAnalyzer) are registered here too.
 */
#include "pt.h"
#include "Zend/zend_exceptions.h"
#include "ext/spl/spl_exceptions.h"

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
