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

static void pt_parse_into(pt_run *run, zend_string *source, zend_string *name, char open, char close, zval *result)
{
    pt_template *template = pt_parse(run, ZSTR_VAL(name), ZSTR_LEN(name), ZSTR_VAL(source), ZSTR_LEN(source), open, close);
    pt_ast_to_zval(template, result);
    pt_template_release(template);
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
    /* The work of a run is a function of its own: no local of the frame that calls setjmp changes after it. */
    if (setjmp(run.jump) == 0) {
        pt_parse_into(&run, source, name, open, close, result);
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
        pt_s resolved = {NULL, 0};
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
    pt_value value = {0};
    pt_bind_error error = {NULL, NULL};
    if (!pt_json_parse(&run->arena, ZSTR_VAL(text), ZSTR_LEN(text), &value, &error)) {
        pt_request_fail(run, name, error.code, error.message);
    }
    return value;
}

static void pt_render_json_into(pt_run *run, pt_engine *engine, zend_string *name, zend_string *assign, zend_string *define, zend_string *env, smart_str *output)
{
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
        pt_request_fail(run, request.name, "E_DATA_UNSUPPORTED_TYPE", zend_string_init("assign is not a map", 19, 0));
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

    pt_engine *engine = pt_engine_of(Z_OBJ_P(ZEND_THIS));
    smart_str output = {0};
    pt_run run;
    pt_run_init(&run);
    if (setjmp(run.jump) == 0) {
        pt_render_json_into(&run, engine, name, assign, define, env, &output);
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

ZEND_METHOD(Polyspec_Template_Native_Engine, register)
{
    zend_string *name;
    zend_fcall_info fci;
    zend_fcall_info_cache fcc;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_STR(name)
        Z_PARAM_FUNC(fci, fcc)
    ZEND_PARSE_PARAMETERS_END();

    if (!pt_identifier(name)) {
        zend_string *quoted = pt_json_quote(ZSTR_VAL(name), ZSTR_LEN(name));
        zend_throw_exception_ex(spl_ce_InvalidArgumentException, 0, "%s is not an identifier", ZSTR_VAL(quoted));
        zend_string_release(quoted);
        RETURN_THROWS();
    }
    if (pt_builtin_find(ZSTR_VAL(name), ZSTR_LEN(name)) != NULL) {
        zend_throw_exception_ex(spl_ce_InvalidArgumentException, 0, "%s is a built-in function", ZSTR_VAL(name));
        RETURN_THROWS();
    }
    zval function;
    ZVAL_COPY(&function, &fci.function_name);
    zend_hash_update(&pt_engine_of(Z_OBJ_P(ZEND_THIS))->functions, name, &function);
}

ZEND_METHOD(Polyspec_Template_Native_Engine, registerClass)
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
    pt_request_fail(run, name, "E_DATA_UNSUPPORTED_TYPE", zend_strpprintf(0, "define %s: data is not a map", id.s));
}

static HashTable *pt_defines_from_php(pt_run *run, pt_s name, zval *input)
{
    ZVAL_DEREF(input);
    if (Z_TYPE_P(input) != IS_ARRAY) {
        pt_request_fail(run, name, "E_DATA_UNSUPPORTED_TYPE", zend_string_init("define is not an object", 23, 0));
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
                pt_request_fail(run, name, "E_DATA_INVALID_UTF8", zend_string_init("a define id is not valid UTF-8", 30, 0));
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
                pt_request_fail(run, name, "E_DATA_UNSUPPORTED_TYPE", zend_strpprintf(0, "define %s: template path leaves the loader root", id.s));
            }
            define->template = pt_strdup(&run->arena, resolved.s, resolved.n);
            define->data = data != NULL ? pt_define_data(run, name, id, data) : NULL;
        } else {
            pt_request_fail(run, name, "E_DATA_UNSUPPORTED_TYPE", zend_strpprintf(0, "define %s: entry needs \"template\" or \"html\"", id.s));
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
        pt_request_fail(run, name, "E_DATA_UNSUPPORTED_TYPE", zend_string_init("env is not an object", 20, 0));
    }
    zval *timezone = zend_hash_str_find_deref(Z_ARRVAL_P(input), "timezone", 8);
    if (timezone != NULL && Z_TYPE_P(timezone) != IS_NULL) {
        if (Z_TYPE_P(timezone) != IS_STRING) {
            pt_request_fail(run, name, "E_DATA_UNSUPPORTED_TYPE", zend_string_init("env.timezone is not a string", 28, 0));
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
            pt_request_fail(run, name, "E_DATA_UNSUPPORTED_TYPE", zend_string_init("env.now is not a number", 23, 0));
        }
    }
}

static void pt_render_php_into(pt_run *run, pt_engine *engine, zend_string *name, zval *assign, HashTable *options, smart_str *output)
{
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

    pt_engine *engine = pt_engine_of(Z_OBJ_P(ZEND_THIS));
    smart_str output = {0};
    pt_run run;
    pt_run_init(&run);
    if (setjmp(run.jump) == 0) {
        pt_render_php_into(&run, engine, name, assign, options, &output);
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

/* `new` fails: only bind and merge create a bound map. */
static zend_function *pt_bound_get_constructor(zend_object *object)
{
    zend_throw_error(NULL, "Instantiation of class %s is not allowed; use bind or merge", ZSTR_VAL(object->ce->name));
    return NULL;
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

ZEND_METHOD(Polyspec_Template_Native_BoundMap, bind)
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
            pt_throw_bare("E_DATA_UNSUPPORTED_TYPE", zend_string_init("bind takes a value that binds to a map", 38, 0));
            RETURN_THROWS();
        }
    }
    RETURN_OBJ(object);
}

ZEND_METHOD(Polyspec_Template_Native_BoundMap, merge)
{
    zval *first, *second;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_ZVAL(first)
        Z_PARAM_ZVAL(second)
    ZEND_PARSE_PARAMETERS_END();

    pt_bound *left = pt_bound_of(first), *right = pt_bound_of(second);
    if (left == NULL || right == NULL) {
        pt_throw_bare("E_DATA_UNSUPPORTED_TYPE", zend_string_init("merge takes two bound maps of the extension", 43, 0));
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

    pt_bound_ce = register_class_Polyspec_Template_Native_BoundMap();
    pt_bound_ce->create_object = pt_bound_create;
    memcpy(&pt_bound_handlers, zend_get_std_object_handlers(), sizeof(zend_object_handlers));
    pt_bound_handlers.offset = XtOffsetOf(pt_bound, std);
    pt_bound_handlers.free_obj = pt_bound_free;
    pt_bound_handlers.clone_obj = NULL;
    pt_bound_handlers.get_constructor = pt_bound_get_constructor;
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
