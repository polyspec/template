/*
 * The function groups Functions\Strings, Functions\Numbers, Functions\Encoding and Functions\Collection of the library
 * as classes of the extension (FUN-10 to FUN-36). table() gives the library's table: each name maps to its argument
 * counts and a Closure of a persistent internal function, whose dispatcher runs the built-in function of
 * pt_functions.c with the arguments of the call.
 */
#include "pt.h"
#include "Zend/zend_closures.h"
#include <string.h>

/* The names of each group in the order of the library's table. */
static const char *const pt_strings_names[] = {
    "upper", "lower", "trim", "replace", "split", "truncate", "contains", "starts_with", "ends_with", "length",
};
static const char *const pt_numbers_names[] = {
    "number", "round", "floor", "ceil", "abs", "min", "max", "num",
};
static const char *const pt_encoding_names[] = {
    "escape", "raw", "json", "url", "nl2br", "str", "type",
};
static const char *const pt_collection_names[] = {
    "keys", "values", "first", "last", "reverse", "slice", "sort", "join", "range", "default",
};

typedef struct pt_group {
    const char *const *names;
    uint32_t count;
    zend_class_entry *ce;
    zend_internal_function **functions; /* one persistent function per name, in the order of names */
} pt_group;

static pt_group pt_strings_group = {pt_strings_names, sizeof(pt_strings_names) / sizeof(pt_strings_names[0]), NULL, NULL};
static pt_group pt_numbers_group = {pt_numbers_names, sizeof(pt_numbers_names) / sizeof(pt_numbers_names[0]), NULL, NULL};
static pt_group pt_encoding_group = {pt_encoding_names, sizeof(pt_encoding_names) / sizeof(pt_encoding_names[0]), NULL, NULL};
static pt_group pt_collection_group = {pt_collection_names, sizeof(pt_collection_names) / sizeof(pt_collection_names[0]), NULL, NULL};

/* The signature of each function: one required parameter `array $a`. */
static const zend_internal_arg_info pt_group_arginfo[] = {
    {(const char *)(zend_uintptr_t)(1), ZEND_TYPE_INIT_NONE(_ZEND_ARG_INFO_FLAGS(0, 0, 0)), NULL},
    ZEND_ARG_TYPE_INFO(0, a, IS_ARRAY, 0)
};

/* The dispatcher of every function of the groups: it runs the built-in function named by the function that is called. */
static void pt_group_dispatch(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *name = EX(func)->common.function_name;
    const pt_builtin *builtin = pt_builtin_find(ZSTR_VAL(name), ZSTR_LEN(name));
    if (builtin == NULL) {
        zend_throw_error(NULL, "%s is not a built-in function", ZSTR_VAL(name));
        RETURN_THROWS();
    }

    /* The library calls each closure with the arguments and the environment; a closure reads its first parameter only,
     * so the extra argument of the environment is accepted and ignored. */
    zval *input;
    ZEND_PARSE_PARAMETERS_START(1, -1)
        Z_PARAM_ARRAY(input)
    ZEND_PARSE_PARAMETERS_END();

    /* The library reads $a[0], $a[1], ... and ignores the elements above max; a missing element below min is null. */
    uint32_t count = zend_hash_num_elements(Z_ARRVAL_P(input));
    uint32_t passed = count > builtin->max ? builtin->max : count;
    uint32_t arg_count = passed < builtin->min ? builtin->min : passed;

    pt_arena arena;
    pt_arena_init(&arena);
    pt_value *args = pt_alloc(&arena, sizeof(pt_value) * arg_count);
    uint32_t index = 0;
    zval *item;
    ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(input), item) {
        if (index == passed) {
            break;
        }
        pt_bind_error error = {NULL, NULL};
        if (!pt_bind_value(&arena, item, &args[index], &error)) {
            pt_throw_bind_error(error.code, error.message);
            pt_arena_free(&arena);
            RETURN_THROWS();
        }
        index++;
    } ZEND_HASH_FOREACH_END();
    for (; index < arg_count; index++) {
        args[index] = pt_null();
    }

    pt_env env = {{NULL, 0}, 0.0};
    pt_value result = {0};
    pt_function_error error = {NULL, NULL};
    if (!builtin->call(&arena, &env, args, arg_count, &result, &error)) {
        pt_throw_function_error(error.code, error.message);
        pt_arena_free(&arena);
        RETURN_THROWS();
    }
    pt_library_value(result, return_value);
    pt_arena_free(&arena);
}

/* Persistent functions for a group, one per name; they live as long as the process (no MSHUTDOWN frees them). */
static void pt_group_init(pt_group *group, zend_class_entry *ce)
{
    group->ce = ce;
    group->functions = pemalloc(sizeof(zend_internal_function *) * group->count, 1);
    for (uint32_t i = 0; i < group->count; i++) {
        zend_internal_function *fn = pemalloc(sizeof(zend_internal_function), 1);
        memset(fn, 0, sizeof(zend_internal_function));
        fn->type = ZEND_INTERNAL_FUNCTION;
        fn->function_name = zend_string_init_interned(group->names[i], strlen(group->names[i]), 1);
        fn->scope = ce;
        fn->fn_flags = ZEND_ACC_STATIC | ZEND_ACC_PUBLIC;
        fn->arg_info = (zend_internal_arg_info *)pt_group_arginfo + 1;
        fn->num_args = 1;
        fn->required_num_args = 1;
        fn->handler = pt_group_dispatch;
        group->functions[i] = fn;
    }
}

/* table(): the entries of a group in the order of the library, as the library's arrays give them. */
static void pt_group_table(zval *return_value, const pt_group *group)
{
    array_init(return_value);
    for (uint32_t i = 0; i < group->count; i++) {
        const pt_builtin *builtin = pt_builtin_find(group->names[i], strlen(group->names[i]));
        zval entry, call;
        array_init(&entry);
        add_assoc_long(&entry, "min", (zend_long)builtin->min);
        /* A variadic built-in has max UINT32_MAX here, which the library's table names PHP_INT_MAX. */
        add_assoc_long(&entry, "max", builtin->max == UINT32_MAX ? ZEND_LONG_MAX : (zend_long)builtin->max);
        zend_create_fake_closure(&call, (zend_function *)group->functions[i], group->ce, group->ce, NULL);
        add_assoc_zval(&entry, "call", &call);
        add_assoc_zval(return_value, group->names[i], &entry);
    }
}

void pt_groups_register(zend_class_entry *strings, zend_class_entry *numbers, zend_class_entry *encoding,
                        zend_class_entry *collection)
{
    pt_group_init(&pt_strings_group, strings);
    pt_group_init(&pt_numbers_group, numbers);
    pt_group_init(&pt_encoding_group, encoding);
    pt_group_init(&pt_collection_group, collection);
}

void pt_strings_table(INTERNAL_FUNCTION_PARAMETERS)
{
    ZEND_PARSE_PARAMETERS_NONE();
    pt_group_table(return_value, &pt_strings_group);
}

void pt_numbers_table(INTERNAL_FUNCTION_PARAMETERS)
{
    ZEND_PARSE_PARAMETERS_NONE();
    pt_group_table(return_value, &pt_numbers_group);
}

void pt_encoding_table(INTERNAL_FUNCTION_PARAMETERS)
{
    ZEND_PARSE_PARAMETERS_NONE();
    pt_group_table(return_value, &pt_encoding_group);
}

void pt_collection_table(INTERNAL_FUNCTION_PARAMETERS)
{
    ZEND_PARSE_PARAMETERS_NONE();
    pt_group_table(return_value, &pt_collection_group);
}

/* Runs the built-in function of a name on one argument, as a method of a group runs it: a FunctionError is thrown the
 * way the dispatcher throws it, and false then. */
static bool pt_group_call_one(pt_arena *arena, pt_value input, const char *name, zval *return_value)
{
    const pt_builtin *builtin = pt_builtin_find(name, strlen(name));
    pt_value *args = pt_alloc(arena, sizeof(pt_value));
    args[0] = input;
    pt_env env = {{NULL, 0}, 0.0};
    pt_value result = {0};
    pt_function_error error = {NULL, NULL};
    if (!builtin->call(arena, &env, args, 1, &result, &error)) {
        pt_throw_function_error(error.code, error.message);
        return false;
    }
    pt_library_value(result, return_value);
    return true;
}

/* A PHP value given to a method of the encoding group, read as the library reads it (FUN-26): a number of any size is
 * kept, a list and a MapValue keep their members, a SafeString keeps its text, and another object is opaque (VAL-19).
 * False for a value that has no JSON text at all, a resource. */
static bool pt_host_json_value(pt_arena *arena, zval *input, pt_value *result)
{
    ZVAL_DEREF(input);
    switch (Z_TYPE_P(input)) {
        case IS_NULL:
            *result = pt_null();
            return true;
        case IS_FALSE:
            *result = pt_bool(false);
            return true;
        case IS_TRUE:
            *result = pt_bool(true);
            return true;
        case IS_LONG:
            *result = pt_number((double)Z_LVAL_P(input));
            return true;
        case IS_DOUBLE:
            *result = pt_number(Z_DVAL_P(input));
            return true;
        case IS_STRING: {
            pt_s text = {Z_STRVAL_P(input), Z_STRLEN_P(input)};
            *result = pt_string(text);
            return true;
        }
        case IS_ARRAY: {
            pt_list *list = pt_list_new(arena, zend_hash_num_elements(Z_ARRVAL_P(input)));
            uint32_t index = 0;
            bool ok = true;
            zval *item;
            ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(input), item) {
                if (!pt_host_json_value(arena, item, &list->items[index++])) {
                    ok = false;
                    break;
                }
            } ZEND_HASH_FOREACH_END();
            if (ok) {
                *result = pt_list_value(list);
            }
            return ok;
        }
        case IS_OBJECT: {
            zend_object *object = Z_OBJ_P(input);
            if (object->ce == pt_safe_string_ce) {
                zval rv;
                zval *text = zend_read_property(pt_safe_string_ce, object, ZEND_STRL("text"), 1, &rv);
                pt_s value = {Z_STRVAL_P(text), Z_STRLEN_P(text)};
                *result = pt_safe(value);
                return true;
            }
            if (object->ce == pt_map_value_ce) {
                /* The items of a MapValue are its array, keyed as the PHP array keys them (a numeric key is an index). */
                zval *items = OBJ_PROP_NUM(object, 0);
                pt_map *map = pt_map_new(arena, zend_hash_num_elements(Z_ARRVAL_P(items)));
                zend_string *key;
                zend_ulong index;
                zval *item;
                bool ok = true;
                ZEND_HASH_FOREACH_KEY_VAL(Z_ARRVAL_P(items), index, key, item) {
                    pt_s name;
                    if (key != NULL) {
                        name = pt_strdup(arena, ZSTR_VAL(key), ZSTR_LEN(key));
                    } else {
                        zend_string *text = zend_long_to_str((zend_long)index);
                        name = pt_strdup(arena, ZSTR_VAL(text), ZSTR_LEN(text));
                        zend_string_release(text);
                    }
                    pt_value value;
                    if (!pt_host_json_value(arena, item, &value)) {
                        ok = false;
                        break;
                    }
                    pt_map_set(map, name, value);
                } ZEND_HASH_FOREACH_END();
                if (ok) {
                    *result = pt_map_value(map);
                }
                return ok;
            }
            /* Every other object is opaque: the json built-in function refuses it. */
            pt_arena_keep(arena, input);
            result->type = PT_OBJECT;
            result->u.object = object;
            return true;
        }
        default:
            return false;
    }
}

/* Functions\Encoding::toJson (FUN-26 to FUN-28): the JSON text of a value, the json built-in function. */
void pt_encoding_to_json(INTERNAL_FUNCTION_PARAMETERS)
{
    zval *value;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_ZVAL(value)
    ZEND_PARSE_PARAMETERS_END();
    pt_arena arena;
    pt_arena_init(&arena);
    pt_value input = pt_null();
    if (!pt_host_json_value(&arena, value, &input)) {
        pt_throw_function_error(PT_E_RUNTIME_TYPE, zend_string_init(ZEND_STRL("json does not accept a native object"), 0));
        pt_arena_free(&arena);
        RETURN_THROWS();
    }
    bool done = pt_group_call_one(&arena, input, "json", return_value);
    pt_arena_free(&arena);
    if (!done) {
        RETURN_THROWS();
    }
}

/* Functions\Encoding::percentEncode (FUN-29): the rawurlencode of a text, the url built-in function. */
void pt_encoding_percent_encode(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *text;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(text)
    ZEND_PARSE_PARAMETERS_END();
    pt_arena arena;
    pt_arena_init(&arena);
    pt_s bytes = {ZSTR_VAL(text), ZSTR_LEN(text)};
    bool done = pt_group_call_one(&arena, pt_string(bytes), "url", return_value);
    pt_arena_free(&arena);
    if (!done) {
        RETURN_THROWS();
    }
}
