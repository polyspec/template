/*
 * Evaluator and Renderer of the library (S10): the expression evaluation and the statement rendering of
 * Polyspec\Template\Render (docs/spec/expressions.md, docs/spec/runtime.md). Each step is the step of the library
 * class: a value operation is the method of RuntimeBindings that the library calls, a render state is the method or
 * the property of Scope, Context, Frame or MapValue, and a template is loaded by AstProgram::loadTemplate. The state
 * that the library keeps in private properties (the depth, the scope, the context and the program) lives in the
 * object. A failure is thrown where the library throws it; a PHP exception of a called method passes unchanged.
 */
#include "pt.h"
#include "Zend/zend_exceptions.h"
#include "Zend/zend_interfaces.h"

typedef struct pt_evaluator {
    zend_long depth;
    zval scope;
    zval context;
    zend_object std;
} pt_evaluator;

typedef struct pt_renderer {
    zval context;
    zval program;
    zval evaluator;
    zend_object std;
} pt_renderer;

static zend_class_entry *pt_evaluator_ce, *pt_renderer_ce, *pt_runtime_bindings_ce, *pt_scope_ce, *pt_path_ce, *pt_program_ce;
static zend_object_handlers pt_evaluator_handlers, pt_renderer_handlers;

static inline pt_evaluator *pt_evaluator_of(zend_object *object)
{
    return (pt_evaluator *)((char *)object - XtOffsetOf(pt_evaluator, std));
}

static inline pt_renderer *pt_renderer_of(zend_object *object)
{
    return (pt_renderer *)((char *)object - XtOffsetOf(pt_renderer, std));
}

static zend_object *pt_evaluator_create(zend_class_entry *ce)
{
    pt_evaluator *evaluator = zend_object_alloc(sizeof(pt_evaluator), ce);
    zend_object_std_init(&evaluator->std, ce);
    object_properties_init(&evaluator->std, ce);
    evaluator->depth = 0;
    ZVAL_NULL(&evaluator->scope);
    ZVAL_NULL(&evaluator->context);
    evaluator->std.handlers = &pt_evaluator_handlers;
    return &evaluator->std;
}

static void pt_evaluator_free(zend_object *object)
{
    pt_evaluator *evaluator = pt_evaluator_of(object);
    zval_ptr_dtor(&evaluator->scope);
    zval_ptr_dtor(&evaluator->context);
    zend_object_std_dtor(object);
}

static HashTable *pt_evaluator_get_gc(zend_object *object, zval **table, int *count)
{
    pt_evaluator *evaluator = pt_evaluator_of(object);
    zend_get_gc_buffer *buffer = zend_get_gc_buffer_create();
    zend_get_gc_buffer_add_zval(buffer, &evaluator->scope);
    zend_get_gc_buffer_add_zval(buffer, &evaluator->context);
    zend_get_gc_buffer_use(buffer, table, count);
    return zend_std_get_properties(object);
}

static zend_object *pt_renderer_create(zend_class_entry *ce)
{
    pt_renderer *renderer = zend_object_alloc(sizeof(pt_renderer), ce);
    zend_object_std_init(&renderer->std, ce);
    object_properties_init(&renderer->std, ce);
    ZVAL_NULL(&renderer->context);
    ZVAL_NULL(&renderer->program);
    ZVAL_NULL(&renderer->evaluator);
    renderer->std.handlers = &pt_renderer_handlers;
    return &renderer->std;
}

static void pt_renderer_free(zend_object *object)
{
    pt_renderer *renderer = pt_renderer_of(object);
    zval_ptr_dtor(&renderer->context);
    zval_ptr_dtor(&renderer->program);
    zval_ptr_dtor(&renderer->evaluator);
    zend_object_std_dtor(object);
}

static HashTable *pt_renderer_get_gc(zend_object *object, zval **table, int *count)
{
    pt_renderer *renderer = pt_renderer_of(object);
    zend_get_gc_buffer *buffer = zend_get_gc_buffer_create();
    zend_get_gc_buffer_add_zval(buffer, &renderer->context);
    zend_get_gc_buffer_add_zval(buffer, &renderer->program);
    zend_get_gc_buffer_add_zval(buffer, &renderer->evaluator);
    zend_get_gc_buffer_use(buffer, table, count);
    return zend_std_get_properties(object);
}

void pt_render_classes_register(zend_class_entry *evaluator, zend_class_entry *renderer, zend_class_entry *runtime_bindings,
                                zend_class_entry *scope, zend_class_entry *path, zend_class_entry *program)
{
    pt_evaluator_ce = evaluator;
    pt_renderer_ce = renderer;
    pt_runtime_bindings_ce = runtime_bindings;
    pt_scope_ce = scope;
    pt_path_ce = path;
    pt_program_ce = program;

    evaluator->create_object = pt_evaluator_create;
    memcpy(&pt_evaluator_handlers, zend_get_std_object_handlers(), sizeof(zend_object_handlers));
    pt_evaluator_handlers.offset = XtOffsetOf(pt_evaluator, std);
    pt_evaluator_handlers.free_obj = pt_evaluator_free;
    pt_evaluator_handlers.clone_obj = NULL;
    pt_evaluator_handlers.get_gc = pt_evaluator_get_gc;

    renderer->create_object = pt_renderer_create;
    memcpy(&pt_renderer_handlers, zend_get_std_object_handlers(), sizeof(zend_object_handlers));
    pt_renderer_handlers.offset = XtOffsetOf(pt_renderer, std);
    pt_renderer_handlers.free_obj = pt_renderer_free;
    pt_renderer_handlers.clone_obj = NULL;
    pt_renderer_handlers.get_gc = pt_renderer_get_gc;
}

/* ----------------------------------------------------------------------------------------------- */
/* Helpers: PHP arrays, properties, method calls and the exception of a finally                     */
/* ----------------------------------------------------------------------------------------------- */

/* The value under a key of a PHP array, dereferenced; the null value when the key is missing. */
static zval *field(zval *array, const char *key, size_t length)
{
    zval *value = zend_hash_str_find(Z_ARRVAL_P(array), key, length);
    if (value == NULL) {
        return &EG(uninitialized_zval);
    }
    ZVAL_DEREF(value);
    return value;
}

#define FIELD(array, literal) field((array), literal, sizeof(literal) - 1)

/* The value at an index of a PHP array, dereferenced; the null value when the index is missing. */
static zval *element(zval *array, zend_ulong index)
{
    zval *value = zend_hash_index_find(Z_ARRVAL_P(array), index);
    if (value == NULL) {
        return &EG(uninitialized_zval);
    }
    ZVAL_DEREF(value);
    return value;
}

/* isset: the value is present and is not null. */
static bool is_set(zval *value)
{
    return value != NULL && Z_TYPE_P(value) != IS_NULL;
}

#define IS_STR(value, literal) (Z_TYPE_P(value) == IS_STRING && zend_string_equals_literal(Z_STR_P(value), literal))

/* A declared property of an object, dereferenced: the slot itself, read without a notice. */
static zval *prop(zend_class_entry *ce, zend_object *object, const char *name, size_t length, zval *rv)
{
    zval *value = zend_read_property(ce, object, name, length, 1, rv);
    ZVAL_DEREF(value);
    return value;
}

/* `$object->name(...)` of a final class of the extension: the result is set in `result` (null first), and the
 * caller checks EG(exception). `name` is the method name in lower case. */
static void call_method(zval *object, const char *name, size_t length, zval *result, uint32_t count, zval *args)
{
    pt_call_method(Z_OBJCE_P(object), Z_OBJ_P(object), name, length, result, count, args);
}

/* `Class::name(...)` of a static method of a class of the extension. */
static void call_static(zend_class_entry *ce, const char *name, size_t length, zval *result, uint32_t count, zval *args)
{
    pt_call_method(ce, NULL, name, length, result, count, args);
}

/* `new $ce(...)`: the object is set in `object`, and its constructor gets the arguments. */
static void new_object(zend_class_entry *ce, zval *object, uint32_t count, zval *args)
{
    object_init_ex(object, ce);
    if (ce->constructor != NULL) {
        zend_call_known_function(ce->constructor, Z_OBJ_P(object), ce, NULL, count, args, NULL);
    }
}

/* A PHP exception that a finally must not see while it runs: it is taken away and given back after the finally, which
 * keeps the exception of the finally as the one thrown (with the first one as its previous). */
static zend_object *suspend_exception(void)
{
    zend_object *pending = EG(exception);
    EG(exception) = NULL;
    return pending;
}

static void resume_exception(zend_object *pending)
{
    if (pending == NULL) {
        return;
    }
    if (EG(exception) != NULL) {
        zend_exception_set_previous(EG(exception), pending);
    } else {
        EG(exception) = pending;
    }
}

/* `$this->runtime->truthy($value)`. */
static bool truthy(zval *runtime, zval *value)
{
    zval result, args[1];
    ZVAL_COPY_VALUE(&args[0], value);
    call_method(runtime, ZEND_STRL("truthy"), &result, 1, args);
    return Z_TYPE(result) == IS_TRUE;
}

/* ----------------------------------------------------------------------------------------------- */
/* Evaluator                                                                                        */
/* ----------------------------------------------------------------------------------------------- */

static zval *evaluator_runtime(pt_evaluator *self)
{
    zval rv;
    return prop(pt_evaluator_ce, &self->std, ZEND_STRL("runtime"), &rv);
}

/* `throw $this->runtime->error($frame, $span, $code, $message)`. The message is released. */
static void evaluator_fail(pt_evaluator *self, zval *frame, zval *span, const char *code, zend_string *message)
{
    zval args[4], error;
    ZVAL_COPY_VALUE(&args[0], frame);
    ZVAL_COPY_VALUE(&args[1], span);
    ZVAL_STRING(&args[2], code);
    ZVAL_STR(&args[3], message);
    call_method(evaluator_runtime(self), ZEND_STRL("error"), &error, 4, args);
    zval_ptr_dtor(&args[2]);
    zval_ptr_dtor(&args[3]);
    if (EG(exception)) {
        zval_ptr_dtor(&error);
        return;
    }
    zend_throw_exception_object(&error);
}

/* Replaces the scope that the evaluator reads. */
static void evaluator_set_scope(pt_evaluator *self, zval *scope)
{
    zval old;
    ZVAL_COPY_VALUE(&old, &self->scope);
    ZVAL_COPY(&self->scope, scope);
    zval_ptr_dtor(&old);
}

static void evaluate(pt_evaluator *self, zval *expr, zval *frame, zval *result);

/* The values of the argument nodes, in order, as a PHP list (array_map of the library). */
static void evaluate_list(pt_evaluator *self, zval *nodes, zval *frame, zval *list)
{
    zval *node;
    array_init(list);
    ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(nodes), node) {
        zval value;
        evaluate(self, node, frame, &value);
        if (EG(exception)) {
            return;
        }
        add_next_index_zval(list, &value);
    } ZEND_HASH_FOREACH_END();
}

static void eval_loop_meta(pt_evaluator *self, zval *expr, zval *frame, zval *result)
{
    zval *span = FIELD(expr, "span");
    zval *loop = FIELD(expr, "loop");
    zval meta, args[1];
    ZVAL_COPY_VALUE(&args[0], loop);
    call_method(&self->scope, ZEND_STRL("loopmeta"), &meta, 1, args);
    if (EG(exception)) {
        zval_ptr_dtor(&meta);
        return;
    }
    if (Z_TYPE(meta) == IS_NULL) {
        zend_string *message = zend_strpprintf(0, "%.*s is not an active loop variable", (int)Z_STRLEN_P(loop), Z_STRVAL_P(loop));
        evaluator_fail(self, frame, span, PT_E_RUNTIME_UNKNOWN_LOOP, message);
        return;
    }
    zval *field_name = FIELD(expr, "field");
    if (IS_STR(field_name, "index_")) {
        ZVAL_DOUBLE(result, zval_get_double(field(&meta, "index", 5)));
    } else if (IS_STR(field_name, "key_")) {
        ZVAL_COPY(result, field(&meta, "key", 3));
    } else if (IS_STR(field_name, "value_")) {
        ZVAL_COPY(result, field(&meta, "value", 5));
    } else if (IS_STR(field_name, "first_")) {
        ZVAL_COPY(result, field(&meta, "first", 5));
    } else if (IS_STR(field_name, "last_")) {
        ZVAL_COPY(result, field(&meta, "last", 4));
    } else if (IS_STR(field_name, "size_")) {
        ZVAL_DOUBLE(result, zval_get_double(field(&meta, "size", 4)));
    } else {
        zend_throw_error(zend_ce_unhandled_match_error, "Unhandled match case %.*s", (int)Z_STRLEN_P(field_name), Z_STRVAL_P(field_name));
    }
    zval_ptr_dtor(&meta);
}

static void eval_member(pt_evaluator *self, zval *expr, zval *frame, zval *result)
{
    zval object, args[4];
    evaluate(self, FIELD(expr, "object"), frame, &object);
    if (!EG(exception)) {
        ZVAL_COPY_VALUE(&args[0], &object);
        ZVAL_COPY_VALUE(&args[1], FIELD(expr, "key"));
        ZVAL_COPY_VALUE(&args[2], frame);
        ZVAL_COPY_VALUE(&args[3], FIELD(expr, "span"));
        call_method(evaluator_runtime(self), ZEND_STRL("member"), result, 4, args);
    }
    zval_ptr_dtor(&object);
}

static void eval_member_call(pt_evaluator *self, zval *expr, zval *frame, zval *result)
{
    zval list, object, args[5];
    evaluate_list(self, FIELD(expr, "args"), frame, &list);
    if (!EG(exception)) {
        evaluate(self, FIELD(expr, "object"), frame, &object);
        if (!EG(exception)) {
            ZVAL_COPY_VALUE(&args[0], &object);
            ZVAL_COPY_VALUE(&args[1], FIELD(expr, "method"));
            ZVAL_COPY_VALUE(&args[2], &list);
            ZVAL_COPY_VALUE(&args[3], frame);
            ZVAL_COPY_VALUE(&args[4], FIELD(expr, "span"));
            call_method(evaluator_runtime(self), ZEND_STRL("membercall"), result, 5, args);
        }
        zval_ptr_dtor(&object);
    }
    zval_ptr_dtor(&list);
}

static void eval_class_call(pt_evaluator *self, zval *expr, zval *frame, zval *result)
{
    zval list, args[5];
    evaluate_list(self, FIELD(expr, "args"), frame, &list);
    if (!EG(exception)) {
        ZVAL_COPY_VALUE(&args[0], FIELD(expr, "className"));
        ZVAL_COPY_VALUE(&args[1], FIELD(expr, "method"));
        ZVAL_COPY_VALUE(&args[2], &list);
        ZVAL_COPY_VALUE(&args[3], frame);
        ZVAL_COPY_VALUE(&args[4], FIELD(expr, "span"));
        call_method(evaluator_runtime(self), ZEND_STRL("classcall"), result, 5, args);
    }
    zval_ptr_dtor(&list);
}

static void eval_index(pt_evaluator *self, zval *expr, zval *frame, zval *result)
{
    zval object, key, args[4];
    evaluate(self, FIELD(expr, "object"), frame, &object);
    if (!EG(exception)) {
        evaluate(self, FIELD(expr, "index"), frame, &key);
        if (!EG(exception)) {
            ZVAL_COPY_VALUE(&args[0], &object);
            ZVAL_COPY_VALUE(&args[1], &key);
            ZVAL_COPY_VALUE(&args[2], frame);
            ZVAL_COPY_VALUE(&args[3], FIELD(expr, "span"));
            call_method(evaluator_runtime(self), ZEND_STRL("index"), result, 4, args);
        }
        zval_ptr_dtor(&key);
    }
    zval_ptr_dtor(&object);
}

static void eval_call(pt_evaluator *self, zval *expr, zval *frame, zval *result)
{
    zval list, args[4];
    evaluate_list(self, FIELD(expr, "args"), frame, &list);
    if (!EG(exception)) {
        ZVAL_COPY_VALUE(&args[0], FIELD(expr, "name"));
        ZVAL_COPY_VALUE(&args[1], &list);
        ZVAL_COPY_VALUE(&args[2], frame);
        ZVAL_COPY_VALUE(&args[3], FIELD(expr, "span"));
        call_method(evaluator_runtime(self), ZEND_STRL("call"), result, 4, args);
    }
    zval_ptr_dtor(&list);
}

static void eval_unary(pt_evaluator *self, zval *expr, zval *frame, zval *result)
{
    zval operand, args[4];
    evaluate(self, FIELD(expr, "operand"), frame, &operand);
    if (!EG(exception)) {
        ZVAL_COPY_VALUE(&args[0], FIELD(expr, "op"));
        ZVAL_COPY_VALUE(&args[1], &operand);
        ZVAL_COPY_VALUE(&args[2], frame);
        ZVAL_COPY_VALUE(&args[3], FIELD(expr, "span"));
        call_method(evaluator_runtime(self), ZEND_STRL("unary"), result, 4, args);
    }
    zval_ptr_dtor(&operand);
}

/* The short-circuit operators, and the binary operators on two evaluated operands (Evaluator::binary). */
static void eval_binary(pt_evaluator *self, zval *expr, zval *frame, zval *result)
{
    zval *op = FIELD(expr, "op");
    zval left, right, args[5];
    zval *runtime = evaluator_runtime(self);
    bool is_and = IS_STR(op, "&&");
    bool is_or = IS_STR(op, "||");
    bool is_coalesce = IS_STR(op, "??");

    evaluate(self, FIELD(expr, "left"), frame, &left);
    if (EG(exception)) {
        zval_ptr_dtor(&left);
        return;
    }
    if (is_and || is_or) {
        bool first = truthy(runtime, &left);
        zval_ptr_dtor(&left);
        if (EG(exception)) {
            return;
        }
        /* and stops on a false left side and or on a true one; that side is the result. */
        if (first == is_or) {
            ZVAL_BOOL(result, first);
            return;
        }
        evaluate(self, FIELD(expr, "right"), frame, &right);
        if (!EG(exception)) {
            bool second = truthy(runtime, &right);
            if (!EG(exception)) {
                ZVAL_BOOL(result, second);
            }
        }
        zval_ptr_dtor(&right);
        return;
    }
    if (is_coalesce) {
        if (Z_TYPE(left) != IS_NULL) {
            ZVAL_COPY_VALUE(result, &left);
            return;
        }
        zval_ptr_dtor(&left);
        evaluate(self, FIELD(expr, "right"), frame, result);
        return;
    }

    evaluate(self, FIELD(expr, "right"), frame, &right);
    if (!EG(exception)) {
        ZVAL_COPY_VALUE(&args[0], op);
        ZVAL_COPY_VALUE(&args[1], &left);
        ZVAL_COPY_VALUE(&args[2], &right);
        ZVAL_COPY_VALUE(&args[3], frame);
        ZVAL_COPY_VALUE(&args[4], FIELD(expr, "span"));
        call_method(runtime, ZEND_STRL("binary"), result, 5, args);
    }
    zval_ptr_dtor(&right);
    zval_ptr_dtor(&left);
}

static void eval_ternary(pt_evaluator *self, zval *expr, zval *frame, zval *result)
{
    zval *then = FIELD(expr, "then");
    zval test;
    evaluate(self, FIELD(expr, "test"), frame, &test);
    if (EG(exception)) {
        zval_ptr_dtor(&test);
        return;
    }
    bool holds = truthy(evaluator_runtime(self), &test);
    if (EG(exception)) {
        zval_ptr_dtor(&test);
        return;
    }
    if (Z_TYPE_P(then) == IS_NULL) {
        if (holds) {
            ZVAL_COPY(result, &test);
        } else {
            evaluate(self, FIELD(expr, "else"), frame, result);
        }
    } else if (holds) {
        evaluate(self, then, frame, result);
    } else {
        evaluate(self, FIELD(expr, "else"), frame, result);
    }
    zval_ptr_dtor(&test);
}

static void eval_list(pt_evaluator *self, zval *expr, zval *frame, zval *result)
{
    zval list, args[3];
    zval *items = FIELD(expr, "items");
    zval *item;
    array_init(&list);
    ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(items), item) {
        if (IS_STR(FIELD(item, "type"), "Spread")) {
            zval value, spread;
            ZVAL_NULL(&spread);
            evaluate(self, FIELD(item, "expr"), frame, &value);
            if (!EG(exception)) {
                ZVAL_COPY_VALUE(&args[0], &value);
                ZVAL_COPY_VALUE(&args[1], frame);
                ZVAL_COPY_VALUE(&args[2], FIELD(item, "span"));
                call_method(evaluator_runtime(self), ZEND_STRL("listspread"), &spread, 3, args);
            }
            zval_ptr_dtor(&value);
            if (EG(exception)) {
                zval_ptr_dtor(&spread);
                break;
            }
            zval *element_value;
            ZEND_HASH_FOREACH_VAL(Z_ARRVAL(spread), element_value) {
                zval copy;
                ZVAL_COPY(&copy, element_value);
                add_next_index_zval(&list, &copy);
            } ZEND_HASH_FOREACH_END();
            zval_ptr_dtor(&spread);
        } else {
            zval value;
            evaluate(self, item, frame, &value);
            if (EG(exception)) {
                break;
            }
            add_next_index_zval(&list, &value);
        }
    } ZEND_HASH_FOREACH_END();

    if (!EG(exception)) {
        ZVAL_COPY_VALUE(&args[0], &list);
        ZVAL_COPY_VALUE(&args[1], frame);
        ZVAL_COPY_VALUE(&args[2], FIELD(expr, "span"));
        call_method(evaluator_runtime(self), ZEND_STRL("depth"), result, 3, args);
    }
    zval_ptr_dtor(&list);
}

static void eval_map(pt_evaluator *self, zval *expr, zval *frame, zval *result)
{
    zval map, args[3];
    zval *entries = FIELD(expr, "entries");
    zval *entry;
    object_init_ex(&map, pt_map_value_ce);
    ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(entries), entry) {
        if (is_set(FIELD(entry, "type"))) {
            zval value, spread, pairs;
            ZVAL_NULL(&spread);
            ZVAL_NULL(&pairs);
            evaluate(self, FIELD(entry, "expr"), frame, &value);
            if (!EG(exception)) {
                ZVAL_COPY_VALUE(&args[0], &value);
                ZVAL_COPY_VALUE(&args[1], frame);
                ZVAL_COPY_VALUE(&args[2], FIELD(entry, "span"));
                call_method(evaluator_runtime(self), ZEND_STRL("mapspread"), &spread, 3, args);
            }
            zval_ptr_dtor(&value);
            if (!EG(exception)) {
                call_method(&spread, ZEND_STRL("entries"), &pairs, 0, NULL);
            }
            if (!EG(exception)) {
                zval *pair;
                ZEND_HASH_FOREACH_VAL(Z_ARRVAL(pairs), pair) {
                    zval ignored, set_args[2];
                    ZVAL_COPY_VALUE(&set_args[0], element(pair, 0));
                    ZVAL_COPY_VALUE(&set_args[1], element(pair, 1));
                    call_method(&map, ZEND_STRL("set"), &ignored, 2, set_args);
                    zval_ptr_dtor(&ignored);
                    if (EG(exception)) {
                        break;
                    }
                } ZEND_HASH_FOREACH_END();
            }
            zval_ptr_dtor(&pairs);
            zval_ptr_dtor(&spread);
        } else {
            zval key, text, item_value, ignored, set_args[2];
            evaluate(self, FIELD(entry, "key"), frame, &key);
            if (!EG(exception)) {
                ZVAL_COPY_VALUE(&args[0], &key);
                ZVAL_COPY_VALUE(&args[1], frame);
                ZVAL_COPY_VALUE(&args[2], FIELD(FIELD(entry, "key"), "span"));
                call_method(evaluator_runtime(self), ZEND_STRL("stringify"), &text, 3, args);
            }
            zval_ptr_dtor(&key);
            if (!EG(exception)) {
                evaluate(self, FIELD(entry, "value"), frame, &item_value);
            }
            if (!EG(exception)) {
                ZVAL_COPY_VALUE(&set_args[0], &text);
                ZVAL_COPY_VALUE(&set_args[1], &item_value);
                call_method(&map, ZEND_STRL("set"), &ignored, 2, set_args);
                zval_ptr_dtor(&ignored);
            }
            zval_ptr_dtor(&item_value);
            zval_ptr_dtor(&text);
        }
        if (EG(exception)) {
            break;
        }
    } ZEND_HASH_FOREACH_END();

    if (!EG(exception)) {
        ZVAL_COPY_VALUE(&args[0], &map);
        ZVAL_COPY_VALUE(&args[1], frame);
        ZVAL_COPY_VALUE(&args[2], FIELD(expr, "span"));
        call_method(evaluator_runtime(self), ZEND_STRL("depth"), result, 3, args);
    }
    zval_ptr_dtor(&map);
}

/* Evaluator::evaluateNode: the node of an expression, as the library's switch reads it. */
static void evaluate_node(pt_evaluator *self, zval *expr, zval *frame, zval *result)
{
    zval *type = FIELD(expr, "type");
    if (IS_STR(type, "Literal")) {
        ZVAL_COPY(result, FIELD(expr, "value"));
    } else if (IS_STR(type, "Var")) {
        zval args[2];
        ZVAL_COPY_VALUE(&args[0], frame);
        ZVAL_COPY_VALUE(&args[1], FIELD(expr, "name"));
        call_method(&self->scope, ZEND_STRL("lookup"), result, 2, args);
    } else if (IS_STR(type, "LoopMeta")) {
        eval_loop_meta(self, expr, frame, result);
    } else if (IS_STR(type, "Member")) {
        eval_member(self, expr, frame, result);
    } else if (IS_STR(type, "MemberCall")) {
        eval_member_call(self, expr, frame, result);
    } else if (IS_STR(type, "ClassCall")) {
        eval_class_call(self, expr, frame, result);
    } else if (IS_STR(type, "Index")) {
        eval_index(self, expr, frame, result);
    } else if (IS_STR(type, "Call")) {
        eval_call(self, expr, frame, result);
    } else if (IS_STR(type, "Unary")) {
        eval_unary(self, expr, frame, result);
    } else if (IS_STR(type, "Binary")) {
        eval_binary(self, expr, frame, result);
    } else if (IS_STR(type, "Ternary")) {
        eval_ternary(self, expr, frame, result);
    } else if (IS_STR(type, "List")) {
        eval_list(self, expr, frame, result);
    } else if (IS_STR(type, "Map")) {
        eval_map(self, expr, frame, result);
    } else {
        zend_string *message = zend_strpprintf(0, "unknown expression node %.*s", (int)Z_STRLEN_P(type), Z_STRVAL_P(type));
        evaluator_fail(self, frame, FIELD(expr, "span"), PT_E_RUNTIME_TYPE, message);
    }
}

/* Evaluator::evaluate without a scope: the depth is counted and lowered on every exit of the node. */
static void evaluate(pt_evaluator *self, zval *expr, zval *frame, zval *result)
{
    zval args[4], ignored;
    ZVAL_NULL(result);
    self->depth++;
    ZVAL_STRINGL(&args[0], "expression", sizeof("expression") - 1);
    ZVAL_LONG(&args[1], self->depth);
    ZVAL_COPY_VALUE(&args[2], frame);
    ZVAL_COPY_VALUE(&args[3], FIELD(expr, "span"));
    call_method(evaluator_runtime(self), ZEND_STRL("limit"), &ignored, 4, args);
    zval_ptr_dtor(&args[0]);
    zval_ptr_dtor(&ignored);
    if (EG(exception)) {
        if (instanceof_function(EG(exception)->ce, pt_error_ce)) {
            self->depth--;
        }
        return;
    }
    evaluate_node(self, expr, frame, result);
    self->depth--;
}

/* Evaluator::evaluate with a scope: the scope is kept for the later calls, as the library does. */
static void evaluate_in(pt_evaluator *self, zval *expr, zval *frame, zval *scope, zval *result)
{
    if (scope != NULL) {
        evaluator_set_scope(self, scope);
    }
    evaluate(self, expr, frame, result);
}

void pt_evaluator_construct(INTERNAL_FUNCTION_PARAMETERS)
{
    zval *context;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_OBJECT_OF_CLASS(context, pt_context_ce)
    ZEND_PARSE_PARAMETERS_END();
    pt_evaluator *self = pt_evaluator_of(Z_OBJ_P(ZEND_THIS));
    ZVAL_COPY(&self->context, context);
    zval runtime;
    new_object(pt_runtime_bindings_ce, &runtime, 1, context);
    zend_update_property(pt_evaluator_ce, Z_OBJ_P(ZEND_THIS), ZEND_STRL("runtime"), &runtime);
    zval_ptr_dtor(&runtime);
    new_object(pt_scope_ce, &self->scope, 0, NULL);
}

void pt_evaluator_evaluate(INTERNAL_FUNCTION_PARAMETERS)
{
    zval *expr, *frame, *scope = NULL;
    ZEND_PARSE_PARAMETERS_START(2, 3)
        Z_PARAM_ARRAY(expr)
        Z_PARAM_OBJECT_OF_CLASS(frame, pt_frame_ce)
        Z_PARAM_OPTIONAL
        Z_PARAM_OBJECT_OF_CLASS_OR_NULL(scope, pt_scope_ce)
    ZEND_PARSE_PARAMETERS_END();
    pt_evaluator *self = pt_evaluator_of(Z_OBJ_P(ZEND_THIS));
    zval result;
    evaluate_in(self, expr, frame, scope, &result);
    if (EG(exception)) {
        zval_ptr_dtor(&result);
        RETURN_THROWS();
    }
    ZVAL_COPY_VALUE(return_value, &result);
}

/* ----------------------------------------------------------------------------------------------- */
/* Renderer                                                                                         */
/* ----------------------------------------------------------------------------------------------- */

static zval *renderer_runtime(pt_renderer *self)
{
    zval rv;
    return prop(pt_evaluator_ce, Z_OBJ_P(&self->evaluator), ZEND_STRL("runtime"), &rv);
}

/* `throw $this->context->fail(...)`: the message is released. */
static void renderer_throw(pt_renderer *self, const char *code, zval *frame, zval *span, zend_string *message)
{
    pt_context_throw(&self->context, code, frame, span, message);
    zend_string_release(message);
}

/* `$this->context->write($text)`. */
static void write_text(pt_renderer *self, zval *text)
{
    zval ignored, args[1];
    ZVAL_COPY_VALUE(&args[0], text);
    call_method(&self->context, ZEND_STRL("write"), &ignored, 1, args);
    zval_ptr_dtor(&ignored);
}

/* `$this->context->registry[$id] ?? null`: the entry, or NULL when it is missing. */
static zval *registry_find(pt_renderer *self, zval *id)
{
    zval rv;
    zval *registry = prop(pt_context_ce, Z_OBJ_P(&self->context), ZEND_STRL("registry"), &rv);
    zval *found = zend_symtable_find(Z_ARRVAL_P(registry), Z_STR_P(id));
    if (found != NULL) {
        ZVAL_DEREF(found);
    }
    return found;
}

/* `$this->context->registry[$id] = $entry`. */
static void registry_store(pt_renderer *self, zval *id, zval *entry)
{
    zval rv, copy;
    zval *registry = prop(pt_context_ce, Z_OBJ_P(&self->context), ZEND_STRL("registry"), &rv);
    SEPARATE_ARRAY(registry);
    ZVAL_COPY(&copy, entry);
    zend_symtable_update(Z_ARRVAL_P(registry), Z_STR_P(id), &copy);
}

/* The loop stack of a name: `$scope->loops[$name] ?? []`, as a copy. */
static void loop_stack(zval *loops, zval *name, zval *stack)
{
    zval rv, offset;
    ZVAL_COPY_VALUE(&offset, name);
    zval *found = Z_OBJ_HT_P(loops)->read_dimension(Z_OBJ_P(loops), &offset, BP_VAR_IS, &rv);
    if (found == NULL || Z_TYPE_P(found) == IS_NULL) {
        array_init(stack);
    } else {
        ZVAL_COPY(stack, found);
    }
    if (found == &rv) {
        zval_ptr_dtor(&rv);
    }
}

/* `$scope->loops[$name] = $stack`. */
static void loop_store(zval *loops, zval *name, zval *stack)
{
    Z_OBJ_HT_P(loops)->write_dimension(Z_OBJ_P(loops), name, stack);
}

static void render_nodes(pt_renderer *self, zval *nodes, zval *frame, zval *scope);

/* `$this->context->enter(...)` is before the try of an include or a block; this runs the try and the finally of
 * the template: the frame of the template (with `map` as its context) and the scope (a new Scope when NULL). */
static void render_template(pt_renderer *self, zval *template, zval *map, zval *scope)
{
    zval *ast = FIELD(template, "ast");
    zval included, local_scope, ctor[3], ignored;
    zend_object *pending;
    ZVAL_NULL(&local_scope);
    ZVAL_COPY_VALUE(&ctor[0], FIELD(ast, "name"));
    ZVAL_COPY_VALUE(&ctor[1], FIELD(template, "lines"));
    ZVAL_COPY_VALUE(&ctor[2], map);
    new_object(pt_frame_ce, &included, 3, ctor);
    if (!EG(exception) && scope == NULL) {
        new_object(pt_scope_ce, &local_scope, 0, NULL);
        scope = &local_scope;
    }
    if (!EG(exception)) {
        render_nodes(self, FIELD(ast, "body"), &included, scope);
    }
    pending = suspend_exception();
    call_method(&self->context, ZEND_STRL("leave"), &ignored, 0, NULL);
    zval_ptr_dtor(&ignored);
    resume_exception(pending);
    zval_ptr_dtor(&local_scope);
    zval_ptr_dtor(&included);
}

/* Renderer::resolve: the template name of a path, or the error when it leaves the loader root. */
static void resolve(pt_renderer *self, zval *path, zval *frame, zval *span, zval *name)
{
    zval rv, args[2];
    zval *frame_name = prop(pt_frame_ce, Z_OBJ_P(frame), ZEND_STRL("name"), &rv);
    ZVAL_COPY_VALUE(&args[0], frame_name);
    ZVAL_COPY_VALUE(&args[1], path);
    call_static(pt_path_ce, ZEND_STRL("resolve"), name, 2, args);
    if (EG(exception) || Z_TYPE_P(name) != IS_NULL) {
        return;
    }
    zend_string *quoted = pt_json_quote(Z_STRVAL_P(path), Z_STRLEN_P(path));
    zend_string *message = zend_strpprintf(0, "%s leaves the loader root", ZSTR_VAL(quoted));
    zend_string_release(quoted);
    renderer_throw(self, PT_E_LOAD_OUTSIDE_ROOT, frame, span, message);
}

static void render_include(pt_renderer *self, zval *path, zval *span, zval *frame, zval *scope)
{
    zval name, template, ignored, args[3];
    zval *frame_context;
    zval rv;
    resolve(self, path, frame, span, &name);
    if (EG(exception)) {
        zval_ptr_dtor(&name);
        return;
    }
    ZVAL_COPY_VALUE(&args[0], &name);
    ZVAL_COPY_VALUE(&args[1], frame);
    ZVAL_COPY_VALUE(&args[2], span);
    call_method(&self->program, ZEND_STRL("loadtemplate"), &template, 3, args);
    if (!EG(exception)) {
        call_method(&self->context, ZEND_STRL("enter"), &ignored, 3, args);
        zval_ptr_dtor(&ignored);
        if (!EG(exception)) {
            frame_context = prop(pt_frame_ce, Z_OBJ_P(frame), ZEND_STRL("context"), &rv);
            render_template(self, &template, frame_context, scope);
        }
    }
    zval_ptr_dtor(&template);
    zval_ptr_dtor(&name);
}

/* The entry of a block that is registered without a template: ['template' => $name, 'data' => null]. */
static void make_entry(zval *entry, zval *name)
{
    zval template;
    array_init(entry);
    ZVAL_COPY(&template, name);
    add_assoc_zval_ex(entry, ZEND_STRL("template"), &template);
    add_assoc_null_ex(entry, ZEND_STRL("data"));
}

static void render_block(pt_renderer *self, zval *node, zval *frame, zval *scope)
{
    zval *id = FIELD(node, "id");
    zval *path = FIELD(node, "path");
    zval *span = FIELD(node, "span");
    zval entry, name, data, pairs, template, ignored, args[3], rv;
    zval *entry_data, *html, *items, *item, *pair;

    ZVAL_NULL(&entry);
    ZVAL_NULL(&name);
    ZVAL_NULL(&data);
    ZVAL_NULL(&pairs);
    ZVAL_NULL(&template);

    if (is_set(id) && !is_set(path)) {
        zval *registered = registry_find(self, id);
        if (!is_set(registered)) {
            zend_string *message = zend_strpprintf(0, "define %.*s is not registered", (int)Z_STRLEN_P(id), Z_STRVAL_P(id));
            renderer_throw(self, PT_E_RUNTIME_BLOCK_UNDEFINED, frame, span, message);
            return;
        }
        ZVAL_COPY(&entry, registered);
    } else {
        zval empty_path;
        ZVAL_EMPTY_STRING(&empty_path);
        resolve(self, is_set(path) ? path : &empty_path, frame, span, &name);
        if (EG(exception)) {
            zval_ptr_dtor(&name);
            return;
        }
        if (is_set(id)) {
            zval *registered = registry_find(self, id);
            if (is_set(registered)) {
                zval *template_name = FIELD(registered, "template");
                bool same = Z_TYPE_P(template_name) == IS_STRING && zend_string_equals(Z_STR_P(template_name), Z_STR(name));
                if (is_set(FIELD(registered, "html")) || !same) {
                    zend_string *message = zend_strpprintf(0, "define %.*s is registered with a different template",
                        (int)Z_STRLEN_P(id), Z_STRVAL_P(id));
                    renderer_throw(self, PT_E_RUNTIME_BLOCK_REDEFINED, frame, span, message);
                    zval_ptr_dtor(&name);
                    return;
                }
                ZVAL_COPY(&entry, registered);
            } else {
                make_entry(&entry, &name);
                registry_store(self, id, &entry);
            }
        } else {
            make_entry(&entry, &name);
        }
        zval_ptr_dtor(&name);
    }

    html = FIELD(&entry, "html");
    if (is_set(html)) {
        write_text(self, html);
        zval_ptr_dtor(&entry);
        return;
    }

    call_method(prop(pt_context_ce, Z_OBJ_P(&self->context), ZEND_STRL("rootData"), &rv), ZEND_STRL("copy"), &data, 0, NULL);
    if (EG(exception)) {
        goto done;
    }
    entry_data = FIELD(&entry, "data");
    if (is_set(entry_data)) {
        call_method(entry_data, ZEND_STRL("entries"), &pairs, 0, NULL);
        if (EG(exception)) {
            goto done;
        }
        ZEND_HASH_FOREACH_VAL(Z_ARRVAL(pairs), pair) {
            zval set_args[2];
            ZVAL_COPY_VALUE(&set_args[0], element(pair, 0));
            ZVAL_COPY_VALUE(&set_args[1], element(pair, 1));
            call_method(&data, ZEND_STRL("set"), &ignored, 2, set_args);
            zval_ptr_dtor(&ignored);
            if (EG(exception)) {
                break;
            }
        } ZEND_HASH_FOREACH_END();
        if (EG(exception)) {
            goto done;
        }
    }

    items = FIELD(node, "scope");
    ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(items), item) {
        zval value, set_args[2];
        evaluate_in(pt_evaluator_of(Z_OBJ_P(&self->evaluator)), FIELD(item, "expr"), frame, scope, &value);
        if (!EG(exception)) {
            ZVAL_COPY_VALUE(&set_args[0], FIELD(item, "name"));
            ZVAL_COPY_VALUE(&set_args[1], &value);
            call_method(&data, ZEND_STRL("set"), &ignored, 2, set_args);
            zval_ptr_dtor(&ignored);
        }
        zval_ptr_dtor(&value);
        if (EG(exception)) {
            break;
        }
    } ZEND_HASH_FOREACH_END();
    if (EG(exception)) {
        goto done;
    }

    ZVAL_COPY_VALUE(&args[0], FIELD(&entry, "template"));
    ZVAL_COPY_VALUE(&args[1], frame);
    ZVAL_COPY_VALUE(&args[2], span);
    call_method(&self->program, ZEND_STRL("loadtemplate"), &template, 3, args);
    if (EG(exception)) {
        goto done;
    }
    call_method(&self->context, ZEND_STRL("enter"), &ignored, 3, args);
    zval_ptr_dtor(&ignored);
    if (EG(exception)) {
        goto done;
    }
    render_template(self, &template, &data, NULL);

done:
    zval_ptr_dtor(&template);
    zval_ptr_dtor(&pairs);
    zval_ptr_dtor(&data);
    zval_ptr_dtor(&entry);
}

/* Renderer::renderFor: the loop over the entries of an iterable, with the loop stack and the local restored on every
 * exit (try/finally of the library). */
static bool render_iteration(pt_renderer *self, zval *node, zval *frame, zval *scope, zval *locals, zval *loops,
                             zval *name, zval *stack, zend_long index, zend_long size, zval *pair)
{
    zval rv, ignored, args[4], meta, key, value, next, set_args[2];
    zend_long iterations = zval_get_long(prop(pt_context_ce, Z_OBJ_P(&self->context), ZEND_STRL("iterations"), &rv)) + 1;
    zend_update_property_long(pt_context_ce, Z_OBJ_P(&self->context), ZEND_STRL("iterations"), iterations);

    ZVAL_STRINGL(&args[0], "iteration", sizeof("iteration") - 1);
    ZVAL_LONG(&args[1], iterations);
    ZVAL_COPY_VALUE(&args[2], frame);
    ZVAL_COPY_VALUE(&args[3], FIELD(node, "span"));
    call_method(renderer_runtime(self), ZEND_STRL("limit"), &ignored, 4, args);
    zval_ptr_dtor(&args[0]);
    zval_ptr_dtor(&ignored);
    if (EG(exception)) {
        return false;
    }

    ZVAL_COPY(&key, element(pair, 0));
    ZVAL_COPY(&value, element(pair, 1));
    array_init(&meta);
    add_assoc_long_ex(&meta, ZEND_STRL("index"), index);
    add_assoc_zval_ex(&meta, ZEND_STRL("key"), &key);
    add_assoc_zval_ex(&meta, ZEND_STRL("value"), &value);
    add_assoc_bool_ex(&meta, ZEND_STRL("first"), index == 0);
    add_assoc_bool_ex(&meta, ZEND_STRL("last"), index == size - 1);
    add_assoc_long_ex(&meta, ZEND_STRL("size"), size);

    array_init(&next);
    zval *old;
    ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(stack), old) {
        zval copy;
        ZVAL_COPY(&copy, old);
        zend_hash_next_index_insert(Z_ARRVAL(next), &copy);
    } ZEND_HASH_FOREACH_END();
    zend_hash_next_index_insert(Z_ARRVAL(next), &meta);
    loop_store(loops, name, &next);
    zval_ptr_dtor(&next);

    ZVAL_COPY_VALUE(&set_args[0], name);
    ZVAL_COPY_VALUE(&set_args[1], element(pair, 1));
    call_method(locals, ZEND_STRL("set"), &ignored, 2, set_args);
    zval_ptr_dtor(&ignored);
    if (EG(exception)) {
        return false;
    }
    render_nodes(self, FIELD(node, "body"), frame, scope);
    return EG(exception) == NULL;
}

static void render_for(pt_renderer *self, zval *node, zval *frame, zval *scope)
{
    zval *span = FIELD(node, "span");
    zval *name = FIELD(node, "name");
    zval iterable, entries, has, previous, stack, args[4], ignored;
    zval rv_locals, rv_loops;
    zval *locals, *loops;
    bool had_local;
    zend_ulong index;
    zval *pair;
    zend_object *pending;

    evaluate_in(pt_evaluator_of(Z_OBJ_P(&self->evaluator)), FIELD(node, "iter"), frame, scope, &iterable);
    if (EG(exception)) {
        zval_ptr_dtor(&iterable);
        return;
    }
    ZVAL_COPY_VALUE(&args[0], &iterable);
    ZVAL_COPY_VALUE(&args[1], frame);
    ZVAL_COPY_VALUE(&args[2], span);
    call_method(renderer_runtime(self), ZEND_STRL("entries"), &entries, 3, args);
    zval_ptr_dtor(&iterable);
    if (EG(exception)) {
        zval_ptr_dtor(&entries);
        return;
    }
    if (zend_hash_num_elements(Z_ARRVAL(entries)) == 0) {
        zval *empty = FIELD(node, "empty");
        if (is_set(empty)) {
            render_nodes(self, empty, frame, scope);
        }
        zval_ptr_dtor(&entries);
        return;
    }

    locals = prop(pt_scope_ce, Z_OBJ_P(scope), ZEND_STRL("locals"), &rv_locals);
    loops = prop(pt_scope_ce, Z_OBJ_P(scope), ZEND_STRL("loops"), &rv_loops);
    ZVAL_COPY_VALUE(&args[0], name);
    call_method(locals, ZEND_STRL("has"), &has, 1, args);
    if (EG(exception)) {
        zval_ptr_dtor(&entries);
        return;
    }
    had_local = Z_TYPE(has) == IS_TRUE;
    call_method(locals, ZEND_STRL("get"), &previous, 1, args);
    if (EG(exception)) {
        zval_ptr_dtor(&previous);
        zval_ptr_dtor(&entries);
        return;
    }
    loop_stack(loops, name, &stack);

    zend_long size = zend_hash_num_elements(Z_ARRVAL(entries));
    ZEND_HASH_FOREACH_NUM_KEY_VAL(Z_ARRVAL(entries), index, pair) {
        if (!render_iteration(self, node, frame, scope, locals, loops, name, &stack, (zend_long)index, size, pair)) {
            break;
        }
    } ZEND_HASH_FOREACH_END();

    pending = suspend_exception();
    loop_store(loops, name, &stack);
    ZVAL_COPY_VALUE(&args[0], name);
    ZVAL_COPY_VALUE(&args[1], &previous);
    if (had_local) {
        call_method(locals, ZEND_STRL("set"), &ignored, 2, args);
    } else {
        call_method(locals, ZEND_STRL("remove"), &ignored, 1, args);
    }
    zval_ptr_dtor(&ignored);
    resume_exception(pending);

    zval_ptr_dtor(&stack);
    zval_ptr_dtor(&previous);
    zval_ptr_dtor(&entries);
}

static void render_if(pt_renderer *self, zval *node, zval *frame, zval *scope)
{
    zval *branches = FIELD(node, "branches");
    zval *branch;
    ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(branches), branch) {
        zval test;
        evaluate_in(pt_evaluator_of(Z_OBJ_P(&self->evaluator)), FIELD(branch, "test"), frame, scope, &test);
        if (EG(exception)) {
            zval_ptr_dtor(&test);
            return;
        }
        bool holds = truthy(renderer_runtime(self), &test);
        zval_ptr_dtor(&test);
        if (EG(exception)) {
            return;
        }
        if (holds) {
            render_nodes(self, FIELD(branch, "body"), frame, scope);
            return;
        }
    } ZEND_HASH_FOREACH_END();
    if (is_set(FIELD(node, "else"))) {
        render_nodes(self, FIELD(node, "else"), frame, scope);
    }
}

/* Renderer::renderNode: the statement of a node, after the position of the node is set in the context. */
static void render_node(pt_renderer *self, zval *node, zval *frame, zval *scope)
{
    zval *type = FIELD(node, "type");
    zval ignored, args[2];
    ZVAL_COPY_VALUE(&args[0], frame);
    ZVAL_COPY_VALUE(&args[1], FIELD(node, "span"));
    call_method(&self->context, ZEND_STRL("at"), &ignored, 2, args);
    zval_ptr_dtor(&ignored);
    if (EG(exception)) {
        return;
    }

    if (IS_STR(type, "Text")) {
        write_text(self, FIELD(node, "value"));
    } else if (IS_STR(type, "Echo")) {
        zval *expr = FIELD(node, "expr");
        zval value, escaped, escape_args[3];
        evaluate_in(pt_evaluator_of(Z_OBJ_P(&self->evaluator)), expr, frame, scope, &value);
        if (!EG(exception)) {
            ZVAL_COPY_VALUE(&escape_args[0], &value);
            ZVAL_COPY_VALUE(&escape_args[1], frame);
            ZVAL_COPY_VALUE(&escape_args[2], FIELD(expr, "span"));
            call_method(renderer_runtime(self), ZEND_STRL("escape"), &escaped, 3, escape_args);
            if (!EG(exception)) {
                write_text(self, &escaped);
            }
            zval_ptr_dtor(&escaped);
        }
        zval_ptr_dtor(&value);
    } else if (IS_STR(type, "If")) {
        render_if(self, node, frame, scope);
    } else if (IS_STR(type, "For")) {
        render_for(self, node, frame, scope);
    } else if (IS_STR(type, "Set")) {
        zval value, set_args[2], set_ignored, rv;
        evaluate_in(pt_evaluator_of(Z_OBJ_P(&self->evaluator)), FIELD(node, "expr"), frame, scope, &value);
        if (!EG(exception)) {
            ZVAL_COPY_VALUE(&set_args[0], FIELD(node, "name"));
            ZVAL_COPY_VALUE(&set_args[1], &value);
            call_method(prop(pt_scope_ce, Z_OBJ_P(scope), ZEND_STRL("locals"), &rv), ZEND_STRL("set"), &set_ignored, 2, set_args);
            zval_ptr_dtor(&set_ignored);
        }
        zval_ptr_dtor(&value);
    } else if (IS_STR(type, "Include")) {
        render_include(self, FIELD(node, "path"), FIELD(node, "span"), frame, scope);
    } else if (IS_STR(type, "Block")) {
        render_block(self, node, frame, scope);
    } else if (IS_STR(type, "IfBlock")) {
        zval *id = FIELD(node, "id");
        if (is_set(registry_find(self, id))) {
            render_nodes(self, FIELD(node, "body"), frame, scope);
        } else if (is_set(FIELD(node, "else"))) {
            render_nodes(self, FIELD(node, "else"), frame, scope);
        }
    }
}

static void render_nodes(pt_renderer *self, zval *nodes, zval *frame, zval *scope)
{
    zval *node;
    ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(nodes), node) {
        render_node(self, node, frame, scope);
        if (EG(exception)) {
            break;
        }
    } ZEND_HASH_FOREACH_END();
}

void pt_renderer_construct(INTERNAL_FUNCTION_PARAMETERS)
{
    zval *context, *program;
    ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_OBJECT_OF_CLASS(context, pt_context_ce)
        Z_PARAM_OBJECT_OF_CLASS(program, pt_program_ce)
    ZEND_PARSE_PARAMETERS_END();
    pt_renderer *self = pt_renderer_of(Z_OBJ_P(ZEND_THIS));
    ZVAL_COPY(&self->context, context);
    ZVAL_COPY(&self->program, program);
    new_object(pt_evaluator_ce, &self->evaluator, 1, context);
}

void pt_renderer_render_nodes(INTERNAL_FUNCTION_PARAMETERS)
{
    zval *nodes, *frame, *scope;
    ZEND_PARSE_PARAMETERS_START(3, 3)
        Z_PARAM_ARRAY(nodes)
        Z_PARAM_OBJECT_OF_CLASS(frame, pt_frame_ce)
        Z_PARAM_OBJECT_OF_CLASS(scope, pt_scope_ce)
    ZEND_PARSE_PARAMETERS_END();
    render_nodes(pt_renderer_of(Z_OBJ_P(ZEND_THIS)), nodes, frame, scope);
}
