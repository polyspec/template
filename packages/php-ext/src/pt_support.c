/*
 * The support classes of the library (S10): Source, Utf8, Escape and InternalBoundary of Polyspec\Template and
 * Loader\Path of Polyspec\Template\Loader. Each method has the result and the errors of its class in
 * packages/php/src, computed with the UTF-8, line index, escape and path functions of the extension.
 */
#include "pt.h"
#include "Zend/zend_closures.h"
#include "Zend/zend_exceptions.h"
#include "Zend/zend_interfaces.h"

zend_class_entry *pt_source_ce;

/* Writes the fields of a Source: its line index (LEX-16), its name and its text. The readonly properties are
 * initialized from the scope of the class. */
static void pt_source_fill(zend_object *object, zend_string *name, const char *text, size_t length)
{
    pt_arena arena;
    pt_lines lines;
    pt_arena_init(&arena);
    pt_lines_build(&arena, &lines, text, length);
    zval index;
    array_init_size(&index, lines.count);
    for (size_t i = 0; i < lines.count; i++) {
        add_next_index_long(&index, (zend_long)lines.starts[i]);
    }
    pt_arena_free(&arena);
    zend_update_property(pt_source_ce, object, ZEND_STRL("lines"), &index);
    zval_ptr_dtor(&index);
    zend_update_property_str(pt_source_ce, object, ZEND_STRL("name"), name);
    zend_update_property_stringl(pt_source_ce, object, ZEND_STRL("text"), text, length);
}

/* Source::__construct, private: the class builds its objects in fromBytes. */
ZEND_METHOD(Polyspec_Template_Source, __construct)
{
    zend_string *name, *text;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_STR(name)
        Z_PARAM_STR(text)
    ZEND_PARSE_PARAMETERS_END();
    pt_source_fill(Z_OBJ_P(ZEND_THIS), name, ZSTR_VAL(text), ZSTR_LEN(text));
}

/* Source::fromBytes: the bytes are checked as UTF-8 first, so the error offsets are those of the bytes with the byte
 * order mark; then the mark is removed. */
ZEND_METHOD(Polyspec_Template_Source, fromBytes)
{
    zend_string *name, *bytes;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_STR(name)
        Z_PARAM_STR(bytes)
    ZEND_PARSE_PARAMETERS_END();
    const char *data = ZSTR_VAL(bytes);
    size_t length = ZSTR_LEN(bytes);
    size_t invalid = pt_utf8_first_invalid(data, length);
    if (invalid < length) {
        pt_arena arena;
        pt_lines lines;
        pt_arena_init(&arena);
        pt_lines_build(&arena, &lines, data, length);
        zend_long line, col;
        pt_position(&lines, invalid, &line, &col);
        pt_arena_free(&arena);
        zend_string *message = zend_strpprintf(0, "invalid UTF-8 byte at offset %zu", invalid);
        zval exception;
        ZVAL_OBJ(&exception, pt_error_object(PT_E_LEX_INVALID_UTF8, name, line, col, (zend_long)invalid, (zend_long)invalid + 1, message));
        zend_string_release(message);
        zend_throw_exception_object(&exception);
        RETURN_THROWS();
    }
    if (length >= 3 && memcmp(data, "\xEF\xBB\xBF", 3) == 0) {
        data += 3;
        length -= 3;
    }
    object_init_ex(return_value, pt_source_ce);
    pt_source_fill(Z_OBJ_P(return_value), name, data, length);
}

ZEND_METHOD(Polyspec_Template_Source, lineIndex)
{
    zend_string *text;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(text)
    ZEND_PARSE_PARAMETERS_END();
    pt_arena arena;
    pt_lines lines;
    pt_arena_init(&arena);
    pt_lines_build(&arena, &lines, ZSTR_VAL(text), ZSTR_LEN(text));
    array_init_size(return_value, lines.count);
    for (size_t i = 0; i < lines.count; i++) {
        add_next_index_long(return_value, (zend_long)lines.starts[i]);
    }
    pt_arena_free(&arena);
}

/* Source::position: the 1-based line and byte column of an offset, by a binary search over the line starts. */
ZEND_METHOD(Polyspec_Template_Source, position)
{
    HashTable *lines;
    zend_long offset;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_ARRAY_HT(lines)
        Z_PARAM_LONG(offset)
    ZEND_PARSE_PARAMETERS_END();
    zend_long line, col;
    pt_error_position(lines, offset, &line, &col);
    array_init(return_value);
    add_next_index_long(return_value, line);
    add_next_index_long(return_value, col);
}

ZEND_METHOD(Polyspec_Template_Source, length)
{
    ZEND_PARSE_PARAMETERS_NONE();
    zval rv;
    zval *text = zend_read_property(pt_source_ce, Z_OBJ_P(ZEND_THIS), ZEND_STRL("text"), 0, &rv);
    RETURN_LONG((zend_long)Z_STRLEN_P(text));
}

ZEND_METHOD(Polyspec_Template_Utf8, isValid)
{
    zend_string *bytes;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(bytes)
    ZEND_PARSE_PARAMETERS_END();
    RETURN_BOOL(pt_utf8_first_invalid(ZSTR_VAL(bytes), ZSTR_LEN(bytes)) == ZSTR_LEN(bytes));
}

ZEND_METHOD(Polyspec_Template_Utf8, firstInvalid)
{
    zend_string *bytes;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(bytes)
    ZEND_PARSE_PARAMETERS_END();
    size_t invalid = pt_utf8_first_invalid(ZSTR_VAL(bytes), ZSTR_LEN(bytes));
    RETURN_LONG(invalid < ZSTR_LEN(bytes) ? (zend_long)invalid : -1);
}

/* Utf8::chr: a surrogate is U+FFFD (pt_utf8_append), and a value outside 0..U+10FFFF has no code point: ''. */
ZEND_METHOD(Polyspec_Template_Utf8, chr)
{
    zend_long code;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_LONG(code)
    ZEND_PARSE_PARAMETERS_END();
    if (code < 0 || code > 0x10FFFF) {
        RETURN_EMPTY_STRING();
    }
    pt_arena arena;
    pt_buf buf;
    pt_arena_init(&arena);
    pt_buf_init(&buf, &arena);
    pt_utf8_append(&buf, (uint32_t)code);
    pt_s text = pt_buf_done(&buf);
    zend_string *result = zend_string_init(text.s, text.n, 0);
    pt_arena_free(&arena);
    RETURN_STR(result);
}

/* Utf8::codePoints of a valid UTF-8 string; the input is valid by the contract of the class, and a sequence cut at the
 * end is clamped to the bytes that are there. */
ZEND_METHOD(Polyspec_Template_Utf8, codePoints)
{
    zend_string *text;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(text)
    ZEND_PARSE_PARAMETERS_END();
    array_init(return_value);
    const char *s = ZSTR_VAL(text);
    size_t n = ZSTR_LEN(text);
    for (size_t i = 0; i < n;) {
        size_t width = pt_utf8_width((unsigned char)s[i]);
        if (width > n - i) {
            width = n - i;
        }
        add_next_index_stringl(return_value, s + i, width);
        i += width;
    }
}

ZEND_METHOD(Polyspec_Template_Utf8, length)
{
    zend_string *text;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(text)
    ZEND_PARSE_PARAMETERS_END();
    RETURN_LONG((zend_long)pt_utf8_length(ZSTR_VAL(text), ZSTR_LEN(text)));
}

/* Escape::html: the text with its HTML characters escaped (RT-32, FUN-10). */
zend_string *pt_escape_html_string(zend_string *text)
{
    pt_arena arena;
    pt_buf buf;
    pt_arena_init(&arena);
    pt_buf_init(&buf, &arena);
    pt_escape_html(&buf, (pt_s){ZSTR_VAL(text), ZSTR_LEN(text)});
    pt_s out = pt_buf_done(&buf);
    zend_string *result = zend_string_init(out.s, out.n, 0);
    pt_arena_free(&arena);
    return result;
}

ZEND_METHOD(Polyspec_Template_Escape, html)
{
    zend_string *text;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(text)
    ZEND_PARSE_PARAMETERS_END();
    RETURN_STR(pt_escape_html_string(text));
}

/* InternalBoundary::run: an \Error of the operation becomes TemplateError E_INTERNAL with "internal failure: " and its
 * message; every other throwable, and a template error, passes unchanged. */
ZEND_METHOD(Polyspec_Template_InternalBoundary, run)
{
    zend_string *template;
    zval *callable;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_STR(template)
        Z_PARAM_OBJECT_OF_CLASS(callable, zend_ce_closure)
    ZEND_PARSE_PARAMETERS_END();
    zend_fcall_info fci;
    zend_fcall_info_cache fcc;
    if (zend_fcall_info_init(callable, 0, &fci, &fcc, NULL, NULL) != SUCCESS) {
        RETURN_THROWS();
    }
    fci.retval = return_value;
    zend_call_function(&fci, &fcc);
    if (EG(exception) == NULL || !instanceof_function(EG(exception)->ce, zend_ce_error)) {
        return;
    }
    zend_object *error = EG(exception);
    EG(exception) = NULL;
    zval rv;
    zend_call_method_with_0_params(error, error->ce, NULL, "getMessage", &rv);
    if (EG(exception)) {
        OBJ_RELEASE(error);
        return;
    }
    zend_string *detail = zval_get_string(&rv);
    zval_ptr_dtor(&rv);
    zend_string *message = zend_string_concat2(ZEND_STRL("internal failure: "), ZSTR_VAL(detail), ZSTR_LEN(detail));
    zend_string_release(detail);
    OBJ_RELEASE(error);
    zval exception;
    ZVAL_OBJ(&exception, pt_error_object(PT_E_INTERNAL, template, 0, 0, 0, 0, message));
    zend_string_release(message);
    zend_throw_exception_object(&exception);
}

/* Loader\Path::resolve: the template name of a path against the current template, or null when it leaves the root
 * (RT-7, RT-8), by the path function of the extension. */
ZEND_METHOD(Polyspec_Template_Loader_Path, resolve)
{
    zend_string *current, *path;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_STR(current)
        Z_PARAM_STR(path)
    ZEND_PARSE_PARAMETERS_END();
    pt_arena arena;
    pt_s name;
    pt_arena_init(&arena);
    bool inside = pt_resolve_path(&arena, (pt_s){ZSTR_VAL(current), ZSTR_LEN(current)}, (pt_s){ZSTR_VAL(path), ZSTR_LEN(path)}, &name);
    if (!inside) {
        pt_arena_free(&arena);
        RETURN_NULL();
    }
    zend_string *result = zend_string_init(name.s, name.n, 0);
    pt_arena_free(&arena);
    RETURN_STR(result);
}
