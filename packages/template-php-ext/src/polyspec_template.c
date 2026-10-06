/*
 * The PHP classes of the extension: Polyspec\Template\Native\TemplateError and
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
#include "php_polyspec_template.h"
#include "pt.h"
#include "polyspec_template_arginfo.h"

#include <limits.h>

ZEND_BEGIN_MODULE_GLOBALS(polyspec_template)
    /* The fields of the live TemplateError objects of the request, by object handle. */
    HashTable *errors;
ZEND_END_MODULE_GLOBALS(polyspec_template)

ZEND_DECLARE_MODULE_GLOBALS(polyspec_template)
#define PT_G(v) ZEND_MODULE_GLOBALS_ACCESSOR(polyspec_template, v)

zend_class_entry *pt_error_ce;
static zend_class_entry *pt_engine_ce;

/* ----------------------------------------------------------------------------------------------- */
/* TemplateError (ERR-1)                                                                            */
/* ----------------------------------------------------------------------------------------------- */

/* The error object is an exception, which PHP allocates itself, so its fields are kept beside it. */
typedef struct pt_error_fields {
    zend_string *code;
    zend_string *template;
    zend_long line, col, offset, end;
} pt_error_fields;

static zend_object_handlers pt_error_handlers;
static zend_object *(*pt_exception_create)(zend_class_entry *class_type);

static void pt_error_fields_dtor(zval *value)
{
    pt_error_fields *fields = Z_PTR_P(value);
    zend_string_release(fields->code);
    zend_string_release(fields->template);
    efree(fields);
}

static zend_object *pt_error_create(zend_class_entry *class_type)
{
    zend_object *object = pt_exception_create(class_type);
    object->handlers = &pt_error_handlers;
    return object;
}

static void pt_error_free(zend_object *object)
{
    HashTable *errors = PT_G(errors);
    if (errors) {
        zend_hash_index_del(errors, object->handle);
        if (zend_hash_num_elements(errors) == 0) {
            zend_hash_destroy(errors);
            FREE_HASHTABLE(errors);
            PT_G(errors) = NULL;
        }
    }
    zend_object_std_dtor(object);
}

static pt_error_fields *pt_error_fields_of(zend_object *object)
{
    HashTable *errors = PT_G(errors);
    return errors ? zend_hash_index_find_ptr(errors, object->handle) : NULL;
}

/* Creates a TemplateError object with the fields of an error. */
static zend_object *pt_error_object(const char *code, zend_string *template, zend_long line, zend_long col, zend_long offset, zend_long end, zend_string *message)
{
    zval exception;
    object_init_ex(&exception, pt_error_ce);
    zend_object *object = Z_OBJ(exception);
    /* No constructor runs, so the message that getMessage() reads is written directly. */
    zval text;
    ZVAL_STR_COPY(&text, message);
    zend_update_property_ex(zend_ce_exception, object, ZSTR_KNOWN(ZEND_STR_MESSAGE), &text);
    zval_ptr_dtor(&text);
    pt_error_fields *fields = emalloc(sizeof(pt_error_fields));
    fields->code = zend_string_init(code, strlen(code), 0);
    fields->template = zend_string_copy(template);
    fields->line = line;
    fields->col = col;
    fields->offset = offset;
    fields->end = end;
    if (PT_G(errors) == NULL) {
        ALLOC_HASHTABLE(PT_G(errors));
        zend_hash_init(PT_G(errors), 8, NULL, pt_error_fields_dtor, 0);
    }
    zend_hash_index_update_ptr(PT_G(errors), object->handle, fields);
    return object;
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

#define PT_ERROR_FIELDS()                                                     \
    ZEND_PARSE_PARAMETERS_NONE();                                             \
    pt_error_fields *fields = pt_error_fields_of(Z_OBJ_P(ZEND_THIS));         \
    if (fields == NULL) {                                                     \
        zend_throw_error(NULL, "The TemplateError object has no error fields"); \
        RETURN_THROWS();                                                      \
    }

ZEND_METHOD(Polyspec_Template_Native_TemplateError, getErrorCode)
{
    PT_ERROR_FIELDS();
    RETURN_STR_COPY(fields->code);
}

ZEND_METHOD(Polyspec_Template_Native_TemplateError, getTemplate)
{
    PT_ERROR_FIELDS();
    RETURN_STR_COPY(fields->template);
}

ZEND_METHOD(Polyspec_Template_Native_TemplateError, getErrorLine)
{
    PT_ERROR_FIELDS();
    RETURN_LONG(fields->line);
}

ZEND_METHOD(Polyspec_Template_Native_TemplateError, getErrorCol)
{
    PT_ERROR_FIELDS();
    RETURN_LONG(fields->col);
}

ZEND_METHOD(Polyspec_Template_Native_TemplateError, getOffset)
{
    PT_ERROR_FIELDS();
    RETURN_LONG(fields->offset);
}

ZEND_METHOD(Polyspec_Template_Native_TemplateError, getEnd)
{
    PT_ERROR_FIELDS();
    RETURN_LONG(fields->end);
}

ZEND_METHOD(Polyspec_Template_Native_TemplateError, toArray)
{
    PT_ERROR_FIELDS();
    zval rv;
    zval *message = zend_read_property_ex(zend_ce_exception, Z_OBJ_P(ZEND_THIS), ZSTR_KNOWN(ZEND_STR_MESSAGE), 1, &rv);
    array_init_size(return_value, 7);
    add_assoc_str_ex(return_value, "code", 4, zend_string_copy(fields->code));
    add_assoc_str_ex(return_value, "template", 8, zend_string_copy(fields->template));
    add_assoc_long_ex(return_value, "line", 4, fields->line);
    add_assoc_long_ex(return_value, "col", 3, fields->col);
    add_assoc_long_ex(return_value, "offset", 6, fields->offset);
    add_assoc_long_ex(return_value, "end", 3, fields->end);
    add_assoc_str_ex(return_value, "message", 7, zval_get_string(message));
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
    engine->open = '{';
    engine->close = '}';
    engine->limits.iterations = 1000000;
    engine->limits.depth = 32;
    engine->limits.output_bytes = 16 * 1024 * 1024;
    engine->limits.expression_depth = 64;
    zend_hash_init(&engine->functions, 8, NULL, ZVAL_PTR_DTOR, 0);
    zend_hash_init(&engine->classes, 8, NULL, ZVAL_PTR_DTOR, 0);
    zend_hash_init(&engine->cache, 8, NULL, pt_cache_dtor, 0);
    return &object->std;
}

static void pt_engine_free(zend_object *object)
{
    pt_engine *engine = pt_engine_of(object);
    zend_hash_destroy(&engine->functions);
    zend_hash_destroy(&engine->classes);
    zend_hash_destroy(&engine->cache);
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
}

/* RT-2: parses one source; on success `result` holds the AST as nested arrays. */
static bool pt_parse_source(zend_string *source, zend_string *name, HashTable *options, zval *result)
{
    char open, close;
    if (!pt_option_delimiters(options, &open, &close)) {
        return false;
    }
    pt_run run;
    pt_run_init(&run);
    if (setjmp(run.jump) == 0) {
        pt_template *template = pt_parse(&run, ZSTR_VAL(name), ZSTR_LEN(name), ZSTR_VAL(source), ZSTR_LEN(source), open, close);
        pt_ast_to_zval(template, result);
        pt_template_release(template);
    }
    return pt_run_finish(&run);
}

ZEND_METHOD(Polyspec_Template_Native_Engine, parse)
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
        zend_object *object = pt_error_object("E_INTERNAL", name, 0, 0, 0, 0, message);
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
        pt_s resolved;
        if (!pt_resolve_path(&run->arena, PT_S(""), template->u.str, &resolved)) {
            pt_request_fail(run, name, "E_DATA_UNSUPPORTED_TYPE", zend_strpprintf(0, "define %s: template path leaves the loader root", id.s));
        }
        if (has_data && !data_is_map) {
            pt_request_fail(run, name, "E_DATA_UNSUPPORTED_TYPE", zend_strpprintf(0, "define %s: data is not a map", id.s));
        }
        entry->template = resolved;
        entry->data = has_data ? data : NULL;
    } else {
        pt_request_fail(run, name, "E_DATA_UNSUPPORTED_TYPE", zend_strpprintf(0, "define %s: entry needs \"template\" or \"html\"", id.s));
    }
    zend_hash_str_update_ptr(defines, id.s, id.n, entry);
}

/* The definitions of JSON text: a map from id to a path or to a map with template, data or html. */
static HashTable *pt_defines_from_json(pt_run *run, pt_s name, pt_value value)
{
    if (value.type != PT_MAP) {
        pt_request_fail(run, name, "E_DATA_UNSUPPORTED_TYPE", zend_string_init("define is not an object", 23, 0));
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
        pt_request_fail(run, name, "E_DATA_UNSUPPORTED_TYPE", zend_string_init("env is not an object", 20, 0));
    }
    pt_value *timezone = pt_map_get(value->u.map, "timezone", 8);
    if (timezone != NULL && timezone->type != PT_NULL) {
        if (!pt_is_string(*timezone)) {
            pt_request_fail(run, name, "E_DATA_UNSUPPORTED_TYPE", zend_string_init("env.timezone is not a string", 28, 0));
        }
        env->timezone = timezone->u.str;
    }
    pt_value *now = pt_map_get(value->u.map, "now", 3);
    if (now != NULL && now->type != PT_NULL) {
        if (now->type != PT_NUMBER) {
            pt_request_fail(run, name, "E_DATA_UNSUPPORTED_TYPE", zend_string_init("env.now is not a number", 23, 0));
        }
        env->now = now->u.number;
    }
}

static pt_value pt_read_json(pt_run *run, pt_s name, zend_string *text)
{
    pt_value value;
    pt_bind_error error = {NULL, NULL};
    if (!pt_json_parse(&run->arena, ZSTR_VAL(text), ZSTR_LEN(text), &value, &error)) {
        pt_request_fail(run, name, error.code, error.message);
    }
    return value;
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

    pt_engine *engine = pt_engine_of(Z_OBJ_P(ZEND_THIS));
    smart_str output = {0};
    pt_run run;
    pt_run_init(&run);
    if (setjmp(run.jump) == 0) {
        pt_request request;
        memset(&request, 0, sizeof(request));
        request.name = pt_strdup(&run.arena, ZSTR_VAL(name), ZSTR_LEN(name));
        pt_value data = pt_read_json(&run, request.name, assign);
        pt_value definitions, environment;
        if (define) {
            definitions = pt_read_json(&run, request.name, define);
        }
        if (env) {
            environment = pt_read_json(&run, request.name, env);
        }
        if (data.type == PT_MAP) {
            request.data = data.u.map;
        } else if (data.type == PT_NULL || (data.type == PT_LIST && data.u.list->count == 0)) {
            request.data = pt_map_new(&run.arena, 0);
        } else {
            pt_request_fail(&run, request.name, "E_DATA_UNSUPPORTED_TYPE", zend_string_init("assign is not a map", 19, 0));
        }
        if (define) {
            request.defines = pt_defines_from_json(&run, request.name, definitions);
        }
        pt_env_from_json(&run, request.name, env ? &environment : NULL, &request.env);
        pt_render(&run, engine, &request, &output);
    }
    if (!pt_run_finish(&run)) {
        smart_str_free(&output);
        RETURN_THROWS();
    }
    smart_str_0(&output);
    if (output.s == NULL) {
        RETURN_EMPTY_STRING();
    }
    RETURN_STR(output.s);
}

/* ----------------------------------------------------------------------------------------------- */
/* Module                                                                                           */
/* ----------------------------------------------------------------------------------------------- */

static PHP_GINIT_FUNCTION(polyspec_template)
{
#if defined(COMPILE_DL_POLYSPEC_TEMPLATE) && defined(ZTS)
    ZEND_TSRMLS_CACHE_UPDATE();
#endif
    polyspec_template_globals->errors = NULL;
}

static PHP_MINIT_FUNCTION(polyspec_template)
{
    pt_error_ce = register_class_Polyspec_Template_Native_TemplateError(zend_ce_exception);
    pt_exception_create = zend_ce_exception->create_object;
    pt_error_ce->create_object = pt_error_create;
    memcpy(&pt_error_handlers, zend_get_std_object_handlers(), sizeof(zend_object_handlers));
    pt_error_handlers.clone_obj = NULL;
    pt_error_handlers.free_obj = pt_error_free;

    pt_engine_ce = register_class_Polyspec_Template_Native_Engine();
    pt_engine_ce->create_object = pt_engine_create;
    memcpy(&pt_engine_handlers, zend_get_std_object_handlers(), sizeof(zend_object_handlers));
    pt_engine_handlers.offset = XtOffsetOf(pt_engine_object, std);
    pt_engine_handlers.free_obj = pt_engine_free;
    pt_engine_handlers.clone_obj = NULL;
    pt_engine_handlers.get_gc = pt_engine_get_gc;
    return SUCCESS;
}

static PHP_RINIT_FUNCTION(polyspec_template)
{
#if defined(COMPILE_DL_POLYSPEC_TEMPLATE) && defined(ZTS)
    ZEND_TSRMLS_CACHE_UPDATE();
#endif
    PT_G(errors) = NULL;
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
    PHP_MODULE_GLOBALS(polyspec_template),
    PHP_GINIT(polyspec_template),
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
