/*
 * Render state of the library (S10): the classes Frame, Scope and Context of Polyspec\Template\Render. Their
 * properties are the state of the objects, as they are in the library, so the userland classes and the tests
 * read and write the same values as the C methods do (docs/spec/runtime.md).
 */
#include "pt.h"
#include "Zend/zend_exceptions.h"
#include "Zend/zend_interfaces.h"
#include "ext/spl/spl_array.h"

static zend_class_entry *pt_runtime_services_ce, *pt_scope_ce;
zend_class_entry *pt_frame_ce, *pt_context_ce;

/* A declared property of a class of this file, read without a notice: the value of the slot itself, not a copy, through
 * the reference when host code holds the property by reference. */
static zval *pt_prop(zend_class_entry *scope, zend_object *object, const char *name, size_t length, zval *rv)
{
    zval *value = zend_read_property(scope, object, name, length, 1, rv);
    ZVAL_DEREF(value);
    return value;
}

/* The entries of a MapValue (its one property, the PHP array of the map). */
static HashTable *pt_map_items(zend_object *map)
{
    zval rv;
    return Z_ARRVAL_P(pt_prop(pt_map_value_ce, map, ZEND_STRL("items"), &rv));
}

void pt_render_state_register(zend_class_entry *runtime_services, zend_class_entry *frame, zend_class_entry *scope, zend_class_entry *context)
{
    pt_runtime_services_ce = runtime_services;
    pt_frame_ce = frame;
    pt_scope_ce = scope;
    pt_context_ce = context;
}

/* ----------------------------------------------------------------------------------------------- */
/* Frame                                                                                            */
/* ----------------------------------------------------------------------------------------------- */

void pt_frame_construct(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *name;
    zval *lines = NULL, *context;
    ZEND_PARSE_PARAMETERS_START(3, 3)
        Z_PARAM_STR(name)
        Z_PARAM_ARRAY_OR_NULL(lines)
        Z_PARAM_OBJECT_OF_CLASS(context, pt_map_value_ce)
    ZEND_PARSE_PARAMETERS_END();
    zend_object *object = Z_OBJ_P(ZEND_THIS);
    zend_update_property_str(pt_frame_ce, object, ZEND_STRL("name"), name);
    if (lines == NULL) {
        zend_update_property_null(pt_frame_ce, object, ZEND_STRL("lines"));
    } else {
        zend_update_property(pt_frame_ce, object, ZEND_STRL("lines"), lines);
    }
    zend_update_property(pt_frame_ce, object, ZEND_STRL("context"), context);
}

/* ----------------------------------------------------------------------------------------------- */
/* Scope                                                                                            */
/* ----------------------------------------------------------------------------------------------- */

void pt_scope_construct(INTERNAL_FUNCTION_PARAMETERS)
{
    zval *locals = NULL;
    ZEND_PARSE_PARAMETERS_START(0, 1)
        Z_PARAM_OPTIONAL
        Z_PARAM_OBJECT_OF_CLASS_OR_NULL(locals, pt_map_value_ce)
    ZEND_PARSE_PARAMETERS_END();
    zend_object *object = Z_OBJ_P(ZEND_THIS);

    if (locals != NULL) {
        zend_update_property(pt_scope_ce, object, ZEND_STRL("locals"), locals);
    } else {
        zval fresh;
        object_init_ex(&fresh, pt_map_value_ce);
        zend_update_property(pt_scope_ce, object, ZEND_STRL("locals"), &fresh);
        zval_ptr_dtor(&fresh);
    }

    zval loops;
    object_init_ex(&loops, spl_ce_ArrayObject);
    zend_call_known_instance_method_with_0_params(spl_ce_ArrayObject->constructor, Z_OBJ(loops), NULL);
    zend_update_property(pt_scope_ce, object, ZEND_STRL("loops"), &loops);
    zval_ptr_dtor(&loops);
}

/* Scope::lookup: the local of the name, else the value of the context of the frame, else null. */
void pt_scope_lookup(INTERNAL_FUNCTION_PARAMETERS)
{
    zval *frame;
    zend_string *name;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_OBJECT_OF_CLASS(frame, pt_frame_ce)
        Z_PARAM_STR(name)
    ZEND_PARSE_PARAMETERS_END();

    zval rv;
    zval *locals = pt_prop(pt_scope_ce, Z_OBJ_P(ZEND_THIS), ZEND_STRL("locals"), &rv);
    zval *found = zend_symtable_find(pt_map_items(Z_OBJ_P(locals)), name);
    if (found == NULL) {
        zval context_rv;
        zval *context = pt_prop(pt_frame_ce, Z_OBJ_P(frame), ZEND_STRL("context"), &context_rv);
        found = zend_symtable_find(pt_map_items(Z_OBJ_P(context)), name);
    }
    if (found == NULL) {
        RETURN_NULL();
    }
    RETURN_COPY_DEREF(found);
}

/* Scope::loopMeta: the last entry of the loop stack of the name (`$this->loops[$name] ?? []`), null when the stack is
 * empty or missing. */
void pt_scope_loop_meta(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *name;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(name)
    ZEND_PARSE_PARAMETERS_END();

    zval rv;
    zval *loops = pt_prop(pt_scope_ce, Z_OBJ_P(ZEND_THIS), ZEND_STRL("loops"), &rv);
    zval key, dim_rv;
    ZVAL_STR(&key, name);
    zval *stack = Z_OBJ_HT_P(loops)->read_dimension(Z_OBJ_P(loops), &key, BP_VAR_IS, &dim_rv);
    if (stack == NULL || Z_TYPE_P(stack) == IS_NULL) {
        RETURN_NULL();
    }
    if (Z_TYPE_P(stack) != IS_ARRAY) {
        zend_type_error("Polyspec\\Template\\Render\\Scope::loopMeta(): the loop stack of %s is not an array", ZSTR_VAL(name));
        RETURN_THROWS();
    }
    zval *last;
    ZEND_HASH_REVERSE_FOREACH_VAL(Z_ARRVAL_P(stack), last) {
        RETURN_COPY_DEREF(last);
    } ZEND_HASH_FOREACH_END();
    RETURN_NULL();
}

/* ----------------------------------------------------------------------------------------------- */
/* Context                                                                                          */
/* ----------------------------------------------------------------------------------------------- */

void pt_context_construct(INTERNAL_FUNCTION_PARAMETERS)
{
    zval *services, *root, *env;
    zend_string *entry;
    ZEND_PARSE_PARAMETERS_START(4, 4)
        Z_PARAM_OBJECT_OF_CLASS(services, pt_runtime_services_ce)
        Z_PARAM_OBJECT_OF_CLASS(root, pt_map_value_ce)
        Z_PARAM_ARRAY(env)
        Z_PARAM_STR(entry)
    ZEND_PARSE_PARAMETERS_END();
    zend_object *object = Z_OBJ_P(ZEND_THIS);
    zend_update_property(pt_context_ce, object, ZEND_STRL("services"), services);
    zend_update_property(pt_context_ce, object, ZEND_STRL("rootData"), root);
    zend_update_property(pt_context_ce, object, ZEND_STRL("env"), env);
    zend_update_property_str(pt_context_ce, object, ZEND_STRL("entryName"), entry);

    zval span;
    array_init(&span);
    add_next_index_long(&span, 0);
    add_next_index_long(&span, 0);
    zend_update_property(pt_context_ce, object, ZEND_STRL("currentSpan"), &span);
    zval_ptr_dtor(&span);
}

/* The limit of the services of a context: `$this->services->limits()[$name]`; false with an exception set when the
 * limit is missing or not an integer. */
bool pt_context_limit(zval *context, const char *name, size_t length, zend_long *value)
{
    zval rv;
    zval *services = pt_prop(pt_context_ce, Z_OBJ_P(context), ZEND_STRL("services"), &rv);
    zval limits;
    zend_call_method(Z_OBJ_P(services), Z_OBJCE_P(services), NULL, ZEND_STRL("limits"), &limits, 0, NULL, NULL);
    if (EG(exception) || Z_TYPE(limits) != IS_ARRAY) {
        zval_ptr_dtor(&limits);
        if (!EG(exception)) {
            zend_type_error("limits() of the render services must return an array");
        }
        return false;
    }
    zval *limit = zend_hash_str_find(Z_ARRVAL(limits), name, length);
    if (limit == NULL || Z_TYPE_P(limit) != IS_LONG) {
        zend_throw_error(NULL, "limits.%s is not an integer", name);
        zval_ptr_dtor(&limits);
        return false;
    }
    *value = Z_LVAL_P(limit);
    zval_ptr_dtor(&limits);
    return true;
}

/* The TemplateError of a failure: TemplateError::at with the lines of the frame when the frame and the span are
 * known, else TemplateError::withoutPosition named after the frame or the entry (Context::fail). An exception is set
 * when the span does not hold two offsets. The error is returned in `error`. */
void pt_context_error(zval *context, zend_string *code, zval *frame, zval *span, zend_string *message, zval *error)
{
    zval rv;
    if (frame == NULL || span == NULL) {
        zval *template = frame != NULL
            ? pt_prop(pt_frame_ce, Z_OBJ_P(frame), ZEND_STRL("name"), &rv)
            : pt_prop(pt_context_ce, Z_OBJ_P(context), ZEND_STRL("entryName"), &rv);
        zval args[3];
        ZVAL_STR(&args[0], code);
        ZVAL_COPY_VALUE(&args[1], template);
        ZVAL_STR(&args[2], message);
        zend_function *fn = zend_hash_str_find_ptr(&pt_error_ce->function_table, ZEND_STRL("withoutposition"));
        zend_call_known_function(fn, NULL, pt_error_ce, error, 3, args, NULL);
        return;
    }

    zval *start = zend_hash_index_find(Z_ARRVAL_P(span), 0);
    zval *end = zend_hash_index_find(Z_ARRVAL_P(span), 1);
    if (start == NULL || end == NULL || Z_TYPE_P(start) != IS_LONG || Z_TYPE_P(end) != IS_LONG) {
        zend_throw_error(NULL, "a span holds the start and the end byte offset");
        ZVAL_NULL(error);
        return;
    }
    zval *name = pt_prop(pt_frame_ce, Z_OBJ_P(frame), ZEND_STRL("name"), &rv);
    zval *lines = pt_prop(pt_frame_ce, Z_OBJ_P(frame), ZEND_STRL("lines"), &rv);
    zval args[6];
    ZVAL_STR(&args[0], code);
    ZVAL_COPY_VALUE(&args[1], name);
    ZVAL_COPY_VALUE(&args[2], lines);
    ZVAL_COPY_VALUE(&args[3], start);
    ZVAL_COPY_VALUE(&args[4], end);
    ZVAL_STR(&args[5], message);
    zend_function *fn = zend_hash_str_find_ptr(&pt_error_ce->function_table, ZEND_STRL("at"));
    zend_call_known_function(fn, NULL, pt_error_ce, error, 6, args, NULL);
}

/* Throws the TemplateError of a failure (`throw $this->fail(...)`). */
void pt_context_throw(zval *context, const char *code, zval *frame, zval *span, zend_string *message)
{
    zend_string *code_str = zend_string_init(code, strlen(code), 0);
    zval error;
    pt_context_error(context, code_str, frame, span, message, &error);
    zend_string_release(code_str);
    if (EG(exception)) {
        return;
    }
    zend_throw_exception_object(&error);
}

/* The frame and the span of the current position, NULL when the position is unknown. */
static void pt_context_position(zval *context, zval **frame, zval **span)
{
    zval rv;
    zval *current = pt_prop(pt_context_ce, Z_OBJ_P(context), ZEND_STRL("currentFrame"), &rv);
    *frame = Z_TYPE_P(current) == IS_OBJECT ? current : NULL;
    *span = pt_prop(pt_context_ce, Z_OBJ_P(context), ZEND_STRL("currentSpan"), &rv);
}

void pt_context_write(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *text;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(text)
    ZEND_PARSE_PARAMETERS_END();
    if (ZSTR_LEN(text) == 0) {
        return;
    }
    zval *context = ZEND_THIS;
    zend_object *object = Z_OBJ_P(context);

    zval rv;
    zend_long written = zval_get_long(pt_prop(pt_context_ce, object, ZEND_STRL("outputBytes"), &rv)) + (zend_long)ZSTR_LEN(text);
    zval total;
    ZVAL_LONG(&total, written);
    zend_update_property(pt_context_ce, object, ZEND_STRL("outputBytes"), &total);

    zend_long limit;
    if (!pt_context_limit(context, ZEND_STRL("outputBytes"), &limit)) {
        return;
    }
    if (written > limit) {
        zend_string *message = zend_strpprintf(0, "output exceeds " ZEND_LONG_FMT " bytes", limit);
        zval *frame, *span;
        pt_context_position(context, &frame, &span);
        pt_context_throw(context, PT_E_RUNTIME_LIMIT, frame, span, message);
        zend_string_release(message);
        return;
    }

    zval *output = pt_prop(pt_context_ce, object, ZEND_STRL("output"), &rv);
    zend_string *joined = zend_string_concat2(Z_STRVAL_P(output), Z_STRLEN_P(output), ZSTR_VAL(text), ZSTR_LEN(text));
    zend_update_property_str(pt_context_ce, object, ZEND_STRL("output"), joined);
    zend_string_release(joined);
}

void pt_context_output(INTERNAL_FUNCTION_PARAMETERS)
{
    ZEND_PARSE_PARAMETERS_NONE();
    zval rv;
    RETURN_COPY_DEREF(pt_prop(pt_context_ce, Z_OBJ_P(ZEND_THIS), ZEND_STRL("output"), &rv));
}

void pt_context_at(INTERNAL_FUNCTION_PARAMETERS)
{
    zval *frame, *span;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_OBJECT_OF_CLASS(frame, pt_frame_ce)
        Z_PARAM_ARRAY(span)
    ZEND_PARSE_PARAMETERS_END();
    zend_update_property(pt_context_ce, Z_OBJ_P(ZEND_THIS), ZEND_STRL("currentFrame"), frame);
    zend_update_property(pt_context_ce, Z_OBJ_P(ZEND_THIS), ZEND_STRL("currentSpan"), span);
}

void pt_context_fail(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *code, *message;
    zval *frame = NULL, *span = NULL;
    ZEND_PARSE_PARAMETERS_START(4, 4)
        Z_PARAM_STR(code)
        Z_PARAM_OBJECT_OF_CLASS_OR_NULL(frame, pt_frame_ce)
        Z_PARAM_ARRAY_OR_NULL(span)
        Z_PARAM_STR(message)
    ZEND_PARSE_PARAMETERS_END();
    zval error;
    pt_context_error(ZEND_THIS, code, frame, span, message, &error);
    if (EG(exception)) {
        RETURN_THROWS();
    }
    ZVAL_COPY_VALUE(return_value, &error);
}

void pt_context_enter(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *name;
    zval *frame = NULL, *span = NULL;
    ZEND_PARSE_PARAMETERS_START(3, 3)
        Z_PARAM_STR(name)
        Z_PARAM_OBJECT_OF_CLASS_OR_NULL(frame, pt_frame_ce)
        Z_PARAM_ARRAY_OR_NULL(span)
    ZEND_PARSE_PARAMETERS_END();
    zval *context = ZEND_THIS;

    zval rv;
    zval *chain = pt_prop(pt_context_ce, Z_OBJ_P(context), ZEND_STRL("chain"), &rv);
    zval *item;
    ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(chain), item) {
        if (Z_TYPE_P(item) == IS_STRING && zend_string_equals(Z_STR_P(item), name)) {
            zend_string *message = zend_strpprintf(0, "%.*s is already being rendered", (int)ZSTR_LEN(name), ZSTR_VAL(name));
            pt_context_throw(context, PT_E_LOAD_CYCLE, frame, span, message);
            zend_string_release(message);
            return;
        }
    } ZEND_HASH_FOREACH_END();

    zend_long depth;
    if (!pt_context_limit(context, ZEND_STRL("depth"), &depth)) {
        return;
    }
    chain = pt_prop(pt_context_ce, Z_OBJ_P(context), ZEND_STRL("chain"), &rv);
    if ((zend_long)zend_hash_num_elements(Z_ARRVAL_P(chain)) > depth) {
        zend_string *message = zend_strpprintf(0, "nesting depth exceeds " ZEND_LONG_FMT, depth);
        pt_context_throw(context, PT_E_RUNTIME_DEPTH, frame, span, message);
        zend_string_release(message);
        return;
    }

    SEPARATE_ARRAY(chain);
    zval entry;
    ZVAL_STR_COPY(&entry, name);
    zend_hash_next_index_insert(Z_ARRVAL_P(chain), &entry);
}

/* Context::leave: array_pop of the chain, which also gives back the next free index of a list. */
void pt_context_leave(INTERNAL_FUNCTION_PARAMETERS)
{
    ZEND_PARSE_PARAMETERS_NONE();
    zval rv;
    zval *chain = pt_prop(pt_context_ce, Z_OBJ_P(ZEND_THIS), ZEND_STRL("chain"), &rv);
    if (zend_hash_num_elements(Z_ARRVAL_P(chain)) == 0) {
        return;
    }
    SEPARATE_ARRAY(chain);
    HashTable *ht = Z_ARRVAL_P(chain);
    zend_ulong last = 0;
    zend_string *key = NULL;
    ZEND_HASH_REVERSE_FOREACH_KEY(ht, last, key) {
        break;
    } ZEND_HASH_FOREACH_END();
    if (key != NULL) {
        zend_hash_del(ht, key);
    } else {
        zend_hash_index_del(ht, last);
        if ((zend_long)last == ht->nNextFreeElement - 1) {
            ht->nNextFreeElement = (zend_long)last;
        }
    }
}
