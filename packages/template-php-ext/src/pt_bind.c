/*
 * Host binding of PHP values (VAL-2, VAL-11, VAL-14, VAL-17 to VAL-22) and the host form of template
 * values (VAL-21).
 */
#include "pt.h"
#include "ext/json/php_json.h"
#include "Zend/zend_closures.h"
#include "Zend/zend_exceptions.h"
#include "Zend/zend_interfaces.h"
#include <math.h>

zend_class_entry *pt_bound_ce;

static bool pt_bind_fail(pt_bind_error *error, const char *code, zend_string *message)
{
    error->code = code;
    error->message = message;
    return false;
}

static bool pt_check_level(int level, pt_bind_error *error)
{
    if (level > PT_MAX_DEPTH) {
        return pt_bind_fail(error, "E_DATA_DEPTH", zend_strpprintf(0, "lists and maps nest deeper than %d levels", PT_MAX_DEPTH));
    }
    return true;
}

static bool pt_bind_text(pt_arena *arena, const char *bytes, size_t length, pt_s *text, const char *message, pt_bind_error *error)
{
    if (pt_utf8_first_invalid(bytes, length) < length) {
        return pt_bind_fail(error, "E_DATA_INVALID_UTF8", zend_string_init(message, strlen(message), 0));
    }
    *text = pt_strdup(arena, bytes, length);
    return true;
}

pt_bound *pt_bound_of(zval *value)
{
    ZVAL_DEREF(value);
    if (Z_TYPE_P(value) == IS_OBJECT && pt_bound_ce != NULL && Z_OBJCE_P(value) == pt_bound_ce) {
        return pt_bound_from(Z_OBJ_P(value));
    }
    return NULL;
}

zend_string *pt_take_exception(zend_object **passthrough)
{
    zend_object *exception = EG(exception);
    GC_ADDREF(exception);
    zend_clear_exception();
    if (passthrough != NULL && instanceof_function(exception->ce, pt_error_ce)) {
        *passthrough = exception;
        return NULL;
    }
    zend_class_entry *base = instanceof_function(exception->ce, zend_ce_exception) ? zend_ce_exception : zend_ce_error;
    zval rv;
    zval *message = zend_read_property_ex(base, exception, ZSTR_KNOWN(ZEND_STR_MESSAGE), 1, &rv);
    zend_string *text = zval_get_string(message);
    OBJ_RELEASE(exception);
    return text;
}

static bool pt_bind_at(pt_arena *arena, zval *input, int level, pt_value *result, pt_bind_error *error);

/* Binds the entries of a table as a map; with `public_only` the table holds object properties and
 * the entries with mangled names are skipped. */
static bool pt_bind_entries(pt_arena *arena, HashTable *table, int level, bool public_only, pt_value *result, pt_bind_error *error)
{
    pt_map *map = pt_map_new(arena, zend_hash_num_elements(table));
    zend_ulong index;
    zend_string *key;
    zval *item;
    ZEND_HASH_FOREACH_KEY_VAL_IND(table, index, key, item) {
        pt_s name;
        if (key == NULL) {
            char digits[32];
            int written = snprintf(digits, sizeof(digits), ZEND_LONG_FMT, (zend_long)index);
            name = pt_strdup(arena, digits, (size_t)written);
        } else {
            if (public_only && ZSTR_LEN(key) > 0 && ZSTR_VAL(key)[0] == '\0') {
                continue;
            }
            if (!pt_bind_text(arena, ZSTR_VAL(key), ZSTR_LEN(key), &name, "a map key is not valid UTF-8", error)) {
                return false;
            }
        }
        pt_value value;
        if (!pt_bind_at(arena, item, level, &value, error)) {
            return false;
        }
        pt_map_set(map, name, value);
    } ZEND_HASH_FOREACH_END();
    *result = pt_map_value(map);
    return true;
}

static bool pt_bind_at(pt_arena *arena, zval *input, int level, pt_value *result, pt_bind_error *error)
{
    ZVAL_DEREF(input);
    switch (Z_TYPE_P(input)) {
        case IS_NULL:
            *result = pt_null();
            return true;
        case IS_FALSE:
        case IS_TRUE:
            *result = pt_bool(Z_TYPE_P(input) == IS_TRUE);
            return true;
        case IS_LONG: {
            zend_long number = Z_LVAL_P(input);
            if (number > 9007199254740991LL || number < -9007199254740991LL) {
                return pt_bind_fail(error, "E_DATA_NUMBER_RANGE", zend_strpprintf(0, "integer " ZEND_LONG_FMT " is outside the safe range", number));
            }
            *result = pt_number((double)number);
            return true;
        }
        case IS_DOUBLE: {
            double number = Z_DVAL_P(input);
            if (!isfinite(number)) {
                return pt_bind_fail(error, "E_DATA_NUMBER_NOT_FINITE", zend_string_init("number is not finite", 20, 0));
            }
            if (fabs(number) > PT_MAX_SAFE) {
                return pt_bind_fail(error, "E_DATA_NUMBER_RANGE", zend_strpprintf(0, "number %.17G is outside the safe range", number));
            }
            *result = pt_number(number);
            return true;
        }
        case IS_STRING: {
            pt_s text;
            if (!pt_bind_text(arena, Z_STRVAL_P(input), Z_STRLEN_P(input), &text, "string is not valid UTF-8", error)) {
                return false;
            }
            *result = pt_string(text);
            return true;
        }
        case IS_ARRAY: {
            HashTable *table = Z_ARRVAL_P(input);
            if (!pt_check_level(level + 1, error)) {
                return false;
            }
            if (zend_array_is_list(table)) {
                pt_list *list = pt_list_new(arena, zend_hash_num_elements(table));
                uint32_t i = 0;
                zval *item;
                ZEND_HASH_FOREACH_VAL(table, item) {
                    if (!pt_bind_at(arena, item, level + 1, &list->items[i++], error)) {
                        return false;
                    }
                } ZEND_HASH_FOREACH_END();
                *result = pt_list_value(list);
                return true;
            }
            return pt_bind_entries(arena, table, level + 1, false, result, error);
        }
        case IS_OBJECT: {
            zend_object *object = Z_OBJ_P(input);
            zend_class_entry *ce = object->ce;
            /* A bound map is accepted only as assign and as definition data, and a bound map of the PHP
             * implementation, another implementation, at no position (VAL-22). Both classes are final. */
            if ((pt_bound_ce != NULL && ce == pt_bound_ce) || zend_string_equals_literal(ce->name, "Polyspec\\Template\\BoundMap")) {
                return pt_bind_fail(error, "E_DATA_UNSUPPORTED_TYPE", zend_string_init("a bound map is accepted only as assign and as definition data", 61, 0));
            }
            if (instanceof_function(ce, php_json_serializable_ce)) {
                if (!pt_check_level(level + 1, error)) {
                    return false;
                }
                zval serialized;
                zend_call_method_with_0_params(object, ce, NULL, "jsonserialize", &serialized);
                if (EG(exception)) {
                    zend_string *message = pt_take_exception(NULL);
                    zval_ptr_dtor(&serialized);
                    pt_bind_fail(error, "E_RUNTIME_HOST_FUNCTION", zend_strpprintf(0, "jsonSerialize() failed: %s", ZSTR_VAL(message)));
                    zend_string_release(message);
                    return false;
                }
                bool bound = pt_bind_at(arena, &serialized, level + 1, result, error);
                zval_ptr_dtor(&serialized);
                return bound;
            }
            if (instanceof_function(ce, zend_standard_class_def)) {
                if (!pt_check_level(level + 1, error)) {
                    return false;
                }
                HashTable *properties = object->handlers->get_properties(object);
                if (properties == NULL) {
                    *result = pt_map_value(pt_map_new(arena, 0));
                    return true;
                }
                return pt_bind_entries(arena, properties, level + 1, true, result, error);
            }
            if (instanceof_function(ce, zend_ce_closure)) {
                return pt_bind_fail(error, "E_DATA_UNSUPPORTED_TYPE", zend_string_init("a closure has no binding", 24, 0));
            }
            /* Every other object keeps its instance, with its public members visible (VAL-18, VAL-19). */
            pt_arena_keep(arena, input);
            result->type = PT_OBJECT;
            result->u.object = object;
            return true;
        }
        default:
            return pt_bind_fail(error, "E_DATA_UNSUPPORTED_TYPE", zend_strpprintf(0, "a value of type %s has no binding", zend_zval_type_name(input)));
    }
}

bool pt_bind_value(pt_arena *arena, zval *input, pt_value *result, pt_bind_error *error)
{
    return pt_bind_at(arena, input, 0, result, error);
}

bool pt_bind_map(pt_arena *arena, zval *input, pt_map **result, pt_bind_error *error)
{
    ZVAL_DEREF(input);
    if (Z_TYPE_P(input) == IS_NULL) {
        *result = pt_map_new(arena, 0);
        return true;
    }
    pt_bound *bound = pt_bound_of(input);
    if (bound != NULL) {
        pt_arena_keep(arena, input);
        *result = bound->map;
        return true;
    }
    pt_value value;
    if (!pt_bind_value(arena, input, &value, error)) {
        return false;
    }
    if (value.type == PT_MAP) {
        *result = value.u.map;
        return true;
    }
    if (value.type == PT_LIST && value.u.list->count == 0) {
        *result = pt_map_new(arena, 0);
        return true;
    }
    return pt_bind_fail(error, "E_DATA_UNSUPPORTED_TYPE", zend_string_init("assign is not a map", 19, 0));
}

void pt_host_value(pt_value value, zval *result)
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
                pt_host_value(value.u.list->items[i], &item);
                add_next_index_zval(result, &item);
            }
            return;
        case PT_MAP: {
            const pt_map *map = value.u.map;
            array_init_size(result, map->count);
            for (uint32_t i = 0; i < map->used; i++) {
                if (!map->entries[i].live) {
                    continue;
                }
                zval item;
                pt_host_value(map->entries[i].value, &item);
                /* The key conversion of a PHP array applies: a decimal integer key is an integer key. */
                zend_symtable_str_update(Z_ARRVAL_P(result), map->entries[i].key.s, map->entries[i].key.n, &item);
            }
            return;
        }
        default:
            ZVAL_OBJ_COPY(result, value.u.object);
            return;
    }
}

bool pt_object_property(pt_arena *arena, zend_object *object, pt_s name, pt_value *result, bool *found, pt_bind_error *error)
{
    *found = false;
    HashTable *properties = object->handlers->get_properties(object);
    if (properties == NULL) {
        return true;
    }
    zend_ulong index;
    zend_string *key;
    zval *item;
    ZEND_HASH_FOREACH_KEY_VAL_IND(properties, index, key, item) {
        bool match;
        if (key == NULL) {
            char digits[32];
            int written = snprintf(digits, sizeof(digits), ZEND_LONG_FMT, (zend_long)index);
            match = pt_eq(name, digits, (size_t)written);
        } else {
            if (ZSTR_LEN(key) > 0 && ZSTR_VAL(key)[0] == '\0') {
                continue;
            }
            match = pt_eq(name, ZSTR_VAL(key), ZSTR_LEN(key));
        }
        if (match) {
            *found = true;
            return pt_bind_value(arena, item, result, error);
        }
    } ZEND_HASH_FOREACH_END();
    return true;
}
