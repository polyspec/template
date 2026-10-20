/*
 * The PHP classes of the extension: Polyspec\Template\TemplateError and
 * Polyspec\Template\Native\Engine (RT-1 to RT-6, ERR-1). Their signatures are in
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
static zend_class_entry *pt_bind_error_ce;
static zend_class_entry *pt_engine_ce;

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
static zend_object *pt_error_object(const char *code, zend_string *template, zend_long line, zend_long col, zend_long offset, zend_long end, zend_string *message)
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

/* The PHP value of a bound value: a map is a MapValue, a list a PHP list, a number a float (VAL-17). */
static void pt_library_value(pt_value value, zval *result)
{
    switch (value.type) {
        case PT_NULL: ZVAL_NULL(result); return;
        case PT_BOOL: ZVAL_BOOL(result, value.u.b); return;
        case PT_NUMBER: ZVAL_DOUBLE(result, value.u.number); return;
        case PT_STRING:
        case PT_SAFE: ZVAL_STRINGL(result, value.u.str.s, value.u.str.n); return;
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
static void pt_throw_bind_error(const char *code, zend_string *message)
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
static bool pt_zval_depth_within(zval *value, zend_long limit)
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
static void pt_error_position(HashTable *lines, zend_long offset, zend_long *line, zend_long *col)
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

static bool pt_option_limits(HashTable *options, pt_limits *limits)
{
    zval *value = options ? zend_hash_str_find_deref(options, "limits", sizeof("limits") - 1) : NULL;
    if (value == NULL || Z_TYPE_P(value) == IS_NULL) {
        return true;
    }
    if (Z_TYPE_P(value) != IS_ARRAY) {
        zend_throw_exception(spl_ce_InvalidArgumentException, "limits is not an array", 0);
        return false;
    }
    static const char *const names[] = {"iterations", "depth", "outputBytes", "expressionDepth"};
    zend_long *slots[] = {&limits->iterations, &limits->depth, &limits->output_bytes, &limits->expression_depth};
    for (int i = 0; i < 4; i++) {
        zval *limit = zend_hash_str_find_deref(Z_ARRVAL_P(value), names[i], strlen(names[i]));
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

/* ----------------------------------------------------------------------------------------------- */
/* Engine                                                                                           */
/* ----------------------------------------------------------------------------------------------- */

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
    engine->limits.iterations = 1000000;
    engine->limits.depth = 32;
    engine->limits.output_bytes = 16 * 1024 * 1024;
    engine->limits.expression_depth = 64;
    zend_hash_init(&engine->functions, 8, NULL, ZVAL_PTR_DTOR, 0);
    zend_hash_init(&engine->classes, 8, NULL, ZVAL_PTR_DTOR, 0);
    zend_hash_init(&engine->cache, 8, NULL, pt_cache_dtor, 0);
    zend_hash_init(&engine->files, 8, NULL, ZVAL_PTR_DTOR, 0);
    return &object->std;
}

static void pt_engine_free(zend_object *object)
{
    pt_engine *engine = pt_engine_of(object);
    zend_hash_destroy(&engine->functions);
    zend_hash_destroy(&engine->classes);
    zend_hash_destroy(&engine->cache);
    zend_hash_destroy(&engine->files);
    zval_ptr_dtor(&engine->loader);
    if (engine->root) {
        zend_string_release(engine->root);
    }
    zend_object_std_dtor(object);
}

/* The registered callables may hold the engine, so the collector sees them. */
static HashTable *pt_engine_get_gc(zend_object *object, zval **table, int *count)
{
    pt_engine *engine = pt_engine_of(object);
    zend_get_gc_buffer *buffer = zend_get_gc_buffer_create();
    zval *value;
    ZEND_HASH_FOREACH_VAL(&engine->functions, value) {
        zend_get_gc_buffer_add_zval(buffer, value);
    } ZEND_HASH_FOREACH_END();
    ZEND_HASH_FOREACH_VAL(&engine->classes, value) {
        zend_get_gc_buffer_add_zval(buffer, value);
    } ZEND_HASH_FOREACH_END();
    zend_get_gc_buffer_add_zval(buffer, &engine->loader);
    zend_get_gc_buffer_use(buffer, table, count);
    return zend_std_get_properties(object);
}

ZEND_METHOD(Polyspec_Template_Native_Engine, __construct)
{
    zend_string *root = NULL;
    HashTable *options = NULL;
    ZEND_PARSE_PARAMETERS_START(0, 2)
        Z_PARAM_OPTIONAL
        Z_PARAM_STR_OR_NULL(root)
        Z_PARAM_ARRAY_HT(options)
    ZEND_PARSE_PARAMETERS_END();

    pt_engine *engine = pt_engine_of(Z_OBJ_P(ZEND_THIS));
    char open, close;
    pt_limits limits = engine->limits;
    if (!pt_option_delimiters(options, &open, &close) || !pt_option_limits(options, &limits)) {
        RETURN_THROWS();
    }
    engine->open = open;
    engine->close = close;
    engine->limits = limits;
    if (engine->root) {
        zend_string_release(engine->root);
        engine->root = NULL;
    }
    if (root) {
        /* RT-10: the real path of the directory, or the path without trailing separators. */
        char real[MAXPATHLEN];
        if (VCWD_REALPATH(ZSTR_VAL(root), real)) {
            engine->root = zend_string_init(real, strlen(real), 0);
        } else {
            size_t length = ZSTR_LEN(root);
            while (length > 0 && ZSTR_VAL(root)[length - 1] == DEFAULT_SLASH) {
                length--;
            }
            engine->root = zend_string_init(ZSTR_VAL(root), length, 0);
        }
    }
    zend_hash_clean(&engine->cache);
    zend_hash_clean(&engine->files);
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

/* Engine::parse and AstProgram::parse: the template source into its AST. */
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

ZEND_METHOD(Polyspec_Template_Native_Engine, parse)
{
    pt_method_parse(INTERNAL_FUNCTION_PARAM_PASSTHRU);
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

/* Engine::analyze and AstProgram::analyze: the AST, tags and tokens of a template source. */
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

ZEND_METHOD(Polyspec_Template_Native_Engine, analyze)
{
    pt_method_analyze(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_Native_Engine, parseToJson)
{
    zend_string *source, *name;
    HashTable *options = NULL;
    ZEND_PARSE_PARAMETERS_START(2, 3)
        Z_PARAM_STR(source)
        Z_PARAM_STR(name)
        Z_PARAM_OPTIONAL
        Z_PARAM_ARRAY_HT(options)
    ZEND_PARSE_PARAMETERS_END();

    zval ast;
    ZVAL_UNDEF(&ast);
    if (!pt_parse_source(source, name, options, &ast)) {
        zval_ptr_dtor(&ast);
        RETURN_THROWS();
    }
    smart_str text = {0};
    zend_result encoded = php_json_encode_ex(&text, &ast, PHP_JSON_UNESCAPED_SLASHES | PHP_JSON_UNESCAPED_UNICODE, INT_MAX);
    zval_ptr_dtor(&ast);
    smart_str_0(&text);
    if (encoded == FAILURE || text.s == NULL) {
        smart_str_free(&text);
        zend_string *message = zend_string_init("cannot write the AST as JSON: a number literal is not finite", 61, 0);
        zend_object *object = pt_error_object(PT_E_INTERNAL, name, 0, 0, 0, 0, message);
        zend_string_release(message);
        zval exception;
        ZVAL_OBJ(&exception, object);
        zend_throw_exception_object(&exception);
        RETURN_THROWS();
    }
    RETURN_STR(text.s);
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

/* Adds one template definition: an HTML string, or a template path with optional data (RT-24). */
static void pt_define_add(pt_run *run, pt_s name, HashTable *defines, pt_s id, const pt_value *html, const pt_value *template, bool has_data, pt_map *data, bool data_is_map)
{
    pt_define *entry = pt_alloc(&run->arena, sizeof(pt_define));
    if (html != NULL) {
        entry->html = true;
        entry->template = html->u.str;
    } else if (template != NULL) {
        pt_s resolved = {NULL, 0};
        if (!pt_resolve_path(&run->arena, PT_S(""), template->u.str, &resolved)) {
            pt_request_fail(run, name, PT_E_DATA_UNSUPPORTED_TYPE, zend_strpprintf(0, "define %s: template path leaves the loader root", id.s));
        }
        if (has_data && !data_is_map) {
            pt_request_fail(run, name, PT_E_DATA_UNSUPPORTED_TYPE, zend_strpprintf(0, "define %s: data is not a map", id.s));
        }
        entry->template = resolved;
        entry->data = has_data ? data : NULL;
    } else {
        pt_request_fail(run, name, PT_E_DATA_UNSUPPORTED_TYPE, zend_strpprintf(0, "define %s: entry needs \"template\" or \"html\"", id.s));
    }
    zend_hash_str_update_ptr(defines, id.s, id.n, entry);
}

/* The definitions of JSON text: a map from id to a path or to a map with template, data or html. */
static HashTable *pt_defines_from_json(pt_run *run, pt_s name, pt_value value)
{
    if (value.type != PT_MAP) {
        pt_request_fail(run, name, PT_E_DATA_UNSUPPORTED_TYPE, zend_string_init("define is not an object", 23, 0));
    }
    HashTable *defines = pt_defines_new(run);
    const pt_map *map = value.u.map;
    for (uint32_t i = 0; i < map->used; i++) {
        if (!map->entries[i].live) {
            continue;
        }
        pt_s id = map->entries[i].key;
        pt_value input = map->entries[i].value;
        if (pt_is_string(input)) {
            pt_define_add(run, name, defines, id, NULL, &input, false, NULL, false);
            continue;
        }
        const pt_value *html = NULL, *template = NULL;
        pt_value *data = NULL;
        if (input.type == PT_MAP) {
            pt_value *found = pt_map_get(input.u.map, "html", 4);
            html = found && pt_is_string(*found) ? found : NULL;
            found = pt_map_get(input.u.map, "template", 8);
            template = found && pt_is_string(*found) ? found : NULL;
            data = pt_map_get(input.u.map, "data", 4);
        }
        pt_map *map_data = NULL;
        bool is_map = false;
        if (data != NULL) {
            if (data->type == PT_MAP) {
                map_data = data->u.map;
                is_map = true;
            } else if (data->type == PT_LIST && data->u.list->count == 0) {
                map_data = pt_map_new(&run->arena, 0);
                is_map = true;
            }
        }
        pt_define_add(run, name, defines, id, html, template, data != NULL, map_data, is_map);
    }
    return defines;
}

/* The environment (RT-25): timezone defaults to Z and now to the current time. */
static void pt_env_from_json(pt_run *run, pt_s name, const pt_value *value, pt_env *env)
{
    env->timezone = PT_S("Z");
    env->now = (double)time(NULL);
    if (value == NULL || value->type == PT_NULL || value->type == PT_LIST) {
        return;
    }
    if (value->type != PT_MAP) {
        pt_request_fail(run, name, PT_E_DATA_UNSUPPORTED_TYPE, zend_string_init("env is not an object", 20, 0));
    }
    pt_value *timezone = pt_map_get(value->u.map, "timezone", 8);
    if (timezone != NULL && timezone->type != PT_NULL) {
        if (!pt_is_string(*timezone)) {
            pt_request_fail(run, name, PT_E_DATA_UNSUPPORTED_TYPE, zend_string_init("env.timezone is not a string", 28, 0));
        }
        env->timezone = timezone->u.str;
    }
    pt_value *now = pt_map_get(value->u.map, "now", 3);
    if (now != NULL && now->type != PT_NULL) {
        if (now->type != PT_NUMBER) {
            pt_request_fail(run, name, PT_E_DATA_UNSUPPORTED_TYPE, zend_string_init("env.now is not a number", 23, 0));
        }
        env->now = now->u.number;
    }
}

static pt_value pt_read_json(pt_run *run, pt_s name, zend_string *text)
{
    pt_value value = {0};
    pt_bind_error error = {NULL, NULL};
    if (!pt_json_parse(&run->arena, ZSTR_VAL(text), ZSTR_LEN(text), &value, &error)) {
        pt_request_fail(run, name, error.code, error.message);
    }
    return value;
}

typedef struct pt_json_input {
    pt_engine *engine;
    zend_string *name, *assign, *define, *env;
    smart_str *output;
} pt_json_input;

static void pt_render_json_into(pt_run *run, void *context)
{
    pt_json_input *input = context;
    pt_engine *engine = input->engine;
    zend_string *name = input->name, *assign = input->assign, *define = input->define, *env = input->env;
    smart_str *output = input->output;
    pt_request request;
    memset(&request, 0, sizeof(request));
    request.name = pt_strdup(&run->arena, ZSTR_VAL(name), ZSTR_LEN(name));
    pt_value data = pt_read_json(run, request.name, assign);
    pt_value definitions = {0}, environment = {0};
    if (define) {
        definitions = pt_read_json(run, request.name, define);
    }
    if (env) {
        environment = pt_read_json(run, request.name, env);
    }
    if (data.type == PT_MAP) {
        request.data = data.u.map;
    } else if (data.type == PT_NULL || (data.type == PT_LIST && data.u.list->count == 0)) {
        request.data = pt_map_new(&run->arena, 0);
    } else {
        pt_request_fail(run, request.name, PT_E_DATA_UNSUPPORTED_TYPE, zend_string_init("assign is not a map", 19, 0));
    }
    if (define) {
        request.defines = pt_defines_from_json(run, request.name, definitions);
    }
    pt_env_from_json(run, request.name, env ? &environment : NULL, &request.env);
    pt_render(run, engine, &request, output);
}

ZEND_METHOD(Polyspec_Template_Native_Engine, renderJson)
{
    zend_string *name, *assign, *define = NULL, *env = NULL;
    ZEND_PARSE_PARAMETERS_START(2, 4)
        Z_PARAM_STR(name)
        Z_PARAM_STR(assign)
        Z_PARAM_OPTIONAL
        Z_PARAM_STR_OR_NULL(define)
        Z_PARAM_STR_OR_NULL(env)
    ZEND_PARSE_PARAMETERS_END();

    smart_str output = {0};
    pt_json_input input = {pt_engine_of(Z_OBJ_P(ZEND_THIS)), name, assign, define, env, &output};
    pt_return_output(pt_render_json_into, &input, &output, return_value);
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
static bool pt_register_function(pt_engine *engine, zend_string *name, zval *callable)
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
    zend_hash_update(&engine->functions, name, &function);
    return true;
}

/* Engine::register and AstProgram::register: a global function callable under a name. */
static void pt_method_register(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *name;
    zend_fcall_info fci;
    zend_fcall_info_cache fcc;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_STR(name)
        Z_PARAM_FUNC(fci, fcc)
    ZEND_PARSE_PARAMETERS_END();

    pt_register_function(pt_engine_of(Z_OBJ_P(ZEND_THIS)), name, &fci.function_name);
}

ZEND_METHOD(Polyspec_Template_Native_Engine, register)
{
    pt_method_register(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

/* Engine::registerClass and AstProgram::registerClass: a class method callable under Class::method. */
static void pt_method_register_class(INTERNAL_FUNCTION_PARAMETERS)
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
    zend_hash_update(&pt_engine_of(Z_OBJ_P(ZEND_THIS))->classes, key, &function);
    zend_string_release(key);
}

ZEND_METHOD(Polyspec_Template_Native_Engine, registerClass)
{
    pt_method_register_class(INTERNAL_FUNCTION_PARAM_PASSTHRU);
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

ZEND_METHOD(Polyspec_Template_Native_Engine, render)
{
    zend_string *name;
    zval *assign = NULL;
    HashTable *options = NULL;
    ZEND_PARSE_PARAMETERS_START(1, 3)
        Z_PARAM_STR(name)
        Z_PARAM_OPTIONAL
        Z_PARAM_ZVAL(assign)
        Z_PARAM_ARRAY_HT(options)
    ZEND_PARSE_PARAMETERS_END();

    smart_str output = {0};
    pt_php_input input = {pt_engine_of(Z_OBJ_P(ZEND_THIS)), name, assign, options, &output, NULL};
    pt_return_output(pt_render_php_into, &input, &output, return_value);
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
    zval *functions = options ? zend_hash_str_find_deref(options, "functions", sizeof("functions") - 1) : NULL;
    if (functions != NULL && Z_TYPE_P(functions) != IS_NULL && Z_TYPE_P(functions) != IS_ARRAY) {
        zend_argument_type_error(2, "must hold the functions as an array, %s given", zend_zval_value_name(functions));
        RETURN_THROWS();
    }
    if (functions != NULL && Z_TYPE_P(functions) == IS_ARRAY) {
        zend_ulong index;
        zend_string *key;
        zval *callable;
        ZEND_HASH_FOREACH_KEY_VAL(Z_ARRVAL_P(functions), index, key, callable) {
            if (!zend_is_callable(callable, 0, NULL)) {
                zend_argument_type_error(2, "must hold only callable functions");
                RETURN_THROWS();
            }
            zend_string *name = key ? zend_string_copy(key) : zend_long_to_str((zend_long)index);
            bool registered = pt_register_function(engine, name, callable);
            zend_string_release(name);
            if (!registered) {
                RETURN_THROWS();
            }
        } ZEND_HASH_FOREACH_END();
    }
    pt_limits limits = engine->limits;
    char open, close;
    if (!pt_option_limits(options, &limits) || !pt_option_delimiters(options, &open, &close)) {
        RETURN_THROWS();
    }
    engine->limits = limits;
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

ZEND_METHOD(Polyspec_Template_AstProgram, register)
{
    pt_method_register(INTERNAL_FUNCTION_PARAM_PASSTHRU);
}

ZEND_METHOD(Polyspec_Template_AstProgram, registerClass)
{
    pt_method_register_class(INTERNAL_FUNCTION_PARAM_PASSTHRU);
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

ZEND_METHOD(Polyspec_Template_AstProgram, hostFunction)
{
    zend_string *name;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(name)
    ZEND_PARSE_PARAMETERS_END();

    pt_return_function(&pt_engine_of(Z_OBJ_P(ZEND_THIS))->functions, name, return_value);
}

ZEND_METHOD(Polyspec_Template_AstProgram, classFunction)
{
    zend_string *class_name, *method;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_STR(class_name)
        Z_PARAM_STR(method)
    ZEND_PARSE_PARAMETERS_END();

    zend_string *key = zend_strpprintf(0, "%s::%s", ZSTR_VAL(class_name), ZSTR_VAL(method));
    pt_return_function(&pt_engine_of(Z_OBJ_P(ZEND_THIS))->classes, key, return_value);
    zend_string_release(key);
}

ZEND_METHOD(Polyspec_Template_AstProgram, limits)
{
    ZEND_PARSE_PARAMETERS_NONE();
    pt_limits limits = pt_engine_of(Z_OBJ_P(ZEND_THIS))->limits;
    array_init_size(return_value, 4);
    add_assoc_long_ex(return_value, "iterations", sizeof("iterations") - 1, limits.iterations);
    add_assoc_long_ex(return_value, "depth", sizeof("depth") - 1, limits.depth);
    add_assoc_long_ex(return_value, "outputBytes", sizeof("outputBytes") - 1, limits.output_bytes);
    add_assoc_long_ex(return_value, "expressionDepth", sizeof("expressionDepth") - 1, limits.expression_depth);
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
    zend_object *bound_object = pt_bound_create(pt_bound_ce);
    pt_bound *bound = pt_bound_from(bound_object);
    pt_bind_error error = {NULL, NULL};
    zval nothing;
    ZVAL_NULL(&nothing);
    if (!pt_bind_map(&bound->arena, assign != NULL ? assign : &nothing, &bound->map, &error)) {
        OBJ_RELEASE(bound_object);
        zval exception;
        ZVAL_OBJ(&exception, pt_error_object(error.code, name, 0, 0, 0, 0, error.message));
        zend_string_release(error.message);
        if (target_array != NULL) {
            zend_string_release(name);
        }
        zend_throw_exception_object(&exception);
        RETURN_THROWS();
    }
    zval prepared_options, bound_value;
    pt_prepared_options(options, &prepared_options);
    ZVAL_OBJ(&bound_value, bound_object);
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
/* Module                                                                                           */
/* ----------------------------------------------------------------------------------------------- */

static PHP_MINIT_FUNCTION(polyspec_template)
{
    pt_error_ce = register_class_Polyspec_Template_TemplateError(spl_ce_RuntimeException);
    pt_safe_string_ce = register_class_Polyspec_Template_Value_SafeString();
    pt_bind_error_ce = register_class_Polyspec_Template_Value_BindError(spl_ce_RuntimeException);
    pt_map_value_ce = register_class_Polyspec_Template_Value_MapValue();
    register_class_Polyspec_Template_Value_Bind();
    register_class_Polyspec_Template_Value_Json();

    pt_engine_ce = register_class_Polyspec_Template_Native_Engine();
    pt_engine_ce->create_object = pt_engine_create;
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
    pt_ast_program_ce = register_class_Polyspec_Template_AstProgram(program);
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
