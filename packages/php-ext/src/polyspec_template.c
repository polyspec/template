/*
 * The PHP classes of the extension: Polyspec\Template\TemplateError (RT-1 to RT-6, ERR-1). Their signatures are in
 * polyspec_template.stub.php, from which gen_stub.php generates polyspec_template_arginfo.h.
 */
#ifdef HAVE_CONFIG_H
#include "config.h"
#endif

#include "php.h"
#include "ext/json/php_json.h"
#include "ext/spl/spl_exceptions.h"
#include "ext/standard/info.h"
#include "Zend/zend_exceptions.h"
#include "Zend/zend_smart_str.h"
#include "main/php_streams.h"
#include "php_polyspec_template.h"
#include "pt.h"
#include "polyspec_template_arginfo.h"

#include <limits.h>

zend_class_entry *pt_error_ce;
zend_class_entry *pt_safe_string_ce;
zend_class_entry *pt_map_value_ce;
zend_class_entry *pt_bind_error_ce;
static zend_class_entry *pt_ast_decode_error_ce;
zend_class_entry *pt_function_error_ce;

/* ----------------------------------------------------------------------------------------------- */
/* TemplateError (ERR-1)                                                                            */
/* ----------------------------------------------------------------------------------------------- */

/* Writes the fields of an error into the object; the readonly properties are initialized once, from the scope of
 * the class. */
static void pt_error_fill(zend_object *object, zend_string *code, zend_string *template, zend_long line, zend_long col, zend_long offset, zend_long end, zend_string *message)
{
    zend_update_property_str(pt_error_ce, object, ZEND_STRL("errorCode"), code);
    zend_update_property_str(pt_error_ce, object, ZEND_STRL("template"), template);
    zend_update_property_long(pt_error_ce, object, ZEND_STRL("errorLine"), line);
    zend_update_property_long(pt_error_ce, object, ZEND_STRL("errorCol"), col);
    zend_update_property_long(pt_error_ce, object, ZEND_STRL("offset"), offset);
    zend_update_property_long(pt_error_ce, object, ZEND_STRL("end"), end);
    zend_update_property_str(zend_ce_exception, object, ZEND_STRL("message"), message);
}

/* Creates a TemplateError object with the fields of an error. */
zend_object *pt_error_object(const char *code, zend_string *template, zend_long line, zend_long col, zend_long offset, zend_long end, zend_string *message)
{
    zval exception;
    object_init_ex(&exception, pt_error_ce);
    zend_string *name = zend_string_init(code, strlen(code), 0);
    pt_error_fill(Z_OBJ(exception), name, template, line, col, offset, end, message);
    zend_string_release(name);
    return Z_OBJ(exception);
}

ZEND_METHOD(Polyspec_Template_TemplateError, __construct)
{
    zend_string *code, *template, *message;
    zend_long line, col, offset, end;
    ZEND_PARSE_PARAMETERS_START(7, 7)
        Z_PARAM_STR(code)
        Z_PARAM_STR(template)
        Z_PARAM_LONG(line)
        Z_PARAM_LONG(col)
        Z_PARAM_LONG(offset)
        Z_PARAM_LONG(end)
        Z_PARAM_STR(message)
    ZEND_PARSE_PARAMETERS_END();
    pt_error_fill(Z_OBJ_P(ZEND_THIS), code, template, line, col, offset, end, message);
}

ZEND_METHOD(Polyspec_Template_Value_SafeString, __construct)
{
    zend_string *text;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(text)
    ZEND_PARSE_PARAMETERS_END();
    zend_update_property_str(pt_safe_string_ce, Z_OBJ_P(ZEND_THIS), ZEND_STRL("text"), text);
}

ZEND_METHOD(Polyspec_Template_Value_BindError, __construct)
{
    zend_string *code, *message;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_STR(code)
        Z_PARAM_STR(message)
    ZEND_PARSE_PARAMETERS_END();
    zend_update_property_str(pt_bind_error_ce, Z_OBJ_P(ZEND_THIS), ZEND_STRL("errorCode"), code);
    zend_update_property_str(zend_ce_exception, Z_OBJ_P(ZEND_THIS), ZEND_STRL("message"), message);
}

ZEND_METHOD(Polyspec_Template_Functions_FunctionError, __construct)
{
    zend_string *code, *message;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_STR(code)
        Z_PARAM_STR(message)
    ZEND_PARSE_PARAMETERS_END();
    zend_update_property_str(pt_function_error_ce, Z_OBJ_P(ZEND_THIS), ZEND_STRL("errorCode"), code);
    zend_update_property_str(zend_ce_exception, Z_OBJ_P(ZEND_THIS), ZEND_STRL("message"), message);
}

/* The table() methods of the function groups (pt_groups.c). */
ZEND_METHOD(Polyspec_Template_Functions_Strings, table)
{
    pt_strings_table(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Functions_Numbers, table)
{
    pt_numbers_table(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Functions_Encoding, table)
{
    pt_encoding_table(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Functions_Collection, table)
{
    pt_collection_table(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

/* Functions\Encoding::toJson and Functions\Encoding::percentEncode (pt_groups.c). */
ZEND_METHOD(Polyspec_Template_Functions_Encoding, toJson)
{
    pt_encoding_to_json(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Functions_Encoding, percentEncode)
{
    pt_encoding_percent_encode(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

/* The table() and the methods of Functions\Dates (pt_groups.c). */
ZEND_METHOD(Polyspec_Template_Functions_Dates, table)
{
    pt_dates_table(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

/* Functions\Registry::builtins and isBuiltin (pt_groups.c). */
ZEND_METHOD(Polyspec_Template_Functions_Registry, builtins)
{
    pt_registry_builtins(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Functions_Registry, isBuiltin)
{
    pt_registry_is_builtin(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Functions_Dates, parseOffset)
{
    pt_dates_parse_offset(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Functions_Dates, daysFromCivil)
{
    pt_dates_days_from_civil(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Functions_Dates, civilFromDays)
{
    pt_dates_civil_from_days(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Functions_Dates, toUnixSeconds)
{
    pt_dates_to_unix_seconds(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Functions_Dates, format)
{
    pt_dates_format(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

/* ----------------------------------------------------------------------------------------------- */
/* Functions\FunctionGroup and Functions\Helpers (S10): the argument helpers of the function groups. */
/* A FunctionError is thrown with the code of ErrorCode and the message of the library.              */
/* ----------------------------------------------------------------------------------------------- */

/* A FunctionError object with its code and message, as its constructor sets them. */
static zend_object *pt_function_error_object(const char *code, zend_string *message)
{
    zval error;
    object_init_ex(&error, pt_function_error_ce);
    zend_update_property_string(pt_function_error_ce, Z_OBJ(error), ZEND_STRL("errorCode"), code);
    zend_update_property_str(zend_ce_exception, Z_OBJ(error), ZEND_STRL("message"), message);
    return Z_OBJ(error);
}

/* Throws a FunctionError; the message is released here. */
void pt_throw_function_error(const char *code, zend_string *message)
{
    zval exception;
    ZVAL_OBJ(&exception, pt_function_error_object(code, message));
    zend_string_release(message);
    zend_throw_exception_object(&exception);
}

/* Helpers::toNumber (EXP-23): the number of a value, or false with the FunctionError thrown. */
bool pt_helper_number(zval *value, double *number)
{
    ZVAL_DEREF(value);
    switch (Z_TYPE_P(value)) {
        case IS_NULL:
        case IS_FALSE:
            *number = 0.0;
            return true;
        case IS_TRUE:
            *number = 1.0;
            return true;
        case IS_LONG:
            *number = (double) Z_LVAL_P(value);
            return true;
        case IS_DOUBLE:
            *number = Z_DVAL_P(value);
            return true;
    }
    if (pt_host_is_string(value)) {
        zend_string *text = pt_host_text_of(value);
        if (pt_numeric_string(ZSTR_VAL(text), ZSTR_LEN(text), number)) {
            return true;
        }
        zend_string *quoted = pt_json_quote(ZSTR_VAL(text), ZSTR_LEN(text));
        zend_string *message = zend_strpprintf(0, "%s is not a number", ZSTR_VAL(quoted));
        zend_string_release(quoted);
        pt_throw_function_error(PT_E_RUNTIME_TYPE, message);
        return false;
    }
    pt_throw_function_error(PT_E_RUNTIME_TYPE, zend_strpprintf(0, "a %s is not a number", pt_host_type_name(value)));
    return false;
}

static void pt_helper_number_result(zval *value, zval *return_value)
{
    double number;
    if (!pt_helper_number(value, &number)) {
        return;
    }
    ZVAL_DOUBLE(return_value, number);
}

ZEND_METHOD(Polyspec_Template_Functions_Helpers, typeError)
{
    zend_string *message;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(message)
    ZEND_PARSE_PARAMETERS_END();

    ZVAL_OBJ(return_value, pt_function_error_object(PT_E_RUNTIME_TYPE, message));
}

ZEND_METHOD(Polyspec_Template_Functions_Helpers, string)
{
    zval *value;
    zend_string *name;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_ZVAL(value)
        Z_PARAM_STR(name)
    ZEND_PARSE_PARAMETERS_END();

    ZVAL_DEREF(value);
    if (!pt_host_is_string(value)) {
        pt_throw_function_error(PT_E_RUNTIME_TYPE,
            zend_strpprintf(0, "%s requires a string, got %s", ZSTR_VAL(name), pt_host_type_name(value)));
        RETURN_THROWS();
    }
    RETURN_STR_COPY(pt_host_text_of(value));
}

ZEND_METHOD(Polyspec_Template_Functions_Helpers, list)
{
    zval *value;
    zend_string *name;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_ZVAL(value)
        Z_PARAM_STR(name)
    ZEND_PARSE_PARAMETERS_END();

    ZVAL_DEREF(value);
    if (Z_TYPE_P(value) != IS_ARRAY) {
        pt_throw_function_error(PT_E_RUNTIME_TYPE,
            zend_strpprintf(0, "%s requires a list, got %s", ZSTR_VAL(name), pt_host_type_name(value)));
        RETURN_THROWS();
    }
    RETURN_COPY(value);
}

ZEND_METHOD(Polyspec_Template_Functions_Helpers, toNumber)
{
    zval *value;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_ZVAL(value)
    ZEND_PARSE_PARAMETERS_END();

    pt_helper_number_result(value, return_value);
    if (EG(exception)) {
        RETURN_THROWS();
    }
}

ZEND_METHOD(Polyspec_Template_Functions_Helpers, number)
{
    zval *value;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_ZVAL(value)
    ZEND_PARSE_PARAMETERS_END();

    pt_helper_number_result(value, return_value);
    if (EG(exception)) {
        RETURN_THROWS();
    }
}

ZEND_METHOD(Polyspec_Template_Functions_Helpers, integer)
{
    zval *value;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_ZVAL(value)
    ZEND_PARSE_PARAMETERS_END();

    double number;
    if (!pt_helper_number(value, &number)) {
        RETURN_THROWS();
    }
    RETURN_LONG(zend_dval_to_lval(number < 0 ? ceil(number) : floor(number)));
}

ZEND_METHOD(Polyspec_Template_Functions_Helpers, stringify)
{
    zval *value;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_ZVAL(value)
    ZEND_PARSE_PARAMETERS_END();

    ZVAL_DEREF(value);
    if (pt_host_is_string(value)) {
        RETURN_STR_COPY(pt_host_text_of(value));
    }
    if (!pt_host_stringify(value, return_value)) {
        RETURN_THROWS();
    }
    if (Z_TYPE_P(return_value) == IS_NULL) {
        pt_throw_function_error(PT_E_RUNTIME_STRINGIFY, zend_strpprintf(0, "a list or map cannot be converted to text"));
        RETURN_THROWS();
    }
}

ZEND_METHOD(Polyspec_Template_Functions_Helpers, safe)
{
    zend_string *text;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(text)
    ZEND_PARSE_PARAMETERS_END();

    object_init_ex(return_value, pt_safe_string_ce);
    zend_update_property_str(pt_safe_string_ce, Z_OBJ_P(return_value), ZEND_STRL("text"), text);
}

/* ----------------------------------------------------------------------------------------------- */
/* AstDecodeError (AST-10): the message names the JSON Pointer of the node, or the root if empty.   */
/* ----------------------------------------------------------------------------------------------- */

ZEND_METHOD(Polyspec_Template_AstDecodeError, __construct)
{
    zend_string *path, *reason;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_STR(path)
        Z_PARAM_STR(reason)
    ZEND_PARSE_PARAMETERS_END();
    zend_update_property_str(pt_ast_decode_error_ce, Z_OBJ_P(ZEND_THIS), ZEND_STRL("path"), path);
    zend_string *message = zend_strpprintf(0, "invalid template AST at %s: %s", ZSTR_LEN(path) == 0 ? "the root" : ZSTR_VAL(path), ZSTR_VAL(reason));
    zend_update_property_str(zend_ce_exception, Z_OBJ_P(ZEND_THIS), ZEND_STRL("message"), message);
    zend_string_release(message);
}

/* ----------------------------------------------------------------------------------------------- */
/* Value\MapValue (S10, VAL-1, VAL-4, VAL-17): the items are the PHP array of the one property     */
/* slot, so numeric string keys behave as PHP array keys do; keys are cast back to strings on read. */
/* ----------------------------------------------------------------------------------------------- */

ZEND_METHOD(Polyspec_Template_Value_MapValue, set)
{
    zend_string *key;
    zval *value;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_STR(key)
        Z_PARAM_ZVAL(value)
    ZEND_PARSE_PARAMETERS_END();
    zval *items = OBJ_PROP_NUM(Z_OBJ_P(ZEND_THIS), 0);
    SEPARATE_ARRAY(items);
    Z_TRY_ADDREF_P(value);
    zend_symtable_update(Z_ARRVAL_P(items), key, value);
}

ZEND_METHOD(Polyspec_Template_Value_MapValue, has)
{
    zend_string *key;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(key)
    ZEND_PARSE_PARAMETERS_END();
    zval *items = OBJ_PROP_NUM(Z_OBJ_P(ZEND_THIS), 0);
    RETURN_BOOL(zend_symtable_exists(Z_ARRVAL_P(items), key));
}

ZEND_METHOD(Polyspec_Template_Value_MapValue, get)
{
    zend_string *key;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(key)
    ZEND_PARSE_PARAMETERS_END();
    zval *items = OBJ_PROP_NUM(Z_OBJ_P(ZEND_THIS), 0);
    zval *value = zend_symtable_find(Z_ARRVAL_P(items), key);
    if (value == NULL) {
        RETURN_NULL();
    }
    RETURN_COPY_DEREF(value);
}

ZEND_METHOD(Polyspec_Template_Value_MapValue, remove)
{
    zend_string *key;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(key)
    ZEND_PARSE_PARAMETERS_END();
    zval *items = OBJ_PROP_NUM(Z_OBJ_P(ZEND_THIS), 0);
    SEPARATE_ARRAY(items);
    zend_symtable_del(Z_ARRVAL_P(items), key);
}

ZEND_METHOD(Polyspec_Template_Value_MapValue, count)
{
    ZEND_PARSE_PARAMETERS_NONE();
    zval *items = OBJ_PROP_NUM(Z_OBJ_P(ZEND_THIS), 0);
    RETURN_LONG(zend_hash_num_elements(Z_ARRVAL_P(items)));
}

ZEND_METHOD(Polyspec_Template_Value_MapValue, keys)
{
    ZEND_PARSE_PARAMETERS_NONE();
    zval *items = OBJ_PROP_NUM(Z_OBJ_P(ZEND_THIS), 0);
    array_init(return_value);
    zend_ulong index;
    zend_string *name;
    ZEND_HASH_FOREACH_KEY(Z_ARRVAL_P(items), index, name) {
        if (name != NULL) {
            add_next_index_str(return_value, zend_string_copy(name));
        } else {
            add_next_index_str(return_value, zend_long_to_str((zend_long)index));
        }
    } ZEND_HASH_FOREACH_END();
}

ZEND_METHOD(Polyspec_Template_Value_MapValue, values)
{
    ZEND_PARSE_PARAMETERS_NONE();
    zval *items = OBJ_PROP_NUM(Z_OBJ_P(ZEND_THIS), 0);
    array_init(return_value);
    zval *value;
    ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(items), value) {
        Z_TRY_ADDREF_P(value);
        add_next_index_zval(return_value, value);
    } ZEND_HASH_FOREACH_END();
}

ZEND_METHOD(Polyspec_Template_Value_MapValue, entries)
{
    ZEND_PARSE_PARAMETERS_NONE();
    zval *items = OBJ_PROP_NUM(Z_OBJ_P(ZEND_THIS), 0);
    array_init(return_value);
    zend_ulong index;
    zend_string *name;
    zval *value;
    ZEND_HASH_FOREACH_KEY_VAL(Z_ARRVAL_P(items), index, name, value) {
        zval pair;
        array_init(&pair);
        if (name != NULL) {
            add_next_index_str(&pair, zend_string_copy(name));
        } else {
            add_next_index_str(&pair, zend_long_to_str((zend_long)index));
        }
        Z_TRY_ADDREF_P(value);
        add_next_index_zval(&pair, value);
        add_next_index_zval(return_value, &pair);
    } ZEND_HASH_FOREACH_END();
}

ZEND_METHOD(Polyspec_Template_Value_MapValue, copy)
{
    ZEND_PARSE_PARAMETERS_NONE();
    zval *items = OBJ_PROP_NUM(Z_OBJ_P(ZEND_THIS), 0);
    object_init_ex(return_value, pt_map_value_ce);
    zval *target = OBJ_PROP_NUM(Z_OBJ_P(return_value), 0);
    zval_ptr_dtor(target);
    ZVAL_COPY(target, items);
}

/* ----------------------------------------------------------------------------------------------- */
/* Value\Bind (VAL-2, VAL-14, VAL-17, VAL-19, VAL-20, VAL-22, RT-4, RT-24)                         */
/* ----------------------------------------------------------------------------------------------- */

#define PT_BIND_MAX_DEPTH 64

/* The PHP value of a bound value: a map is a MapValue, a list a PHP list, a number a float (VAL-17), a safe string a
 * SafeString (the built-in functions return the safe text of escape and raw as the library does). */
void pt_library_value(pt_value value, zval *result)
{
    switch (value.type) {
        case PT_NULL: ZVAL_NULL(result); return;
        case PT_BOOL: ZVAL_BOOL(result, value.u.b); return;
        case PT_NUMBER: ZVAL_DOUBLE(result, value.u.number); return;
        case PT_STRING: ZVAL_STRINGL(result, value.u.str.s, value.u.str.n); return;
        case PT_SAFE:
            object_init_ex(result, pt_safe_string_ce);
            zend_update_property_stringl(pt_safe_string_ce, Z_OBJ_P(result), ZEND_STRL("text"), value.u.str.s, value.u.str.n);
            return;
        case PT_LIST:
            array_init_size(result, value.u.list->count);
            for (uint32_t i = 0; i < value.u.list->count; i++) {
                zval item;
                pt_library_value(value.u.list->items[i], &item);
                add_next_index_zval(result, &item);
            }
            return;
        case PT_MAP: {
            const pt_map *map = value.u.map;
            object_init_ex(result, pt_map_value_ce);
            zval *items = OBJ_PROP_NUM(Z_OBJ_P(result), 0);
            SEPARATE_ARRAY(items);
            for (uint32_t i = 0; i < map->used; i++) {
                if (!map->entries[i].live) {
                    continue;
                }
                zval item;
                pt_library_value(map->entries[i].value, &item);
                zend_symtable_str_update(Z_ARRVAL_P(items), map->entries[i].key.s, map->entries[i].key.n, &item);
            }
            return;
        }
        default:
            ZVAL_OBJ_COPY(result, value.u.object);
            return;
    }
}

/* Throws a BindError with its code and message; the message is released. */
void pt_throw_bind_error(const char *code, zend_string *message)
{
    zval exception;
    object_init_ex(&exception, pt_bind_error_ce);
    zend_update_property_string(pt_bind_error_ce, Z_OBJ(exception), ZEND_STRL("errorCode"), code);
    zend_update_property_str(zend_ce_exception, Z_OBJ(exception), ZEND_STRL("message"), message);
    zend_string_release(message);
    zend_throw_exception_object(&exception);
}

/* Binds a host value into the PHP value of the library; false after a BindError is thrown. */
static bool pt_bind_library(zval *input, zval *result)
{
    pt_arena arena;
    pt_arena_init(&arena);
    pt_value value = {0};
    pt_bind_error error = {NULL, NULL};
    if (!pt_bind_value(&arena, input, &value, &error)) {
        pt_throw_bind_error(error.code, error.message);
        pt_arena_free(&arena);
        return false;
    }
    pt_library_value(value, result);
    pt_arena_free(&arena);
    return true;
}

/* The entries of a bound map as a library MapValue (VAL-22); NULL for any other value. */
static zval *pt_bound_entries(zval *input, zval *rv)
{
    pt_bound *bound = pt_bound_of(input);
    if (bound == NULL) {
        return NULL;
    }
    pt_library_value(pt_map_value(bound->map), rv);
    return rv;
}

/* VAL-20: whether the depth of a template value is at most `limit`; the walk stops below the limit. */
bool pt_zval_depth_within(zval *value, zend_long limit)
{
    ZVAL_DEREF(value);
    HashTable *items;
    if (Z_TYPE_P(value) == IS_ARRAY) {
        items = Z_ARRVAL_P(value);
    } else if (Z_TYPE_P(value) == IS_OBJECT && Z_OBJCE_P(value) == pt_map_value_ce) {
        items = Z_ARRVAL_P(OBJ_PROP_NUM(Z_OBJ_P(value), 0));
    } else {
        return true;
    }
    if (limit == 0) {
        return false;
    }
    zval *item;
    ZEND_HASH_FOREACH_VAL(items, item) {
        if (!pt_zval_depth_within(item, limit - 1)) {
            return false;
        }
    } ZEND_HASH_FOREACH_END();

    return true;
}

ZEND_METHOD(Polyspec_Template_Value_Bind, value)
{
    zval *input;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_ZVAL(input)
    ZEND_PARSE_PARAMETERS_END();

    if (!pt_bind_library(input, return_value)) {
        RETURN_THROWS();
    }
}

ZEND_METHOD(Polyspec_Template_Value_Bind, checkFloat)
{
    double value;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_DOUBLE(value)
    ZEND_PARSE_PARAMETERS_END();

    if (!zend_finite(value)) {
        pt_throw_bind_error(PT_E_DATA_NUMBER_NOT_FINITE, zend_string_init(ZEND_STRL("number is not finite"), 0));
        RETURN_THROWS();
    }
    if (fabs(value) > 9007199254740991.0) {
        zval number;
        ZVAL_DOUBLE(&number, value);
        zend_string *text = zval_get_string(&number);
        zend_string *message = zend_strpprintf(0, "number %s is outside the safe range", ZSTR_VAL(text));
        zend_string_release(text);
        pt_throw_bind_error(PT_E_DATA_NUMBER_RANGE, message);
        RETURN_THROWS();
    }
    RETURN_DOUBLE(value);
}

ZEND_METHOD(Polyspec_Template_Value_Bind, checkLevel)
{
    zend_long level;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_LONG(level)
    ZEND_PARSE_PARAMETERS_END();

    if (level > PT_BIND_MAX_DEPTH) {
        pt_throw_bind_error(PT_E_DATA_DEPTH, zend_string_init(ZEND_STRL("lists and maps nest deeper than 64 levels"), 0));
        RETURN_THROWS();
    }
}

ZEND_METHOD(Polyspec_Template_Value_Bind, depthWithin)
{
    zval *value;
    zend_long limit;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_ZVAL(value)
        Z_PARAM_LONG(limit)
    ZEND_PARSE_PARAMETERS_END();

    RETURN_BOOL(pt_zval_depth_within(value, limit));
}

ZEND_METHOD(Polyspec_Template_Value_Bind, publicProperties)
{
    zval *object;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_OBJECT(object)
    ZEND_PARSE_PARAMETERS_END();

    array_init(return_value);
    HashTable *properties = Z_OBJ_HT_P(object)->get_properties(Z_OBJ_P(object));
    if (properties == NULL) {
        return;
    }
    zend_ulong index;
    zend_string *name;
    zval *value;
    ZEND_HASH_FOREACH_KEY_VAL_IND(properties, index, name, value) {
        if (Z_TYPE_P(value) == IS_UNDEF) {
            continue;
        }
        if (name != NULL && ZSTR_LEN(name) > 0 && ZSTR_VAL(name)[0] == '\0') {
            continue;
        }
        ZVAL_DEREF(value);
        Z_TRY_ADDREF_P(value);
        if (name != NULL) {
            zend_symtable_update(Z_ARRVAL_P(return_value), name, value);
        } else {
            zend_hash_index_update(Z_ARRVAL_P(return_value), index, value);
        }
    } ZEND_HASH_FOREACH_END();
}

ZEND_METHOD(Polyspec_Template_Value_Bind, map)
{
    zval *input;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_ZVAL(input)
    ZEND_PARSE_PARAMETERS_END();

    ZVAL_DEREF(input);
    if (Z_TYPE_P(input) == IS_NULL) {
        object_init_ex(return_value, pt_map_value_ce);
        return;
    }
    zval rv;
    zval *entries = pt_bound_entries(input, &rv);
    if (entries != NULL) {
        ZVAL_COPY_VALUE(return_value, entries);
        return;
    }
    zval result;
    if (!pt_bind_library(input, &result)) {
        RETURN_THROWS();
    }
    if (Z_TYPE(result) == IS_OBJECT && Z_OBJCE(result) == pt_map_value_ce) {
        ZVAL_COPY_VALUE(return_value, &result);
        return;
    }
    zval_ptr_dtor(&result);
    if (Z_TYPE(result) == IS_ARRAY && zend_hash_num_elements(Z_ARRVAL(result)) == 0) {
        object_init_ex(return_value, pt_map_value_ce);
        return;
    }
    pt_throw_bind_error(PT_E_DATA_UNSUPPORTED_TYPE, zend_string_init(ZEND_STRL("assign is not a map"), 0));
    RETURN_THROWS();
}

ZEND_METHOD(Polyspec_Template_Value_Bind, data)
{
    zval *input;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_ZVAL(input)
    ZEND_PARSE_PARAMETERS_END();

    ZVAL_DEREF(input);
    zval rv;
    zval *entries = pt_bound_entries(input, &rv);
    if (entries != NULL) {
        ZVAL_COPY_VALUE(return_value, entries);
        return;
    }
    if (!pt_bind_library(input, return_value)) {
        RETURN_THROWS();
    }
    if (Z_TYPE_P(return_value) == IS_ARRAY && zend_hash_num_elements(Z_ARRVAL_P(return_value)) == 0) {
        zval_ptr_dtor(return_value);
        object_init_ex(return_value, pt_map_value_ce);
    }
}

/* ----------------------------------------------------------------------------------------------- */
/* Value\Value, Value\Number, Value\HostArgument (EXP-33 to EXP-38, VAL-8, VAL-9, VAL-21, FUN-20..25) */
/* ----------------------------------------------------------------------------------------------- */

ZEND_METHOD(Polyspec_Template_Value_Value, typeOf)
{
    zval *value;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_ZVAL(value)
    ZEND_PARSE_PARAMETERS_END();

    RETURN_STRING(pt_host_type_name(value));
}

ZEND_METHOD(Polyspec_Template_Value_Value, isString)
{
    zval *value;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_ZVAL(value)
    ZEND_PARSE_PARAMETERS_END();

    RETURN_BOOL(pt_host_is_string(value));
}

ZEND_METHOD(Polyspec_Template_Value_Value, textOf)
{
    zend_object *object = NULL;
    zend_string *text = NULL;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_OBJ_OF_CLASS_OR_STR(object, pt_safe_string_ce, text)
    ZEND_PARSE_PARAMETERS_END();

    if (text != NULL) {
        RETURN_STR_COPY(text);
    }
    zval rv;
    zval *safe = zend_read_property(pt_safe_string_ce, object, ZEND_STRL("text"), 1, &rv);
    RETURN_STR_COPY(Z_STR_P(safe));
}

ZEND_METHOD(Polyspec_Template_Value_Value, isNumber)
{
    zval *value;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_ZVAL(value)
    ZEND_PARSE_PARAMETERS_END();

    ZVAL_DEREF(value);
    RETURN_BOOL(Z_TYPE_P(value) == IS_LONG || Z_TYPE_P(value) == IS_DOUBLE);
}

ZEND_METHOD(Polyspec_Template_Value_Value, isTruthy)
{
    zval *value;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_ZVAL(value)
    ZEND_PARSE_PARAMETERS_END();

    RETURN_BOOL(pt_host_truthy(value));
}

ZEND_METHOD(Polyspec_Template_Value_Value, stringify)
{
    zval *value;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_ZVAL(value)
    ZEND_PARSE_PARAMETERS_END();

    if (!pt_host_stringify(value, return_value)) {
        RETURN_THROWS();
    }
}

ZEND_METHOD(Polyspec_Template_Value_Value, parseNumericString)
{
    zend_string *text;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(text)
    ZEND_PARSE_PARAMETERS_END();

    double number;
    if (pt_numeric_string(ZSTR_VAL(text), ZSTR_LEN(text), &number)) {
        RETURN_DOUBLE(number);
    }
    RETURN_NULL();
}

ZEND_METHOD(Polyspec_Template_Value_Value, compareCodePoints)
{
    zend_string *a, *b;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_STR(a)
        Z_PARAM_STR(b)
    ZEND_PARSE_PARAMETERS_END();

    int order = 0;
    pt_compare(pt_string((pt_s){ZSTR_VAL(a), ZSTR_LEN(a)}), pt_string((pt_s){ZSTR_VAL(b), ZSTR_LEN(b)}), &order);
    RETURN_LONG(order);
}

ZEND_METHOD(Polyspec_Template_Value_Value, looseEquals)
{
    zval *a, *b;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_ZVAL(a)
        Z_PARAM_ZVAL(b)
    ZEND_PARSE_PARAMETERS_END();

    RETURN_BOOL(pt_host_loose_equals(a, b));
}

ZEND_METHOD(Polyspec_Template_Value_Value, strictEquals)
{
    zval *a, *b;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_ZVAL(a)
        Z_PARAM_ZVAL(b)
    ZEND_PARSE_PARAMETERS_END();

    RETURN_BOOL(pt_host_strict_equals(a, b));
}

ZEND_METHOD(Polyspec_Template_Value_Value, compare)
{
    zval *a, *b;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_ZVAL(a)
        Z_PARAM_ZVAL(b)
    ZEND_PARSE_PARAMETERS_END();

    zend_long order;
    if (pt_host_compare(a, b, &order)) {
        RETURN_LONG(order);
    }
    RETURN_NULL();
}

ZEND_METHOD(Polyspec_Template_Value_Value, isCollection)
{
    zval *value;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_ZVAL(value)
    ZEND_PARSE_PARAMETERS_END();

    ZVAL_DEREF(value);
    RETURN_BOOL(Z_TYPE_P(value) == IS_ARRAY
        || (Z_TYPE_P(value) == IS_OBJECT && Z_OBJCE_P(value) == pt_map_value_ce));
}

ZEND_METHOD(Polyspec_Template_Value_Number, toText)
{
    double value;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_DOUBLE(value)
    ZEND_PARSE_PARAMETERS_END();

    if (!pt_number_host_text(value, return_value)) {
        RETURN_THROWS();
    }
}

ZEND_METHOD(Polyspec_Template_Value_Number, shortestDigits)
{
    double value;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_DOUBLE(value)
    ZEND_PARSE_PARAMETERS_END();

    if (!pt_number_shortest_digits(value, return_value)) {
        RETURN_THROWS();
    }
}

ZEND_METHOD(Polyspec_Template_Value_Number, positional)
{
    double value;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_DOUBLE(value)
    ZEND_PARSE_PARAMETERS_END();

    if (!pt_number_positional(value, return_value)) {
        RETURN_THROWS();
    }
}

ZEND_METHOD(Polyspec_Template_Value_Number, roundDecimal)
{
    double value;
    zend_long decimals;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_DOUBLE(value)
        Z_PARAM_LONG(decimals)
    ZEND_PARSE_PARAMETERS_END();

    if (!pt_number_round_decimal(value, decimals, return_value)) {
        RETURN_THROWS();
    }
}

ZEND_METHOD(Polyspec_Template_Value_Number, format)
{
    double value;
    zend_long decimals;
    zend_string *dec, *thousands;
    ZEND_PARSE_PARAMETERS_START(4, 4)
        Z_PARAM_DOUBLE(value)
        Z_PARAM_LONG(decimals)
        Z_PARAM_STR(dec)
        Z_PARAM_STR(thousands)
    ZEND_PARSE_PARAMETERS_END();

    if (!pt_number_format(value, decimals, dec, thousands, return_value)) {
        RETURN_THROWS();
    }
}

ZEND_METHOD(Polyspec_Template_Value_Number, round)
{
    double value;
    zend_long decimals;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_DOUBLE(value)
        Z_PARAM_LONG(decimals)
    ZEND_PARSE_PARAMETERS_END();

    if (!pt_number_round(value, decimals, return_value)) {
        RETURN_THROWS();
    }
}

ZEND_METHOD(Polyspec_Template_Value_Number, isInteger)
{
    double value;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_DOUBLE(value)
    ZEND_PARSE_PARAMETERS_END();

    RETURN_BOOL(pt_is_integer(value));
}

ZEND_METHOD(Polyspec_Template_Value_HostArgument, of)
{
    zval *value;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_ZVAL(value)
    ZEND_PARSE_PARAMETERS_END();

    pt_host_argument(value, return_value);
}

ZEND_METHOD(Polyspec_Template_Value_HostArgument, list)
{
    zval *args;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_ARRAY(args)
    ZEND_PARSE_PARAMETERS_END();

    pt_host_argument_list(Z_ARRVAL_P(args), return_value);
}

/* Value\Json (VAL-2, VAL-12): parses JSON bytes into the values of the library. */
ZEND_METHOD(Polyspec_Template_Value_Json, parse)
{
    zend_string *bytes;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(bytes)
    ZEND_PARSE_PARAMETERS_END();

    pt_arena arena;
    pt_arena_init(&arena);
    pt_value value = {0};
    pt_bind_error error = {NULL, NULL};
    if (!pt_json_parse(&arena, ZSTR_VAL(bytes), ZSTR_LEN(bytes), &value, &error)) {
        pt_throw_bind_error(error.code, error.message);
        pt_arena_free(&arena);
        RETURN_THROWS();
    }
    pt_library_value(value, return_value);
    pt_arena_free(&arena);
}

/* Returns the 1-based line and column of a byte offset in a line index (the offsets at which the lines start). */
void pt_error_position(HashTable *lines, zend_long offset, zend_long *line, zend_long *col)
{
    zend_long low = 0, high = (zend_long)zend_hash_num_elements(lines) - 1;
    while (low < high) {
        zend_long mid = (low + high + 1) / 2;
        zval *start = zend_hash_index_find(lines, (zend_ulong)mid);
        if (start != NULL && zval_get_long(start) <= offset) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }
    zval *start = zend_hash_index_find(lines, (zend_ulong)low);
    *line = low + 1;
    *col = offset - (start != NULL ? zval_get_long(start) : 0) + 1;
}

ZEND_METHOD(Polyspec_Template_TemplateError, at)
{
    zend_string *code, *template, *message;
    HashTable *lines;
    zend_long start, end;
    ZEND_PARSE_PARAMETERS_START(6, 6)
        Z_PARAM_STR(code)
        Z_PARAM_STR(template)
        Z_PARAM_ARRAY_HT_OR_NULL(lines)
        Z_PARAM_LONG(start)
        Z_PARAM_LONG(end)
        Z_PARAM_STR(message)
    ZEND_PARSE_PARAMETERS_END();
    zend_long line = 0, col = 0;
    if (lines != NULL) {
        pt_error_position(lines, start, &line, &col);
    }
    object_init_ex(return_value, pt_error_ce);
    pt_error_fill(Z_OBJ_P(return_value), code, template, line, col, start, end, message);
}

ZEND_METHOD(Polyspec_Template_TemplateError, withoutPosition)
{
    zend_string *code, *template, *message;
    ZEND_PARSE_PARAMETERS_START(3, 3)
        Z_PARAM_STR(code)
        Z_PARAM_STR(template)
        Z_PARAM_STR(message)
    ZEND_PARSE_PARAMETERS_END();
    object_init_ex(return_value, pt_error_ce);
    pt_error_fill(Z_OBJ_P(return_value), code, template, 0, 0, 0, 0, message);
}

ZEND_METHOD(Polyspec_Template_TemplateError, toArray)
{
    ZEND_PARSE_PARAMETERS_NONE();
    zend_object *object = Z_OBJ_P(ZEND_THIS);
    zval rv;
    array_init_size(return_value, 7);
#define PT_ERROR_FIELD(key, name)                                                                 \
    do {                                                                                          \
        zval *value = zend_read_property(pt_error_ce, object, ZEND_STRL(name), 1, &rv);           \
        Z_TRY_ADDREF_P(value);                                                                    \
        add_assoc_zval_ex(return_value, ZEND_STRL(key), value);                                   \
    } while (0)
    PT_ERROR_FIELD("code", "errorCode");
    PT_ERROR_FIELD("template", "template");
    PT_ERROR_FIELD("line", "errorLine");
    PT_ERROR_FIELD("col", "errorCol");
    PT_ERROR_FIELD("offset", "offset");
    PT_ERROR_FIELD("end", "end");
#undef PT_ERROR_FIELD
    zval *message = zend_read_property_ex(zend_ce_exception, object, ZSTR_KNOWN(ZEND_STR_MESSAGE), 1, &rv);
    Z_TRY_ADDREF_P(message);
    add_assoc_zval_ex(return_value, ZEND_STRL("message"), message);
}

/* Throws the error of a run, or the native TemplateError of host code that passes unchanged. */
static void pt_throw(pt_error *error)
{
    if (error->exception) {
        zval exception;
        ZVAL_OBJ(&exception, error->exception);
        error->exception = NULL;
        zend_throw_exception_object(&exception);
        return;
    }
    zend_object *object = pt_error_object(error->code, error->template, error->line, error->col, error->offset, error->end, error->message);
    zval exception;
    ZVAL_OBJ(&exception, object);
    zend_throw_exception_object(&exception);
}

/* ----------------------------------------------------------------------------------------------- */
/* Runs                                                                                             */
/* ----------------------------------------------------------------------------------------------- */

static void pt_run_init(pt_run *run)
{
    pt_arena_init(&run->arena);
    memset(&run->error, 0, sizeof(run->error));
    run->parsing = NULL;
    run->held = NULL;
    run->held_count = run->held_capacity = 0;
}

/* Ends a run: throws its error when it failed and frees what it allocated. Returns whether it
 * succeeded. */
static bool pt_run_finish(pt_run *run);

/* The work of one run and its input, which a failure leaves through longjmp. */
typedef void (*pt_work)(pt_run *run, void *input);

/* Runs `work` with `input` as one run and ends it with pt_run_finish(). The inputs of the work are in the structure
 * that `input` points to, in memory, so no local of the frame that calls setjmp holds a value that a longjmp could
 * clobber (-Wclobbered). */
static bool pt_run_work(pt_work work, void *input)
{
    pt_run run;
    pt_run_init(&run);
    if (setjmp(run.jump) == 0) {
        work(&run, input);
    }
    return pt_run_finish(&run);
}

/* Runs the render `work` that writes into `output`, and returns the text; a failed run frees the output and leaves the exception. */
static void pt_return_output(pt_work work, void *input, smart_str *output, zval *return_value)
{
    if (!pt_run_work(work, input)) {
        smart_str_free(output);
        RETURN_THROWS();
    }
    smart_str_0(output);
    if (output->s == NULL) {
        RETURN_EMPTY_STRING();
    }
    RETURN_STR(output->s);
}

static bool pt_run_finish(pt_run *run)
{
    bool failed = run->error.code != NULL || run->error.exception != NULL;
    if (run->parsing) {
        pt_template_release(run->parsing);
        run->parsing = NULL;
    }
    pt_run_release_templates(run);
    pt_arena_free(&run->arena);
    if (failed) {
        pt_throw(&run->error);
    }
    pt_error_clear(&run->error);
    return !failed;
}

/* ----------------------------------------------------------------------------------------------- */
/* Options                                                                                          */
/* ----------------------------------------------------------------------------------------------- */

/* Reads the delimiter option (LEX-21); an invalid pair is the argument error of ERR-13. */
static bool pt_option_delimiters(HashTable *options, char *open, char *close)
{
    *open = '{';
    *close = '}';
    if (options == NULL) {
        return true;
    }
    zval *value = zend_hash_str_find_deref(options, "delimiters", sizeof("delimiters") - 1);
    if (value == NULL || Z_TYPE_P(value) == IS_NULL) {
        return true;
    }
    if (Z_TYPE_P(value) == IS_STRING && pt_parse_delimiters(Z_STRVAL_P(value), Z_STRLEN_P(value), open, close)) {
        return true;
    }
    smart_str text = {0};
    php_json_encode(&text, value, 0);
    smart_str_0(&text);
    zend_throw_exception_ex(spl_ce_InvalidArgumentException, 0, "%s is not a delimiter pair", text.s ? ZSTR_VAL(text.s) : "");
    smart_str_free(&text);
    return false;
}

/* Applies the integer entries of a limits array to the limits (RT-6); false after an exception. */
static bool pt_apply_limits(HashTable *values, pt_limits *limits)
{
    static const char *const names[] = {"iterations", "depth", "outputBytes", "expressionDepth"};
    zend_long *slots[] = {&limits->iterations, &limits->depth, &limits->output_bytes, &limits->expression_depth};
    for (int i = 0; i < 4; i++) {
        zval *limit = zend_hash_str_find_deref(values, names[i], strlen(names[i]));
        if (limit == NULL) {
            continue;
        }
        if (Z_TYPE_P(limit) != IS_LONG) {
            zend_throw_exception_ex(spl_ce_InvalidArgumentException, 0, "limits.%s is not an integer", names[i]);
            return false;
        }
        *slots[i] = Z_LVAL_P(limit);
    }
    return true;
}

/* The limits before any option: RuntimeEnvironment::DEFAULT_LIMITS (RT-33). */
static const pt_limits pt_default_limits = {1000000, 32, 16 * 1024 * 1024, 64};

/* ----------------------------------------------------------------------------------------------- */
/* RuntimeEnvironment (RT-33, FUN-43) and engine                                                    */
/* ----------------------------------------------------------------------------------------------- */

static zend_class_entry *pt_runtime_ce;
static zend_object_handlers pt_runtime_handlers;

static zend_object *pt_runtime_create(zend_class_entry *class_type)
{
    pt_runtime_object *object = zend_object_alloc(sizeof(pt_runtime_object), class_type);
    zend_object_std_init(&object->std, class_type);
    object_properties_init(&object->std, class_type);
    object->std.handlers = &pt_runtime_handlers;
    object->runtime.limits = pt_default_limits;
    zend_hash_init(&object->runtime.functions, 8, NULL, ZVAL_PTR_DTOR, 0);
    zend_hash_init(&object->runtime.classes, 8, NULL, ZVAL_PTR_DTOR, 0);
    return &object->std;
}

static void pt_runtime_free(zend_object *object)
{
    pt_runtime *runtime = pt_runtime_of(object);
    zend_hash_destroy(&runtime->functions);
    zend_hash_destroy(&runtime->classes);
    zend_object_std_dtor(object);
}

/* The registered callables may hold the environment, so the collector sees them. */
static HashTable *pt_runtime_get_gc(zend_object *object, zval **table, int *count)
{
    pt_runtime *runtime = pt_runtime_of(object);
    zend_get_gc_buffer *buffer = zend_get_gc_buffer_create();
    zval *value;
    ZEND_HASH_FOREACH_VAL(&runtime->functions, value) {
        zend_get_gc_buffer_add_zval(buffer, value);
    } ZEND_HASH_FOREACH_END();
    ZEND_HASH_FOREACH_VAL(&runtime->classes, value) {
        zend_get_gc_buffer_add_zval(buffer, value);
    } ZEND_HASH_FOREACH_END();
    zend_get_gc_buffer_use(buffer, table, count);
    return zend_std_get_properties(object);
}

/* RuntimeEnvironment::DEFAULT_LIMITS (RT-33): an immutable array in persistent memory, declared once at module start,
 * since gen_stub does not take an array constant. */
static void pt_declare_default_limits(zend_class_entry *ce)
{
    static const char *const names[] = {"iterations", "depth", "outputBytes", "expressionDepth"};
    zend_long values[] = {pt_default_limits.iterations, pt_default_limits.depth, pt_default_limits.output_bytes, pt_default_limits.expression_depth};
    HashTable *table = pemalloc(sizeof(HashTable), 1);
    zend_hash_init(table, 4, NULL, NULL, 1);
    for (int i = 0; i < 4; i++) {
        zval value;
        ZVAL_LONG(&value, values[i]);
        zend_hash_update(table, zend_string_init_interned(names[i], strlen(names[i]), 1), &value);
    }
    GC_SET_REFCOUNT(table, 2);
    GC_ADD_FLAGS(table, IS_ARRAY_IMMUTABLE);
    zval array;
    ZVAL_ARR(&array, table);
    Z_TYPE_INFO(array) = IS_ARRAY;
    zend_declare_class_constant_ex(ce, zend_string_init_interned("DEFAULT_LIMITS", sizeof("DEFAULT_LIMITS") - 1, 1), &array, ZEND_ACC_PUBLIC, NULL);
}

typedef struct pt_engine_object {
    pt_engine engine;
    zend_object std;
} pt_engine_object;

static zend_object_handlers pt_engine_handlers;

static inline pt_engine *pt_engine_of(zend_object *object)
{
    return &((pt_engine_object *)((char *)object - XtOffsetOf(pt_engine_object, std)))->engine;
}

static void pt_cache_dtor(zval *value)
{
    pt_template_release(Z_PTR_P(value));
}

static zend_object *pt_engine_create(zend_class_entry *class_type)
{
    pt_engine_object *object = zend_object_alloc(sizeof(pt_engine_object), class_type);
    zend_object_std_init(&object->std, class_type);
    object_properties_init(&object->std, class_type);
    object->std.handlers = &pt_engine_handlers;
    pt_engine *engine = &object->engine;
    engine->root = NULL;
    ZVAL_UNDEF(&engine->loader);
    engine->refresh = PT_REFRESH_TRUE;
    engine->open = '{';
    engine->close = '}';
    object_init_ex(&engine->runtime, pt_runtime_ce);
    zend_hash_init(&engine->cache, 8, NULL, pt_cache_dtor, 0);
    zend_hash_init(&engine->files, 8, NULL, ZVAL_PTR_DTOR, 0);
    return &object->std;
}

static void pt_engine_free(zend_object *object)
{
    pt_engine *engine = pt_engine_of(object);
    zval_ptr_dtor(&engine->runtime);
    zend_hash_destroy(&engine->cache);
    zend_hash_destroy(&engine->files);
    zval_ptr_dtor(&engine->loader);
    if (engine->root) {
        zend_string_release(engine->root);
    }
    zend_object_std_dtor(object);
}

/* The engine holds its runtime object and the loader, so the collector sees them. */
static HashTable *pt_engine_get_gc(zend_object *object, zval **table, int *count)
{
    pt_engine *engine = pt_engine_of(object);
    zend_get_gc_buffer *buffer = zend_get_gc_buffer_create();
    zend_get_gc_buffer_add_zval(buffer, &engine->runtime);
    zend_get_gc_buffer_add_zval(buffer, &engine->loader);
    zend_get_gc_buffer_use(buffer, table, count);
    return zend_std_get_properties(object);
}

typedef struct pt_parse_input {
    zend_string *source, *name;
    char open, close;
    zval *result;
} pt_parse_input;

static void pt_parse_into(pt_run *run, void *context)
{
    pt_parse_input *input = context;
    pt_template *template = pt_parse(run, ZSTR_VAL(input->name), ZSTR_LEN(input->name), ZSTR_VAL(input->source), ZSTR_LEN(input->source), input->open, input->close);
    pt_ast_to_zval(template, input->result);
    pt_template_release(template);
}

/* RT-2: parses one source; on success `result` holds the AST as nested arrays. */
static bool pt_parse_source(zend_string *source, zend_string *name, HashTable *options, zval *result)
{
    pt_parse_input input = {source, name, '{', '}', result};
    if (!pt_option_delimiters(options, &input.open, &input.close)) {
        return false;
    }
    return pt_run_work(pt_parse_into, &input);
}

/* AstProgram::parse: the template source into its AST. */
static void pt_method_parse(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *source, *name;
    HashTable *options = NULL;
    ZEND_PARSE_PARAMETERS_START(2, 3)
        Z_PARAM_STR(source)
        Z_PARAM_STR(name)
        Z_PARAM_OPTIONAL
        Z_PARAM_ARRAY_HT(options)
    ZEND_PARSE_PARAMETERS_END();

    if (!pt_parse_source(source, name, options, return_value)) {
        zval_ptr_dtor(return_value);
        ZVAL_NULL(return_value);
        RETURN_THROWS();
    }
}

typedef struct pt_analyze_input {
    zend_string *source, *name;
    char open, close;
    zval *result;
} pt_analyze_input;

static void pt_analyze_into(pt_run *run, void *context)
{
    pt_analyze_input *input = context;
    pt_analysis analysis;
    pt_template *template = pt_analyze(run, ZSTR_VAL(input->name), ZSTR_LEN(input->name), ZSTR_VAL(input->source), ZSTR_LEN(input->source), input->open, input->close, &analysis);
    zval ast, tags, tokens;
    pt_ast_to_zval(template, &ast);
    array_init_size(&tags, analysis.tag_count);
    for (uint32_t t = 0; t < analysis.tag_count; t++) {
        const pt_syntax_tag *tag = &analysis.tags[t];
        zval entry;
        array_init_size(&entry, 6);
        add_assoc_long_ex(&entry, "start", 5, (zend_long)tag->start);
        add_assoc_long_ex(&entry, "end", 3, (zend_long)tag->end);
        add_assoc_bool_ex(&entry, "echo", 4, tag->echo);
        add_assoc_string_ex(&entry, "kind", 4, tag->kind);
        add_assoc_long_ex(&entry, "bodyStart", 9, (zend_long)tag->body_start);
        add_assoc_long_ex(&entry, "bodyEnd", 7, (zend_long)tag->body_end);
        add_next_index_zval(&tags, &entry);
    }
    array_init_size(&tokens, analysis.token_count);
    for (uint32_t t = 0; t < analysis.token_count; t++) {
        const pt_syntax_token *token = &analysis.tokens[t];
        zval entry;
        array_init_size(&entry, 3);
        add_assoc_long_ex(&entry, "start", 5, (zend_long)token->start);
        add_assoc_long_ex(&entry, "end", 3, (zend_long)token->end);
        add_assoc_string_ex(&entry, "kind", 4, token->kind);
        add_next_index_zval(&tokens, &entry);
    }
    pt_template_release(template);
    array_init_size(input->result, 3);
    add_assoc_zval_ex(input->result, "ast", 3, &ast);
    add_assoc_zval_ex(input->result, "tags", 4, &tags);
    add_assoc_zval_ex(input->result, "tokens", 6, &tokens);
}

/* AstProgram::analyze: the AST, tags and tokens of a template source. */
static void pt_method_analyze(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *source, *name;
    HashTable *options = NULL;
    ZEND_PARSE_PARAMETERS_START(2, 3)
        Z_PARAM_STR(source)
        Z_PARAM_STR(name)
        Z_PARAM_OPTIONAL
        Z_PARAM_ARRAY_HT(options)
    ZEND_PARSE_PARAMETERS_END();

    pt_analyze_input input = {source, name, '{', '}', return_value};
    if (!pt_option_delimiters(options, &input.open, &input.close)) {
        RETURN_THROWS();
    }
    if (!pt_run_work(pt_analyze_into, &input)) {
        zval_ptr_dtor(return_value);
        ZVAL_NULL(return_value);
        RETURN_THROWS();
    }
}

/* ----------------------------------------------------------------------------------------------- */
/* Requests (RT-4, RT-24, RT-25)                                                                    */
/* ----------------------------------------------------------------------------------------------- */

/* A failure while binding the request has the entry template and no position (ERR-5). */
ZEND_NORETURN static void pt_request_fail(pt_run *run, pt_s name, const char *code, zend_string *message)
{
    pt_fail_bare(run, code, name, message);
}

static HashTable *pt_defines_new(pt_run *run)
{
    HashTable *defines = zend_new_array(4);
    zval owner;
    ZVAL_ARR(&owner, defines);
    pt_arena_keep(&run->arena, &owner);
    zval_ptr_dtor(&owner);
    return defines;
}

/* ----------------------------------------------------------------------------------------------- */
/* Host functions (FUN-43, FUN-44)                                                                  */
/* ----------------------------------------------------------------------------------------------- */

static bool pt_identifier(zend_string *name)
{
    const char *s = ZSTR_VAL(name);
    size_t n = ZSTR_LEN(name);
    if (n == 0 || !((s[0] >= 'A' && s[0] <= 'Z') || (s[0] >= 'a' && s[0] <= 'z') || s[0] == '_')) {
        return false;
    }
    for (size_t i = 1; i < n; i++) {
        char c = s[i];
        if (!((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_')) {
            return false;
        }
    }
    return true;
}

/* Registers a host function after validating its name (FUN-43, FUN-44); false after an exception. */
static bool pt_register_function(pt_runtime *runtime, zend_string *name, zval *callable)
{
    if (!pt_identifier(name)) {
        zend_string *quoted = pt_json_quote(ZSTR_VAL(name), ZSTR_LEN(name));
        zend_throw_exception_ex(spl_ce_InvalidArgumentException, 0, "%s is not an identifier", ZSTR_VAL(quoted));
        zend_string_release(quoted);
        return false;
    }
    if (pt_builtin_find(ZSTR_VAL(name), ZSTR_LEN(name)) != NULL) {
        zend_throw_exception_ex(spl_ce_InvalidArgumentException, 0, "%s is a built-in function", ZSTR_VAL(name));
        return false;
    }
    zval function;
    ZVAL_COPY(&function, callable);
    zend_hash_update(&runtime->functions, name, &function);
    return true;
}

/* register of AstProgram and RuntimeEnvironment: a global function callable under a name, on the runtime
 * that the method acts on. */
static void pt_method_register(pt_runtime *runtime, INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *name;
    zend_fcall_info fci;
    zend_fcall_info_cache fcc;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_STR(name)
        Z_PARAM_FUNC(fci, fcc)
    ZEND_PARSE_PARAMETERS_END();

    pt_register_function(runtime, name, &fci.function_name);
}

/* registerClass of AstProgram and RuntimeEnvironment: a class method callable under Class::method. */
static void pt_method_register_class(pt_runtime *runtime, INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *class_name, *method;
    zend_fcall_info fci;
    zend_fcall_info_cache fcc;
    ZEND_PARSE_PARAMETERS_START(3, 3)
        Z_PARAM_STR(class_name)
        Z_PARAM_STR(method)
        Z_PARAM_FUNC(fci, fcc)
    ZEND_PARSE_PARAMETERS_END();

    if (!pt_identifier(class_name) || !pt_identifier(method)) {
        zend_throw_exception(spl_ce_InvalidArgumentException, "class function names must be identifiers", 0);
        RETURN_THROWS();
    }
    zend_string *key = zend_strpprintf(0, "%s::%s", ZSTR_VAL(class_name), ZSTR_VAL(method));
    zval function;
    ZVAL_COPY(&function, &fci.function_name);
    zend_hash_update(&runtime->classes, key, &function);
    zend_string_release(key);
}

/* ----------------------------------------------------------------------------------------------- */
/* render with PHP values (RT-4, RT-24, RT-25, VAL-11, VAL-14, VAL-22)                              */
/* ----------------------------------------------------------------------------------------------- */

ZEND_NORETURN static void pt_bind_fail_run(pt_run *run, pt_s name, pt_bind_error *error)
{
    pt_request_fail(run, name, error->code, error->message);
}

/* The data of a definition: a bound map of the extension is not bound again (VAL-22); every other
 * value is bound as its own value, and the empty array is the empty map. */
static pt_map *pt_define_data(pt_run *run, pt_s name, pt_s id, zval *input)
{
    pt_bind_error error = {NULL, NULL};
    pt_map *map;
    if (pt_bound_of(input) != NULL) {
        if (!pt_bind_map(&run->arena, input, &map, &error)) {
            pt_bind_fail_run(run, name, &error);
        }
        return map;
    }
    pt_value value = {0};
    if (!pt_bind_value(&run->arena, input, &value, &error)) {
        pt_bind_fail_run(run, name, &error);
    }
    if (value.type == PT_MAP) {
        return value.u.map;
    }
    if (value.type == PT_LIST && value.u.list->count == 0) {
        return pt_map_new(&run->arena, 0);
    }
    pt_request_fail(run, name, PT_E_DATA_UNSUPPORTED_TYPE, zend_strpprintf(0, "define %s: data is not a map", id.s));
}

static HashTable *pt_defines_from_php(pt_run *run, pt_s name, zval *input)
{
    ZVAL_DEREF(input);
    if (Z_TYPE_P(input) != IS_ARRAY) {
        pt_request_fail(run, name, PT_E_DATA_UNSUPPORTED_TYPE, zend_string_init("define is not an object", 23, 0));
    }
    HashTable *defines = pt_defines_new(run);
    zend_ulong index;
    zend_string *key;
    zval *entry;
    ZEND_HASH_FOREACH_KEY_VAL(Z_ARRVAL_P(input), index, key, entry) {
        pt_s id = {NULL, 0};
        if (key == NULL) {
            char digits[32];
            int written = snprintf(digits, sizeof(digits), ZEND_LONG_FMT, (zend_long)index);
            id = pt_strdup(&run->arena, digits, (size_t)written);
        } else {
            if (pt_utf8_first_invalid(ZSTR_VAL(key), ZSTR_LEN(key)) < ZSTR_LEN(key)) {
                pt_request_fail(run, name, PT_E_DATA_INVALID_UTF8, zend_string_init("a define id is not valid UTF-8", 30, 0));
            }
            id = pt_strdup(&run->arena, ZSTR_VAL(key), ZSTR_LEN(key));
        }
        ZVAL_DEREF(entry);
        pt_define *define = pt_alloc(&run->arena, sizeof(pt_define));
        zval *html = NULL, *template = NULL, *data = NULL;
        if (Z_TYPE_P(entry) == IS_ARRAY) {
            html = zend_hash_str_find_deref(Z_ARRVAL_P(entry), "html", 4);
            template = zend_hash_str_find_deref(Z_ARRVAL_P(entry), "template", 8);
            data = zend_hash_str_find(Z_ARRVAL_P(entry), "data", 4);
            html = html && Z_TYPE_P(html) == IS_STRING ? html : NULL;
            template = template && Z_TYPE_P(template) == IS_STRING ? template : NULL;
        } else if (Z_TYPE_P(entry) == IS_STRING) {
            template = entry;
        }
        if (html != NULL) {
            define->html = true;
            define->template = pt_strdup(&run->arena, Z_STRVAL_P(html), Z_STRLEN_P(html));
        } else if (template != NULL) {
            pt_s resolved = {NULL, 0};
            if (!pt_resolve_path(&run->arena, PT_S(""), (pt_s){Z_STRVAL_P(template), Z_STRLEN_P(template)}, &resolved)) {
                pt_request_fail(run, name, PT_E_DATA_UNSUPPORTED_TYPE, zend_strpprintf(0, "define %s: template path leaves the loader root", id.s));
            }
            define->template = pt_strdup(&run->arena, resolved.s, resolved.n);
            define->data = data != NULL ? pt_define_data(run, name, id, data) : NULL;
        } else {
            pt_request_fail(run, name, PT_E_DATA_UNSUPPORTED_TYPE, zend_strpprintf(0, "define %s: entry needs \"template\" or \"html\"", id.s));
        }
        zend_hash_str_update_ptr(defines, id.s, id.n, define);
    } ZEND_HASH_FOREACH_END();
    return defines;
}

static void pt_env_from_php(pt_run *run, pt_s name, zval *input, pt_env *env)
{
    env->timezone = PT_S("Z");
    env->now = (double)time(NULL);
    if (input == NULL) {
        return;
    }
    ZVAL_DEREF(input);
    if (Z_TYPE_P(input) == IS_NULL) {
        return;
    }
    if (Z_TYPE_P(input) != IS_ARRAY) {
        pt_request_fail(run, name, PT_E_DATA_UNSUPPORTED_TYPE, zend_string_init("env is not an object", 20, 0));
    }
    zval *timezone = zend_hash_str_find_deref(Z_ARRVAL_P(input), "timezone", 8);
    if (timezone != NULL && Z_TYPE_P(timezone) != IS_NULL) {
        if (Z_TYPE_P(timezone) != IS_STRING) {
            pt_request_fail(run, name, PT_E_DATA_UNSUPPORTED_TYPE, zend_string_init("env.timezone is not a string", 28, 0));
        }
        env->timezone = pt_strdup(&run->arena, Z_STRVAL_P(timezone), Z_STRLEN_P(timezone));
    }
    zval *now = zend_hash_str_find_deref(Z_ARRVAL_P(input), "now", 3);
    if (now != NULL && Z_TYPE_P(now) != IS_NULL) {
        if (Z_TYPE_P(now) == IS_LONG) {
            env->now = (double)Z_LVAL_P(now);
        } else if (Z_TYPE_P(now) == IS_DOUBLE) {
            env->now = Z_DVAL_P(now);
        } else {
            pt_request_fail(run, name, PT_E_DATA_UNSUPPORTED_TYPE, zend_string_init("env.now is not a number", 23, 0));
        }
    }
}

typedef struct pt_php_input {
    pt_engine *engine;
    zend_string *name;
    zval *assign;
    HashTable *options;
    smart_str *output;
    pt_template *root; /* the prepared entry template of a prepared render, or NULL */
} pt_php_input;

static void pt_render_php_into(pt_run *run, void *context)
{
    pt_php_input *input = context;
    pt_engine *engine = input->engine;
    zend_string *name = input->name;
    zval *assign = input->assign;
    HashTable *options = input->options;
    smart_str *output = input->output;
    pt_request request;
    memset(&request, 0, sizeof(request));
    request.name = pt_strdup(&run->arena, ZSTR_VAL(name), ZSTR_LEN(name));
    pt_bind_error error = {NULL, NULL};
    if (assign == NULL) {
        request.data = pt_map_new(&run->arena, 0);
    } else if (!pt_bind_map(&run->arena, assign, &request.data, &error)) {
        pt_bind_fail_run(run, request.name, &error);
    }
    zval *define = options ? zend_hash_str_find(options, "define", 6) : NULL;
    if (define != NULL) {
        request.defines = pt_defines_from_php(run, request.name, define);
    }
    pt_env_from_php(run, request.name, options ? zend_hash_str_find(options, "env", 3) : NULL, &request.env);
    request.root = input->root;
    pt_render(run, engine, &request, output);
}

/* ----------------------------------------------------------------------------------------------- */
/* Loaders (RT-9, RT-10)                                                                            */
/* ----------------------------------------------------------------------------------------------- */

static zend_class_entry *pt_filesystem_loader_ce;

/* The crc32b of a text as eight lower case hexadecimal digits, as hash('crc32b', $text) gives it. */
static zend_string *pt_crc32b(const char *text, size_t length)
{
    static uint32_t table[256];
    static bool ready = false;
    if (!ready) {
        for (uint32_t n = 0; n < 256; n++) {
            uint32_t c = n;
            for (int k = 0; k < 8; k++) {
                c = (c & 1) ? 0xEDB88320U ^ (c >> 1) : c >> 1;
            }
            table[n] = c;
        }
        ready = true;
    }
    uint32_t crc = 0xFFFFFFFFU;
    for (size_t i = 0; i < length; i++) {
        crc = table[(crc ^ (unsigned char)text[i]) & 0xFF] ^ (crc >> 8);
    }
    return zend_strpprintf(0, "%08x", crc ^ 0xFFFFFFFFU);
}

/* Builds the entry of the array loader for a source or a parsed template; false after an exception. */
static bool pt_array_loader_entry(zval *entry, zval *value, int argument)
{
    zend_string *version;
    if (Z_TYPE_P(value) != IS_STRING && Z_TYPE_P(value) != IS_ARRAY) {
        zend_argument_type_error(argument, "must be of type array|string, %s given", zend_zval_type_name(value));
        return false;
    }
    array_init(entry);
    if (Z_TYPE_P(value) == IS_STRING) {
        version = pt_crc32b(Z_STRVAL_P(value), Z_STRLEN_P(value));
        Z_ADDREF_P(value);
        add_assoc_zval(entry, "source", value);
    } else {
        smart_str json = {0};
        if (php_json_encode(&json, value, 0) == FAILURE) {
            smart_str_free(&json);
        }
        smart_str_0(&json);
        version = pt_crc32b(json.s ? ZSTR_VAL(json.s) : "", json.s ? ZSTR_LEN(json.s) : 0);
        smart_str_free(&json);
        Z_ADDREF_P(value);
        add_assoc_zval(entry, "ast", value);
    }
    add_assoc_str(entry, "version", version);
    return true;
}

static bool pt_array_loader_set(zend_object *object, zend_string *name, zval *value, int argument)
{
    zval entry;
    if (!pt_array_loader_entry(&entry, value, argument)) {
        return false;
    }
    zval *entries = OBJ_PROP_NUM(object, 0);
    SEPARATE_ARRAY(entries);
    zend_hash_update(Z_ARRVAL_P(entries), name, &entry);
    return true;
}

ZEND_METHOD(Polyspec_Template_Loader_ArrayLoader, __construct)
{
    HashTable *sources = NULL;
    ZEND_PARSE_PARAMETERS_START(0, 1)
        Z_PARAM_OPTIONAL
        Z_PARAM_ARRAY_HT(sources)
    ZEND_PARSE_PARAMETERS_END();
    if (sources == NULL) {
        return;
    }
    zend_ulong index;
    zend_string *key;
    zval *value;
    ZEND_HASH_FOREACH_KEY_VAL(sources, index, key, value) {
        zend_string *name = key != NULL ? zend_string_copy(key) : zend_long_to_str((zend_long)index);
        bool stored = pt_array_loader_set(Z_OBJ_P(ZEND_THIS), name, value, 2);
        zend_string_release(name);
        if (!stored) {
            RETURN_THROWS();
        }
    } ZEND_HASH_FOREACH_END();
}

ZEND_METHOD(Polyspec_Template_Loader_ArrayLoader, set)
{
    zend_string *name;
    zval *value;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_STR(name)
        Z_PARAM_ZVAL(value)
    ZEND_PARSE_PARAMETERS_END();
    if (!pt_array_loader_set(Z_OBJ_P(ZEND_THIS), name, value, 2)) {
        RETURN_THROWS();
    }
}

ZEND_METHOD(Polyspec_Template_Loader_ArrayLoader, load)
{
    zend_string *name;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(name)
    ZEND_PARSE_PARAMETERS_END();
    zval *entry = zend_hash_find(Z_ARRVAL_P(OBJ_PROP_NUM(Z_OBJ_P(ZEND_THIS), 0)), name);
    if (entry == NULL) {
        RETURN_NULL();
    }
    RETURN_COPY(entry);
}

ZEND_METHOD(Polyspec_Template_Loader_FilesystemLoader, __construct)
{
    zend_string *root;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(root)
    ZEND_PARSE_PARAMETERS_END();
    char resolved[MAXPATHLEN];
    zend_string *value;
    if (!zend_str_has_nul_byte(root) && VCWD_REALPATH(ZSTR_VAL(root), resolved) != NULL) {
        value = zend_string_init(resolved, strlen(resolved), 0);
    } else {
        size_t length = ZSTR_LEN(root);
        while (length > 0 && ZSTR_VAL(root)[length - 1] == '/') {
            length--;
        }
        value = zend_string_init(ZSTR_VAL(root), length, 0);
    }
    zend_update_property_str(pt_filesystem_loader_ce, Z_OBJ_P(ZEND_THIS), "root", sizeof("root") - 1, value);
    zend_string_release(value);
}

/* Throws the RuntimeException of a failed load. */
static void pt_loader_failure(const char *format, ...)
{
    va_list arguments;
    va_start(arguments, format);
    zend_string *message = zend_vstrpprintf(0, format, arguments);
    va_end(arguments);
    zend_throw_exception(spl_ce_RuntimeException, ZSTR_VAL(message), 0);
    zend_string_release(message);
}

ZEND_METHOD(Polyspec_Template_Loader_FilesystemLoader, load)
{
    zend_string *name;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(name)
    ZEND_PARSE_PARAMETERS_END();
    zval rv;
    zend_string *root = Z_STR_P(zend_read_property(pt_filesystem_loader_ce, Z_OBJ_P(ZEND_THIS), "root", sizeof("root") - 1, 0, &rv));
    zend_string *path = zend_string_concat3(ZSTR_VAL(root), ZSTR_LEN(root), "/", 1, ZSTR_VAL(name), ZSTR_LEN(name));
    if (zend_str_has_nul_byte(path)) {
        zend_string_release(path);
        zend_value_error("%s(): Argument #1 ($name) must not contain any null bytes", "Polyspec\\Template\\Loader\\FilesystemLoader::load");
        RETURN_THROWS();
    }
    /* Each component below the root is examined without following a symbolic link (RT-10). */
    zend_stat_t info;
    size_t component = ZSTR_LEN(root) + 1;
    for (;;) {
        const char *slash = memchr(ZSTR_VAL(path) + component, '/', ZSTR_LEN(path) - component);
        size_t until = slash != NULL ? (size_t)(slash - ZSTR_VAL(path)) : ZSTR_LEN(path);
        char *prefix = estrndup(ZSTR_VAL(path), until);
        int missing = VCWD_LSTAT(prefix, &info) != 0;
        efree(prefix);
        if (missing) {
            zend_string_release(path);
            RETURN_NULL();
        }
        if (S_ISLNK(info.st_mode)) {
            pt_loader_failure("%.*s is a symbolic link", (int)(until - ZSTR_LEN(root) - 1), ZSTR_VAL(path) + ZSTR_LEN(root) + 1);
            zend_string_release(path);
            RETURN_THROWS();
        }
        if (slash == NULL) {
            break;
        }
        if (!S_ISDIR(info.st_mode)) {
            zend_string_release(path);
            RETURN_NULL();
        }
        component = until + 1;
    }
    if (!S_ISREG(info.st_mode)) {
        zend_string_release(path);
        RETURN_NULL();
    }
    /* One file has one name: the device and inode number identify the file. */
    zend_string *identity = zend_strpprintf(0, "%llu:%llu", (unsigned long long)info.st_dev, (unsigned long long)info.st_ino);
    zval *files = OBJ_PROP_NUM(Z_OBJ_P(ZEND_THIS), 1);
    SEPARATE_ARRAY(files);
    zval *owner = zend_hash_find(Z_ARRVAL_P(files), identity);
    if (owner == NULL) {
        zval named;
        ZVAL_STR_COPY(&named, name);
        zend_hash_add_new(Z_ARRVAL_P(files), identity, &named);
    } else if (!zend_string_equals(Z_STR_P(owner), name)) {
        pt_loader_failure("%s is the file of %s", ZSTR_VAL(name), Z_STRVAL_P(owner));
        zend_string_release(identity);
        zend_string_release(path);
        RETURN_THROWS();
    }
    zend_string_release(identity);
    php_stream *stream = VCWD_ACCESS(ZSTR_VAL(path), R_OK) == 0 ? php_stream_open_wrapper_ex(ZSTR_VAL(path), "rb", 0, NULL, NULL) : NULL;
    zend_string *bytes = stream ? php_stream_copy_to_mem(stream, PHP_STREAM_COPY_ALL, 0) : NULL;
    if (stream) {
        php_stream_close(stream);
    }
    zend_string_release(path);
    if (stream == NULL) {
        pt_loader_failure("%s cannot be read", ZSTR_VAL(name));
        RETURN_THROWS();
    }
    array_init(return_value);
    add_assoc_str(return_value, "source", bytes ? bytes : ZSTR_EMPTY_ALLOC());
    add_assoc_str(return_value, "version", zend_strpprintf(0, "%lld:%lld", (long long)info.st_mtime, (long long)info.st_size));
}

/* ----------------------------------------------------------------------------------------------- */
/* BoundMap (VAL-22, ERR-14, RT-26)                                                                 */
/* ----------------------------------------------------------------------------------------------- */

static zend_object_handlers pt_bound_handlers;

static zend_object *pt_bound_create(zend_class_entry *class_type)
{
    pt_bound *bound = zend_object_alloc(sizeof(pt_bound), class_type);
    zend_object_std_init(&bound->std, class_type);
    object_properties_init(&bound->std, class_type);
    bound->std.handlers = &pt_bound_handlers;
    pt_arena_init(&bound->arena);
    bound->map = pt_map_new(&bound->arena, 0);
    bound->sources[0] = bound->sources[1] = NULL;
    return &bound->std;
}

static void pt_bound_free(zend_object *object)
{
    pt_bound *bound = pt_bound_from(object);
    pt_arena_free(&bound->arena);
    for (int i = 0; i < 2; i++) {
        if (bound->sources[i]) {
            OBJ_RELEASE(bound->sources[i]);
        }
    }
    zend_object_std_dtor(object);
}

/* Throws the error of a bind or merge, which has no template and no position (ERR-14). */
static void pt_throw_bare(const char *code, zend_string *message)
{
    zend_string *template = ZSTR_EMPTY_ALLOC();
    zend_object *object = pt_error_object(code, template, 0, 0, 0, 0, message);
    zend_string_release(message);
    zval exception;
    ZVAL_OBJ(&exception, object);
    zend_throw_exception_object(&exception);
}

/* The private constructor and clone refuse outside calls; unserialize throws (VAL-22). */
ZEND_METHOD(Polyspec_Template_BoundMap, __construct)
{
    ZEND_PARSE_PARAMETERS_NONE();
}

ZEND_METHOD(Polyspec_Template_BoundMap, __clone)
{
    ZEND_PARSE_PARAMETERS_NONE();
}

ZEND_METHOD(Polyspec_Template_BoundMap, __unserialize)
{
    HashTable *data;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_ARRAY_HT(data)
    ZEND_PARSE_PARAMETERS_END();

    zend_throw_exception(spl_ce_LogicException, "a bound map cannot be unserialized", 0);
    RETURN_THROWS();
}

ZEND_METHOD(Polyspec_Template_BoundMap, bind)
{
    zval *value;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_ZVAL(value)
    ZEND_PARSE_PARAMETERS_END();

    if (pt_bound_of(value) != NULL) {
        ZVAL_DEREF(value);
        RETURN_COPY(value);
    }
    zend_object *object = pt_bound_create(pt_bound_ce);
    pt_bound *bound = pt_bound_from(object);
    ZVAL_DEREF(value);
    if (Z_TYPE_P(value) != IS_NULL) {
        pt_value result = {0};
        pt_bind_error error = {NULL, NULL};
        if (!pt_bind_value(&bound->arena, value, &result, &error)) {
            OBJ_RELEASE(object);
            pt_throw_bare(error.code, error.message);
            RETURN_THROWS();
        }
        if (result.type == PT_MAP) {
            bound->map = result.u.map;
        } else if (!(result.type == PT_LIST && result.u.list->count == 0)) {
            OBJ_RELEASE(object);
            pt_throw_bare(PT_E_DATA_UNSUPPORTED_TYPE, zend_string_init("bind takes a value that binds to a map", 38, 0));
            RETURN_THROWS();
        }
    }
    RETURN_OBJ(object);
}

ZEND_METHOD(Polyspec_Template_BoundMap, merge)
{
    zval *first, *second;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_ZVAL(first)
        Z_PARAM_ZVAL(second)
    ZEND_PARSE_PARAMETERS_END();

    pt_bound *left = pt_bound_of(first), *right = pt_bound_of(second);
    if (left == NULL || right == NULL) {
        pt_throw_bare(PT_E_DATA_UNSUPPORTED_TYPE, zend_string_init("merge takes two bound maps", 26, 0));
        RETURN_THROWS();
    }
    zend_object *object = pt_bound_create(pt_bound_ce);
    pt_bound *bound = pt_bound_from(object);
    /* The merged map reads the values of both maps without binding them again, so it keeps them. */
    bound->map = pt_map_copy(&bound->arena, left->map);
    for (uint32_t i = 0; i < right->map->used; i++) {
        if (right->map->entries[i].live) {
            pt_map_set(bound->map, right->map->entries[i].key, right->map->entries[i].value);
        }
    }
    bound->sources[0] = &left->std;
    bound->sources[1] = &right->std;
    GC_ADDREF(&left->std);
    GC_ADDREF(&right->std);
    RETURN_OBJ(object);
}

/* ----------------------------------------------------------------------------------------------- */
/* PreparedRender (ERR-13)                                                                          */
/* ----------------------------------------------------------------------------------------------- */

static zend_class_entry *pt_prepared_render_ce;

ZEND_METHOD(Polyspec_Template_PreparedRender, __construct)
{
    zend_string *name;
    zval *execution;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_STR(name)
        Z_PARAM_OBJECT(execution)
    ZEND_PARSE_PARAMETERS_END();
    zend_update_property_str(pt_prepared_render_ce, Z_OBJ_P(ZEND_THIS), ZEND_STRL("name"), name);
    zend_update_property(pt_prepared_render_ce, Z_OBJ_P(ZEND_THIS), ZEND_STRL("execution"), execution);
}

/* Renders the execution; an error of the PHP Error hierarchy is E_INTERNAL of the entry template, and a template
 * error and every exception pass unchanged. */
ZEND_METHOD(Polyspec_Template_PreparedRender, render)
{
    ZEND_PARSE_PARAMETERS_NONE();
    zval rv_name, rv_execution;
    zval *name = zend_read_property(pt_prepared_render_ce, Z_OBJ_P(ZEND_THIS), ZEND_STRL("name"), 1, &rv_name);
    zval *execution = zend_read_property(pt_prepared_render_ce, Z_OBJ_P(ZEND_THIS), ZEND_STRL("execution"), 1, &rv_execution);
    zend_function *render = zend_hash_str_find_ptr(&Z_OBJCE_P(execution)->function_table, ZEND_STRL("render"));
    zend_call_known_instance_method_with_0_params(render, Z_OBJ_P(execution), return_value);
    if (EG(exception) && instanceof_function(EG(exception)->ce, zend_ce_error)) {
        zend_object *failure = EG(exception);
        zval text;
        GC_ADDREF(failure);
        zend_clear_exception();
        zend_string *reason = zval_get_string(zend_read_property_ex(zend_ce_error, failure, ZSTR_KNOWN(ZEND_STR_MESSAGE), 1, &text));
        zend_string *message = zend_strpprintf(0, "internal failure: %s", ZSTR_VAL(reason));
        zend_string_release(reason);
        OBJ_RELEASE(failure);
        zval_ptr_dtor(return_value);
        RETVAL_NULL();
        zval exception;
        ZVAL_OBJ(&exception, pt_error_object(PT_E_INTERNAL, Z_STR_P(name), 0, 0, 0, 0, message));
        zend_throw_exception_object(&exception);
        zend_string_release(message);
    }
}

/* ----------------------------------------------------------------------------------------------- */
/* Engine: a Program that delegates every request to the Program it holds                          */
/* ----------------------------------------------------------------------------------------------- */

static zend_class_entry *pt_program_ce, *pt_program_engine_ce;

ZEND_METHOD(Polyspec_Template_Engine, __construct)
{
    zval *program;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_OBJECT_OF_CLASS(program, pt_program_ce)
    ZEND_PARSE_PARAMETERS_END();
    zend_update_property(pt_program_engine_ce, Z_OBJ_P(ZEND_THIS), ZEND_STRL("program"), program);
}

/* Calls the method `method` of the program of the engine with the arguments of the caller, passed as they are, so an
 * immutable array (such as a literal `[]`) keeps its type; what the program returns or throws is the result of the
 * engine. */
static void pt_program_engine_delegate(zend_execute_data *execute_data, zval *return_value, const char *method, size_t length)
{
    HashTable *target_array;
    zend_string *target_name;
    zval *assign = NULL;
    HashTable *options = NULL;
    ZEND_PARSE_PARAMETERS_START(1, 3)
        Z_PARAM_ARRAY_HT_OR_STR(target_array, target_name)
        Z_PARAM_OPTIONAL
        Z_PARAM_ZVAL(assign)
        Z_PARAM_ARRAY_HT(options)
    ZEND_PARSE_PARAMETERS_END();

    uint32_t given = ZEND_NUM_ARGS();
    zval params[3];
    ZVAL_COPY_VALUE(&params[0], ZEND_CALL_ARG(execute_data, 1));
    if (given >= 2) {
        ZVAL_COPY_VALUE(&params[1], ZEND_CALL_ARG(execute_data, 2));
    } else {
        ZVAL_EMPTY_ARRAY(&params[1]);
    }
    if (given >= 3) {
        ZVAL_COPY_VALUE(&params[2], ZEND_CALL_ARG(execute_data, 3));
    } else {
        ZVAL_EMPTY_ARRAY(&params[2]);
    }
    zval rv;
    zval *program = zend_read_property(pt_program_engine_ce, Z_OBJ_P(ZEND_THIS), ZEND_STRL("program"), 1, &rv);
    zend_function *function = zend_hash_str_find_ptr(&Z_OBJCE_P(program)->function_table, method, length);
    zend_call_known_instance_method(function, Z_OBJ_P(program), return_value, 3, params);
}

ZEND_METHOD(Polyspec_Template_Engine, prepare)
{
    pt_program_engine_delegate(execute_data, return_value, ZEND_STRL("prepare"));
}

ZEND_METHOD(Polyspec_Template_Engine, render)
{
    pt_program_engine_delegate(execute_data, return_value, ZEND_STRL("render"));
}

/* ----------------------------------------------------------------------------------------------- */
/* AstProgram (RT-1 to RT-9, RT-40, RT-41, RT-61)                                                   */
/* ----------------------------------------------------------------------------------------------- */

static zend_class_entry *pt_ast_program_ce, *pt_ast_execution_ce, *pt_loader_interface_ce, *pt_array_loader_ce;

static const char *const pt_refresh_names[] = {"true", "dev", "false"};

ZEND_METHOD(Polyspec_Template_AstProgram, __construct)
{
    zval *loader = NULL;
    HashTable *options = NULL;
    ZEND_PARSE_PARAMETERS_START(0, 2)
        Z_PARAM_OPTIONAL
        Z_PARAM_OBJECT_OF_CLASS_OR_NULL(loader, pt_loader_interface_ce)
        Z_PARAM_ARRAY_HT(options)
    ZEND_PARSE_PARAMETERS_END();

    zend_object *object = Z_OBJ_P(ZEND_THIS);
    pt_engine *engine = pt_engine_of(object);
    if (loader != NULL) {
        ZVAL_COPY(&engine->loader, loader);
    } else {
        object_init_ex(&engine->loader, pt_array_loader_ce);
    }
    /* The runtime is a RuntimeEnvironment built from the options "limits" and "functions": its constructor checks them,
     * so a wrong option gives the TypeError of the library (empty arrays for the absent or null options). */
    zval empty, arguments[2], retval;
    ZVAL_EMPTY_ARRAY(&empty);
    ZVAL_NULL(&retval);
    zval *limits = options ? zend_hash_str_find_deref(options, "limits", sizeof("limits") - 1) : NULL;
    zval *functions = options ? zend_hash_str_find_deref(options, "functions", sizeof("functions") - 1) : NULL;
    ZVAL_COPY_VALUE(&arguments[0], limits != NULL && Z_TYPE_P(limits) != IS_NULL ? limits : &empty);
    ZVAL_COPY_VALUE(&arguments[1], functions != NULL && Z_TYPE_P(functions) != IS_NULL ? functions : &empty);
    zend_call_known_instance_method_with_2_params(pt_runtime_ce->constructor, Z_OBJ(engine->runtime), &retval, &arguments[0], &arguments[1]);
    zval_ptr_dtor(&retval);
    if (EG(exception)) {
        RETURN_THROWS();
    }
    zend_update_property(pt_ast_program_ce, object, ZEND_STRL("runtime"), &engine->runtime);
    char open, close;
    if (!pt_option_delimiters(options, &open, &close)) {
        RETURN_THROWS();
    }
    engine->open = open;
    engine->close = close;
    zval *refresh = options ? zend_hash_str_find_deref(options, "artifact_refresh", sizeof("artifact_refresh") - 1) : NULL;
    zend_string *policy = refresh != NULL && Z_TYPE_P(refresh) != IS_NULL ? zval_get_string(refresh) : zend_string_init("true", 4, 0);
    int policies = (int)(sizeof(pt_refresh_names) / sizeof(pt_refresh_names[0]));
    int found = -1;
    for (int i = 0; i < policies; i++) {
        if (zend_string_equals_cstr(policy, pt_refresh_names[i], strlen(pt_refresh_names[i]))) {
            found = i;
        }
    }
    if (found < 0) {
        zend_throw_exception_ex(spl_ce_InvalidArgumentException, 0, "%s is not an artifact refresh policy", ZSTR_VAL(policy));
        zend_string_release(policy);
        RETURN_THROWS();
    }
    engine->refresh = (uint8_t)(found == 0 ? PT_REFRESH_TRUE : found == 1 ? PT_REFRESH_DEV : PT_REFRESH_FALSE);
    zend_update_property_str(pt_ast_program_ce, object, ZEND_STRL("artifactRefresh"), policy);
    zend_string_release(policy);
    zend_update_property(pt_ast_program_ce, object, ZEND_STRL("loader"), &engine->loader);
    zval delimiters;
    array_init_size(&delimiters, 2);
    add_next_index_stringl(&delimiters, &open, 1);
    add_next_index_stringl(&delimiters, &close, 1);
    zend_update_property(pt_ast_program_ce, object, ZEND_STRL("delimiters"), &delimiters);
    zval_ptr_dtor(&delimiters);
}

ZEND_METHOD(Polyspec_Template_AstProgram, parse)
{
    pt_method_parse(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_AstProgram, analyze)
{
    pt_method_analyze(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

/* AST-10: the decode of AstProgram is that of the class AstDecoder, as in the library. */
ZEND_METHOD(Polyspec_Template_AstProgram, decodeTemplate)
{
    zend_string *json;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(json)
    ZEND_PARSE_PARAMETERS_END();

    zend_string *class_name = zend_string_init(ZEND_STRL("Polyspec\\Template\\AstDecoder"), 0);
    zend_class_entry *decoder = zend_lookup_class(class_name);
    zend_string_release(class_name);
    zend_function *decode = decoder ? zend_hash_str_find_ptr(&decoder->function_table, "decode", sizeof("decode") - 1) : NULL;
    if (decode == NULL) {
        zend_throw_error(NULL, "The class Polyspec\\Template\\AstDecoder is not loaded");
        RETURN_THROWS();
    }
    zval argument;
    ZVAL_STR_COPY(&argument, json);
    zend_call_known_function(decode, NULL, decoder, return_value, 1, &argument, NULL);
    zval_ptr_dtor(&argument);
}

/* The callable that a table holds under a key, or null. */
static void pt_return_function(HashTable *table, zend_string *key, zval *return_value)
{
    zval *function = zend_hash_find(table, key);
    if (function == NULL) {
        RETURN_NULL();
    }
    RETURN_COPY(function);
}

/* hostFunction of AstProgram and RuntimeEnvironment: the function registered under a name, or null. */
static void pt_method_host_function(pt_runtime *runtime, INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *name;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(name)
    ZEND_PARSE_PARAMETERS_END();

    pt_return_function(&runtime->functions, name, return_value);
}

/* classFunction of AstProgram and RuntimeEnvironment: the function registered as Class::method, or null. */
static void pt_method_class_function(pt_runtime *runtime, INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *class_name, *method;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_STR(class_name)
        Z_PARAM_STR(method)
    ZEND_PARSE_PARAMETERS_END();

    zend_string *key = zend_strpprintf(0, "%s::%s", ZSTR_VAL(class_name), ZSTR_VAL(method));
    pt_return_function(&runtime->classes, key, return_value);
    zend_string_release(key);
}

/* The limits as the array of RT-33. */
static void pt_return_limits(pt_limits limits, zval *return_value)
{
    array_init_size(return_value, 4);
    add_assoc_long_ex(return_value, "iterations", sizeof("iterations") - 1, limits.iterations);
    add_assoc_long_ex(return_value, "depth", sizeof("depth") - 1, limits.depth);
    add_assoc_long_ex(return_value, "outputBytes", sizeof("outputBytes") - 1, limits.output_bytes);
    add_assoc_long_ex(return_value, "expressionDepth", sizeof("expressionDepth") - 1, limits.expression_depth);
}

/* AstProgram delegates its runtime methods to the RuntimeEnvironment it holds (RT-33, FUN-43). */
ZEND_METHOD(Polyspec_Template_AstProgram, register)
{
    pt_method_register(pt_engine_runtime(pt_engine_of(Z_OBJ_P(ZEND_THIS))), INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_AstProgram, registerClass)
{
    pt_method_register_class(pt_engine_runtime(pt_engine_of(Z_OBJ_P(ZEND_THIS))), INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_AstProgram, hostFunction)
{
    pt_method_host_function(pt_engine_runtime(pt_engine_of(Z_OBJ_P(ZEND_THIS))), INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_AstProgram, classFunction)
{
    pt_method_class_function(pt_engine_runtime(pt_engine_of(Z_OBJ_P(ZEND_THIS))), INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_AstProgram, limits)
{
    ZEND_PARSE_PARAMETERS_NONE();
    pt_return_limits(pt_engine_runtime(pt_engine_of(Z_OBJ_P(ZEND_THIS)))->limits, return_value);
}

/* ----------------------------------------------------------------------------------------------- */
/* RuntimeEnvironment (RT-33, FUN-43, FUN-44)                                                       */
/* ----------------------------------------------------------------------------------------------- */

ZEND_METHOD(Polyspec_Template_Render_RuntimeEnvironment, __construct)
{
    HashTable *limits = NULL, *functions = NULL;
    ZEND_PARSE_PARAMETERS_START(0, 2)
        Z_PARAM_OPTIONAL
        Z_PARAM_ARRAY_HT(limits)
        Z_PARAM_ARRAY_HT(functions)
    ZEND_PARSE_PARAMETERS_END();

    pt_runtime *runtime = pt_runtime_of(Z_OBJ_P(ZEND_THIS));
    pt_limits applied = pt_default_limits;
    if (limits != NULL && !pt_apply_limits(limits, &applied)) {
        RETURN_THROWS();
    }
    runtime->limits = applied;
    if (functions == NULL) {
        return;
    }
    zend_ulong index;
    zend_string *key;
    zval *callable;
    ZEND_HASH_FOREACH_KEY_VAL(functions, index, key, callable) {
        if (!zend_is_callable(callable, 0, NULL)) {
            zend_type_error("Polyspec\\Template\\Render\\RuntimeEnvironment::register(): Argument #2 ($function) must be of type callable, %s given", zend_zval_value_name(callable));
            RETURN_THROWS();
        }
        zend_string *name = key ? zend_string_copy(key) : zend_long_to_str((zend_long)index);
        bool registered = pt_register_function(runtime, name, callable);
        zend_string_release(name);
        if (!registered) {
            RETURN_THROWS();
        }
    } ZEND_HASH_FOREACH_END();
}

ZEND_METHOD(Polyspec_Template_Render_RuntimeEnvironment, register)
{
    pt_method_register(pt_runtime_of(Z_OBJ_P(ZEND_THIS)), INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_RuntimeEnvironment, limits)
{
    ZEND_PARSE_PARAMETERS_NONE();
    pt_return_limits(pt_runtime_of(Z_OBJ_P(ZEND_THIS))->limits, return_value);
}

ZEND_METHOD(Polyspec_Template_Render_RuntimeEnvironment, hostFunction)
{
    pt_method_host_function(pt_runtime_of(Z_OBJ_P(ZEND_THIS)), INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_RuntimeEnvironment, registerClass)
{
    pt_method_register_class(pt_runtime_of(Z_OBJ_P(ZEND_THIS)), INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_RuntimeEnvironment, classFunction)
{
    pt_method_class_function(pt_runtime_of(Z_OBJ_P(ZEND_THIS)), INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

/* ----------------------------------------------------------------------------------------------- */
/* Render state: Frame, Scope and Context of the library (pt_render_state.c)                       */
/* ----------------------------------------------------------------------------------------------- */

ZEND_METHOD(Polyspec_Template_Render_Frame, __construct)
{
    pt_frame_construct(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_Scope, __construct)
{
    pt_scope_construct(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_Scope, lookup)
{
    pt_scope_lookup(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_Scope, loopMeta)
{
    pt_scope_loop_meta(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_Context, __construct)
{
    pt_context_construct(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_Context, write)
{
    pt_context_write(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_Context, output)
{
    pt_context_output(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_Context, at)
{
    pt_context_at(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_Context, fail)
{
    pt_context_fail(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_Context, enter)
{
    pt_context_enter(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_Context, leave)
{
    pt_context_leave(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, __construct)
{
    pt_bindings_construct(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, truthy)
{
    pt_bindings_truthy(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, unary)
{
    pt_bindings_unary(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, binary)
{
    pt_bindings_binary(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, stringify)
{
    pt_bindings_stringify(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, escape)
{
    pt_bindings_escape(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, number)
{
    pt_bindings_number(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, finite)
{
    pt_bindings_finite(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, equal)
{
    pt_bindings_equal(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, compare)
{
    pt_bindings_compare(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, member)
{
    pt_bindings_member(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, memberCall)
{
    pt_bindings_member_call(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, classCall)
{
    pt_bindings_class_call(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, index)
{
    pt_bindings_index(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, depth)
{
    pt_bindings_depth(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, entries)
{
    pt_bindings_entries(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, listSpread)
{
    pt_bindings_list_spread(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, mapSpread)
{
    pt_bindings_map_spread(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, call)
{
    pt_bindings_call(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, limit)
{
    pt_bindings_limit(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, error)
{
    pt_bindings_error(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

/* A prepared execution (RT-61): the program, the bound assign, the options and the entry template, which stays loaded
 * beyond the run that loaded it. */
typedef struct pt_execution {
    zval program, assign, options;
    zend_string *name;
    pt_template *root;
    zend_object std;
} pt_execution;

static zend_object_handlers pt_execution_handlers;

static inline pt_execution *pt_execution_of(zend_object *object)
{
    return (pt_execution *)((char *)object - XtOffsetOf(pt_execution, std));
}

static zend_object *pt_execution_create(zend_class_entry *class_type)
{
    pt_execution *execution = zend_object_alloc(sizeof(pt_execution), class_type);
    zend_object_std_init(&execution->std, class_type);
    object_properties_init(&execution->std, class_type);
    execution->std.handlers = &pt_execution_handlers;
    ZVAL_UNDEF(&execution->program);
    ZVAL_UNDEF(&execution->assign);
    ZVAL_UNDEF(&execution->options);
    execution->name = NULL;
    execution->root = NULL;
    return &execution->std;
}

static void pt_execution_free(zend_object *object)
{
    pt_execution *execution = pt_execution_of(object);
    zval_ptr_dtor(&execution->program);
    zval_ptr_dtor(&execution->assign);
    zval_ptr_dtor(&execution->options);
    if (execution->name) {
        zend_string_release(execution->name);
    }
    pt_template_release(execution->root);
    zend_object_std_dtor(object);
}

static HashTable *pt_execution_get_gc(zend_object *object, zval **table, int *count)
{
    pt_execution *execution = pt_execution_of(object);
    zend_get_gc_buffer *buffer = zend_get_gc_buffer_create();
    zend_get_gc_buffer_add_zval(buffer, &execution->program);
    zend_get_gc_buffer_add_zval(buffer, &execution->assign);
    zend_get_gc_buffer_add_zval(buffer, &execution->options);
    zend_get_gc_buffer_use(buffer, table, count);
    return zend_std_get_properties(object);
}

ZEND_METHOD(Polyspec_Template_AstPreparedExecution, render)
{
    ZEND_PARSE_PARAMETERS_NONE();
    pt_execution *execution = pt_execution_of(Z_OBJ_P(ZEND_THIS));
    smart_str output = {0};
    pt_php_input input = {pt_engine_of(Z_OBJ(execution->program)), execution->name, &execution->assign, Z_ARRVAL(execution->options), &output, execution->root};
    pt_return_output(pt_render_php_into, &input, &output, return_value);
}

/* The options of a prepared render with the time of the preparation as the default now (RT-25). */
static void pt_prepared_options(HashTable *options, zval *result)
{
    if (options != NULL) {
        ZVAL_ARR(result, zend_array_dup(options));
    } else {
        array_init(result);
    }
    zval *env = zend_hash_str_find_deref(Z_ARRVAL_P(result), "env", 3);
    zval fresh;
    if (env == NULL || Z_TYPE_P(env) == IS_NULL) {
        array_init(&fresh);
    } else if (Z_TYPE_P(env) == IS_ARRAY) {
        ZVAL_ARR(&fresh, zend_array_dup(Z_ARRVAL_P(env)));
    } else {
        return;
    }
    zval *now = zend_hash_str_find_deref(Z_ARRVAL(fresh), "now", 3);
    if (now == NULL || Z_TYPE_P(now) == IS_NULL) {
        add_assoc_double_ex(&fresh, "now", 3, (double)time(NULL));
    }
    zend_hash_str_update(Z_ARRVAL_P(result), "env", 3, &fresh);
}

typedef struct pt_prepare_input {
    pt_engine *engine;
    zend_string *name;
    zval *assign;
    HashTable *options;
    zval *ast; /* the parsed template of an array target, or NULL */
    pt_template *root;
} pt_prepare_input;

static void pt_prepare_into_run(pt_run *run, void *context)
{
    pt_prepare_input *input = context;
    pt_request request;
    memset(&request, 0, sizeof(request));
    request.name = pt_strdup(&run->arena, ZSTR_VAL(input->name), ZSTR_LEN(input->name));
    pt_bind_error error = {NULL, NULL};
    if (!pt_bind_map(&run->arena, input->assign, &request.data, &error)) {
        pt_bind_fail_run(run, request.name, &error);
    }
    zval *define = zend_hash_str_find(input->options, "define", 6);
    if (define != NULL) {
        request.defines = pt_defines_from_php(run, request.name, define);
    }
    pt_env_from_php(run, request.name, zend_hash_str_find(input->options, "env", 3), &request.env);
    input->root = pt_prepare_root(run, input->engine, &request, input->ast);
}

/* The assign of a prepared render bound once to a bound map (RT-61); a bind failure throws the error, located at `name`,
 * and returns false. */
static bool pt_bind_assign_once(zend_string *name, zval *assign, zval *result)
{
    zend_object *bound_object = pt_bound_create(pt_bound_ce);
    pt_bound *bound = pt_bound_from(bound_object);
    pt_bind_error error = {NULL, NULL};
    if (!pt_bind_map(&bound->arena, assign, &bound->map, &error)) {
        OBJ_RELEASE(bound_object);
        zval exception;
        ZVAL_OBJ(&exception, pt_error_object(error.code, name, 0, 0, 0, 0, error.message));
        zend_string_release(error.message);
        zend_throw_exception_object(&exception);
        return false;
    }
    ZVAL_OBJ(result, bound_object);
    return true;
}

/* Prepares a render of the program in `program`; the assign is bound once to a bound map, and the entry template is
 * loaded now. */
static void pt_prepare_into(zval *program, HashTable *target_array, zend_string *target_name, zval *assign, HashTable *options, zval *return_value)
{
    zend_string *name = target_name;
    zval tree;
    if (target_array != NULL) {
        ZVAL_ARR(&tree, target_array);
        zval *named = zend_hash_str_find_deref(target_array, "name", 4);
        name = named != NULL ? zval_get_string(named) : ZSTR_EMPTY_ALLOC();
    } else {
        ZVAL_UNDEF(&tree);
    }
    pt_engine *engine = pt_engine_of(Z_OBJ_P(program));
    zval nothing;
    ZVAL_NULL(&nothing);
    zval bound_value;
    if (!pt_bind_assign_once(name, assign != NULL ? assign : &nothing, &bound_value)) {
        if (target_array != NULL) {
            zend_string_release(name);
        }
        RETURN_THROWS();
    }
    zval prepared_options;
    pt_prepared_options(options, &prepared_options);
    pt_prepare_input input = {engine, name, &bound_value, Z_ARRVAL(prepared_options), target_array != NULL ? &tree : NULL, NULL};
    bool prepared = pt_run_work(pt_prepare_into_run, &input);
    if (!prepared) {
        zval_ptr_dtor(&bound_value);
        zval_ptr_dtor(&prepared_options);
        if (target_array != NULL) {
            zend_string_release(name);
        }
        RETURN_THROWS();
    }
    zval execution_value;
    object_init_ex(&execution_value, pt_ast_execution_ce);
    pt_execution *execution = pt_execution_of(Z_OBJ(execution_value));
    ZVAL_COPY(&execution->program, program);
    ZVAL_COPY_VALUE(&execution->assign, &bound_value);
    ZVAL_COPY_VALUE(&execution->options, &prepared_options);
    execution->name = zend_string_copy(name);
    execution->root = input.root;
    object_init_ex(return_value, pt_prepared_render_ce);
    zend_update_property_str(pt_prepared_render_ce, Z_OBJ_P(return_value), ZEND_STRL("name"), name);
    zend_update_property(pt_prepared_render_ce, Z_OBJ_P(return_value), ZEND_STRL("execution"), &execution_value);
    zval_ptr_dtor(&execution_value);
    if (target_array != NULL) {
        zend_string_release(name);
    }
}

/* The definitions of a registry as the options of a prepared render: an entry whose data is null has no data key (RT-24). */
static HashTable *pt_registry_defines(HashTable *registry)
{
    HashTable *defines = zend_array_dup(registry);
    zval *entry;
    ZEND_HASH_FOREACH_VAL(defines, entry) {
        ZVAL_DEREF(entry);
        zval *data = Z_TYPE_P(entry) == IS_ARRAY ? zend_hash_str_find_deref(Z_ARRVAL_P(entry), "data", 4) : NULL;
        if (data != NULL && Z_TYPE_P(data) == IS_NULL) {
            zval plain;
            ZVAL_ARR(&plain, zend_array_dup(Z_ARRVAL_P(entry)));
            zend_hash_str_del(Z_ARRVAL(plain), "data", 4);
            zval_ptr_dtor(entry);
            ZVAL_COPY_VALUE(entry, &plain);
        }
    } ZEND_HASH_FOREACH_END();
    return defines;
}

typedef struct pt_construct_input {
    pt_prepare_input prepare;
    zval *lines; /* the line index of the template as a list, or NULL */
} pt_construct_input;

/* The work of the constructor: the entry template is the AST of the template, checked as a prepare checks it, and it takes
 * the line index of the template. */
static void pt_construct_into_run(pt_run *run, void *context)
{
    pt_construct_input *input = context;
    pt_prepare_into_run(run, &input->prepare);
    zval *lines = input->lines;
    if (lines == NULL || Z_TYPE_P(lines) != IS_ARRAY || zend_hash_num_elements(Z_ARRVAL_P(lines)) == 0) {
        return;
    }
    pt_template *template = input->prepare.root;
    pt_s name = {ZSTR_VAL(input->prepare.name), ZSTR_LEN(input->prepare.name)};
    /* A bad line index leaves the template to the run to release. */
    run->parsing = template;
    template->lines.count = zend_hash_num_elements(Z_ARRVAL_P(lines));
    template->lines.starts = pt_alloc(&template->arena, sizeof(size_t) * template->lines.count);
    size_t i = 0;
    zval *value;
    ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(lines), value) {
        ZVAL_DEREF(value);
        if (Z_TYPE_P(value) != IS_LONG || Z_LVAL_P(value) < 0) {
            pt_request_fail(run, name, PT_E_DATA_UNSUPPORTED_TYPE, zend_string_init(ZEND_STRL("lines holds an entry that is not a byte offset"), 0));
        }
        template->lines.starts[i++] = (size_t)Z_LVAL_P(value);
    } ZEND_HASH_FOREACH_END();
    run->parsing = NULL;
}

/* AstPreparedExecution::__construct(AstProgram $engine, MapValue $rootData, array $registry, array $env, string $targetName,
 * array $template) (RT-61): the state that prepare gives a prepared execution, from the arguments. */
ZEND_METHOD(Polyspec_Template_AstPreparedExecution, __construct)
{
    zval *engine, *root_data, *registry, *env, *template;
    zend_string *target_name;
    ZEND_PARSE_PARAMETERS_START(6, 6)
        Z_PARAM_OBJECT_OF_CLASS(engine, pt_ast_program_ce)
        Z_PARAM_OBJECT_OF_CLASS(root_data, pt_map_value_ce)
        Z_PARAM_ARRAY(registry)
        Z_PARAM_ARRAY(env)
        Z_PARAM_STR(target_name)
        Z_PARAM_ARRAY(template)
    ZEND_PARSE_PARAMETERS_END();

    pt_execution *execution = pt_execution_of(Z_OBJ_P(ZEND_THIS));
    if (execution->name != NULL) {
        zend_throw_error(NULL, "the prepared execution is constructed already");
        RETURN_THROWS();
    }
    zval *ast = zend_hash_str_find_deref(Z_ARRVAL_P(template), "ast", 3);
    if (ast == NULL || Z_TYPE_P(ast) != IS_ARRAY) {
        pt_throw_bare(PT_E_DATA_UNSUPPORTED_TYPE, zend_string_init("the template has no AST array", 29, 0));
        RETURN_THROWS();
    }
    zval *lines = zend_hash_str_find_deref(Z_ARRVAL_P(template), "lines", 5);

    zval options;
    array_init(&options);
    zval defines;
    ZVAL_ARR(&defines, pt_registry_defines(Z_ARRVAL_P(registry)));
    add_assoc_zval_ex(&options, "define", 6, &defines);
    zval env_value;
    ZVAL_COPY(&env_value, env);
    add_assoc_zval_ex(&options, "env", 3, &env_value);

    zval bound_value;
    if (!pt_bind_assign_once(target_name, root_data, &bound_value)) {
        zval_ptr_dtor(&options);
        RETURN_THROWS();
    }
    pt_construct_input input = {{pt_engine_of(Z_OBJ_P(engine)), target_name, &bound_value, Z_ARRVAL(options), ast, NULL}, lines};
    if (!pt_run_work(pt_construct_into_run, &input)) {
        zval_ptr_dtor(&bound_value);
        zval_ptr_dtor(&options);
        RETURN_THROWS();
    }
    ZVAL_COPY(&execution->program, engine);
    ZVAL_COPY_VALUE(&execution->assign, &bound_value);
    ZVAL_COPY_VALUE(&execution->options, &options);
    execution->name = zend_string_copy(target_name);
    execution->root = input.prepare.root;
}

ZEND_METHOD(Polyspec_Template_AstProgram, prepare)
{
    HashTable *target_array;
    zend_string *target_name;
    zval *assign = NULL;
    HashTable *options = NULL;
    ZEND_PARSE_PARAMETERS_START(1, 3)
        Z_PARAM_ARRAY_HT_OR_STR(target_array, target_name)
        Z_PARAM_OPTIONAL
        Z_PARAM_ZVAL(assign)
        Z_PARAM_ARRAY_HT(options)
    ZEND_PARSE_PARAMETERS_END();

    pt_prepare_into(ZEND_THIS, target_array, target_name, assign, options, return_value);
}

ZEND_METHOD(Polyspec_Template_AstProgram, render)
{
    HashTable *target_array;
    zend_string *target_name;
    zval *assign = NULL;
    HashTable *options = NULL;
    ZEND_PARSE_PARAMETERS_START(1, 3)
        Z_PARAM_ARRAY_HT_OR_STR(target_array, target_name)
        Z_PARAM_OPTIONAL
        Z_PARAM_ZVAL(assign)
        Z_PARAM_ARRAY_HT(options)
    ZEND_PARSE_PARAMETERS_END();

    zval prepared;
    pt_prepare_into(ZEND_THIS, target_array, target_name, assign, options, &prepared);
    if (EG(exception)) {
        RETURN_THROWS();
    }
    zend_function *render = zend_hash_str_find_ptr(&pt_prepared_render_ce->function_table, ZEND_STRL("render"));
    zend_call_known_instance_method_with_0_params(render, Z_OBJ(prepared), return_value);
    zval_ptr_dtor(&prepared);
}

/* ----------------------------------------------------------------------------------------------- */
/* Loading (RT-9, RT-40): AstProgram::loadTemplate                                                  */
/* ----------------------------------------------------------------------------------------------- */

static zend_class_entry *pt_frame_class;

typedef struct pt_load_input {
    pt_engine *engine;
    zend_string *name;
    bool located;
    zval *frame_name, *frame_lines;
    zend_long start, end;
    zval *result;
} pt_load_input;

/* The integer of a value, dereferenced; false when the value is not an int. */
static bool pt_long_of(zval *value, zend_long *result)
{
    ZVAL_DEREF(value);
    if (Z_TYPE_P(value) != IS_LONG) {
        return false;
    }
    *result = Z_LVAL_P(value);
    return true;
}

/* The line index of a frame, read into the arena of the run; NULL when the frame has no lines. */
static const pt_lines *pt_frame_lines_into(pt_run *run, zval *lines)
{
    if (Z_TYPE_P(lines) != IS_ARRAY || zend_hash_num_elements(Z_ARRVAL_P(lines)) == 0) {
        return NULL;
    }
    pt_lines *line_index = pt_alloc(&run->arena, sizeof(pt_lines));
    line_index->count = zend_hash_num_elements(Z_ARRVAL_P(lines));
    line_index->starts = pt_alloc(&run->arena, sizeof(size_t) * line_index->count);
    size_t i = 0;
    zval *value;
    ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(lines), value) {
        zend_long start = 0;
        pt_long_of(value, &start);
        line_index->starts[i++] = (size_t)start;
    } ZEND_HASH_FOREACH_END();
    return line_index;
}

/* The work of AstProgram::loadTemplate: loads the template, then builds ['ast' => ..., 'lines' => ...] (RT-40). */
static void pt_load_into(pt_run *run, void *context)
{
    pt_load_input *input = context;
    pt_s name = {ZSTR_VAL(input->name), ZSTR_LEN(input->name)};
    pt_s frame_name = {NULL, 0};
    const pt_lines *frame_lines = NULL;
    if (input->located) {
        frame_name = (pt_s){Z_STRVAL_P(input->frame_name), Z_STRLEN_P(input->frame_name)};
        frame_lines = pt_frame_lines_into(run, input->frame_lines);
    }
    pt_template *template = pt_load_named(run, input->engine, name, input->located, frame_name, frame_lines, (size_t)input->start, (size_t)input->end);
    zval ast, lines;
    if (Z_TYPE(template->ast) != IS_UNDEF) {
        /* A loader that gives an AST: the array of the loader is returned as it is, with no line index. */
        ZVAL_COPY(&ast, &template->ast);
        ZVAL_NULL(&lines);
    } else {
        pt_ast_to_zval(template, &ast);
        const pt_lines *line_index = pt_template_lines(template);
        array_init_size(&lines, line_index != NULL ? line_index->count : 0);
        for (size_t i = 0; line_index != NULL && i < line_index->count; i++) {
            add_next_index_long(&lines, (zend_long)line_index->starts[i]);
        }
    }
    array_init_size(input->result, 2);
    add_assoc_zval_ex(input->result, "ast", 3, &ast);
    add_assoc_zval_ex(input->result, "lines", 5, &lines);
}

/* AstProgram::loadTemplate(string $name, ?Frame $from, ?array $span): array (RT-9, RT-40). */
ZEND_METHOD(Polyspec_Template_AstProgram, loadTemplate)
{
    zend_string *name;
    zval *from = NULL;
    HashTable *span = NULL;
    ZEND_PARSE_PARAMETERS_START(3, 3)
        Z_PARAM_STR(name)
        Z_PARAM_OBJECT_OF_CLASS_OR_NULL(from, pt_frame_class)
        Z_PARAM_ARRAY_HT_OR_NULL(span)
    ZEND_PARSE_PARAMETERS_END();

    /* The failure is located at the frame and the span when both are given (RT-9); a span that is not two offsets fails
     * as Context::fail does. */
    zend_long start = 0, end = 0;
    zval rv;
    zval *frame_name = NULL, *frame_lines = NULL;
    bool located = from != NULL && span != NULL;
    if (located) {
        zval *first = zend_hash_index_find(span, 0);
        zval *last = zend_hash_index_find(span, 1);
        if (first == NULL || last == NULL || !pt_long_of(first, &start) || !pt_long_of(last, &end)) {
            zend_throw_error(NULL, "a span holds the start and the end byte offset");
            RETURN_THROWS();
        }
        frame_name = zend_read_property(pt_frame_class, Z_OBJ_P(from), ZEND_STRL("name"), 1, &rv);
        frame_lines = zend_read_property(pt_frame_class, Z_OBJ_P(from), ZEND_STRL("lines"), 1, &rv);
        ZVAL_DEREF(frame_lines);
        if (Z_TYPE_P(frame_lines) == IS_ARRAY) {
            zval *value;
            ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(frame_lines), value) {
                zend_long line;
                if (!pt_long_of(value, &line)) {
                    zend_throw_error(NULL, "a frame holds its line starts as integers");
                    RETURN_THROWS();
                }
            } ZEND_HASH_FOREACH_END();
        }
    }

    pt_load_input input = {0};
    input.engine = pt_engine_of(Z_OBJ_P(ZEND_THIS));
    input.name = name;
    input.located = located;
    input.frame_name = frame_name;
    input.frame_lines = frame_lines;
    input.start = start;
    input.end = end;
    input.result = return_value;
    if (!pt_run_work(pt_load_into, &input)) {
        RETURN_THROWS();
    }
}

/* ----------------------------------------------------------------------------------------------- */
/* Module                                                                                           */
/* ----------------------------------------------------------------------------------------------- */

static PHP_MINIT_FUNCTION(polyspec_template)
{
    pt_error_ce = register_class_Polyspec_Template_TemplateError(spl_ce_RuntimeException);
    pt_source_ce = register_class_Polyspec_Template_Source();
    register_class_Polyspec_Template_Utf8();
    register_class_Polyspec_Template_Escape();
    register_class_Polyspec_Template_InternalBoundary();
    register_class_Polyspec_Template_Loader_Path();
    pt_safe_string_ce = register_class_Polyspec_Template_Value_SafeString();
    pt_bind_error_ce = register_class_Polyspec_Template_Value_BindError(spl_ce_RuntimeException);
    pt_ast_decode_error_ce = register_class_Polyspec_Template_AstDecodeError(spl_ce_InvalidArgumentException);
    pt_function_error_ce = register_class_Polyspec_Template_Functions_FunctionError(spl_ce_RuntimeException);
    zend_class_entry *function_group = register_class_Polyspec_Template_Functions_FunctionGroup();
    register_class_Polyspec_Template_Functions_Helpers();
    pt_groups_register(register_class_Polyspec_Template_Functions_Strings(function_group),
        register_class_Polyspec_Template_Functions_Numbers(function_group),
        register_class_Polyspec_Template_Functions_Encoding(function_group),
        register_class_Polyspec_Template_Functions_Collection(function_group),
        register_class_Polyspec_Template_Functions_Dates(function_group));
    register_class_Polyspec_Template_Functions_Registry();
    register_class_Polyspec_Template_ErrorCode();
    pt_map_value_ce = register_class_Polyspec_Template_Value_MapValue();
    register_class_Polyspec_Template_Value_Bind();
    register_class_Polyspec_Template_Value_Json();
    register_class_Polyspec_Template_Value_Value();
    register_class_Polyspec_Template_Value_Number();
    register_class_Polyspec_Template_Value_HostArgument();

    /* The runtime services come first: AstProgram and RuntimeEnvironment implement the interface. */
    zend_class_entry *runtime_services = register_class_Polyspec_Template_Render_RuntimeServices();
    pt_runtime_ce = register_class_Polyspec_Template_Render_RuntimeEnvironment(runtime_services);
    pt_runtime_ce->create_object = pt_runtime_create;
    memcpy(&pt_runtime_handlers, zend_get_std_object_handlers(), sizeof(zend_object_handlers));
    pt_runtime_handlers.offset = XtOffsetOf(pt_runtime_object, std);
    pt_runtime_handlers.free_obj = pt_runtime_free;
    pt_runtime_handlers.clone_obj = NULL;
    pt_runtime_handlers.get_gc = pt_runtime_get_gc;
    pt_declare_default_limits(pt_runtime_ce);

    zend_class_entry *frame = register_class_Polyspec_Template_Render_Frame();
    zend_class_entry *scope = register_class_Polyspec_Template_Render_Scope();
    zend_class_entry *context = register_class_Polyspec_Template_Render_Context();
    pt_frame_class = frame;
    pt_render_state_register(runtime_services, frame, scope, context);
    pt_bindings_register(register_class_Polyspec_Template_Render_RuntimeBindings());

    memcpy(&pt_engine_handlers, zend_get_std_object_handlers(), sizeof(zend_object_handlers));
    pt_engine_handlers.offset = XtOffsetOf(pt_engine_object, std);
    pt_engine_handlers.free_obj = pt_engine_free;
    pt_engine_handlers.clone_obj = NULL;
    pt_engine_handlers.get_gc = pt_engine_get_gc;

    pt_bound_ce = register_class_Polyspec_Template_BoundMap();
    pt_bound_ce->create_object = pt_bound_create;
    memcpy(&pt_bound_handlers, zend_get_std_object_handlers(), sizeof(zend_object_handlers));
    pt_bound_handlers.offset = XtOffsetOf(pt_bound, std);
    pt_bound_handlers.free_obj = pt_bound_free;
    pt_bound_handlers.clone_obj = NULL;

    zend_class_entry *program = register_class_Polyspec_Template_Program();
    pt_prepared_render_ce = register_class_Polyspec_Template_PreparedRender();
    pt_program_ce = program;
    pt_program_engine_ce = register_class_Polyspec_Template_Engine(program);
    zend_class_entry *execution = register_class_Polyspec_Template_PreparedExecution();
    pt_ast_execution_ce = register_class_Polyspec_Template_AstPreparedExecution(execution);
    pt_ast_execution_ce->create_object = pt_execution_create;
    memcpy(&pt_execution_handlers, zend_get_std_object_handlers(), sizeof(zend_object_handlers));
    pt_execution_handlers.offset = XtOffsetOf(pt_execution, std);
    pt_execution_handlers.free_obj = pt_execution_free;
    pt_execution_handlers.clone_obj = NULL;
    pt_execution_handlers.get_gc = pt_execution_get_gc;
    pt_ast_program_ce = register_class_Polyspec_Template_AstProgram(program, runtime_services);
    pt_ast_program_ce->create_object = pt_engine_create;

    zend_class_entry *loader_interface = register_class_Polyspec_Template_Loader_LoaderInterface();
    pt_loader_interface_ce = loader_interface;
    pt_array_loader_ce = register_class_Polyspec_Template_Loader_ArrayLoader(loader_interface);
    pt_filesystem_loader_ce = register_class_Polyspec_Template_Loader_FilesystemLoader(loader_interface);
    return SUCCESS;
}

static PHP_RINIT_FUNCTION(polyspec_template)
{
#if defined(COMPILE_DL_POLYSPEC_TEMPLATE) && defined(ZTS)
    ZEND_TSRMLS_CACHE_UPDATE();
#endif
    return SUCCESS;
}

static PHP_MINFO_FUNCTION(polyspec_template)
{
    php_info_print_table_start();
    php_info_print_table_row(2, "polyspec_template support", "enabled");
    php_info_print_table_row(2, "Version", PHP_POLYSPEC_TEMPLATE_VERSION);
    php_info_print_table_end();
}

static const zend_module_dep polyspec_template_deps[] = {
    ZEND_MOD_REQUIRED("json")
    ZEND_MOD_REQUIRED("spl")
    ZEND_MOD_END
};

zend_module_entry polyspec_template_module_entry = {
    STANDARD_MODULE_HEADER_EX,
    NULL,
    polyspec_template_deps,
    "polyspec_template",
    NULL,
    PHP_MINIT(polyspec_template),
    NULL,
    PHP_RINIT(polyspec_template),
    NULL,
    PHP_MINFO(polyspec_template),
    PHP_POLYSPEC_TEMPLATE_VERSION,
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    STANDARD_MODULE_PROPERTIES_EX
};

#ifdef COMPILE_DL_POLYSPEC_TEMPLATE
#ifdef ZTS
ZEND_TSRMLS_CACHE_DEFINE()
#endif
ZEND_GET_MODULE(polyspec_template)
#endif
