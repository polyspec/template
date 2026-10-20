/*
 * RuntimeBindings of the library (S10): the value, member, call and limit semantics that AST and generated programs
 * share (docs/spec/runtime.md). Each method is the method of the library class with the same name. A failure is a
 * TemplateError located at the node, as Context::fail makes it; host code follows the library's hostResult (a native
 * TemplateError passes unchanged, any other exception is E_RUNTIME_HOST_FUNCTION at the call), and a failure of a value
 * operation (FunctionError, BindError) becomes the error at the node (the library's guarded). The object holds its
 * Context, which the library keeps in a private property.
 */
#include "pt.h"
#include "Zend/zend_exceptions.h"
#include "Zend/zend_interfaces.h"
#include <math.h>

typedef struct pt_bindings {
    zval context;
    zend_object std;
} pt_bindings;

static zend_object_handlers pt_bindings_handlers;

static inline pt_bindings *pt_bindings_of(zend_object *object)
{
    return (pt_bindings *)((char *)object - XtOffsetOf(pt_bindings, std));
}

/* The Context that the constructor was given. */
#define PT_CONTEXT(self) (&pt_bindings_of(Z_OBJ_P(self))->context)

static zend_object *pt_bindings_create(zend_class_entry *class_type)
{
    pt_bindings *bindings = zend_object_alloc(sizeof(pt_bindings), class_type);
    zend_object_std_init(&bindings->std, class_type);
    object_properties_init(&bindings->std, class_type);
    ZVAL_NULL(&bindings->context);
    bindings->std.handlers = &pt_bindings_handlers;
    return &bindings->std;
}

static void pt_bindings_free(zend_object *object)
{
    zval_ptr_dtor(&pt_bindings_of(object)->context);
    zend_object_std_dtor(object);
}

static HashTable *pt_bindings_get_gc(zend_object *object, zval **table, int *count)
{
    zend_get_gc_buffer *buffer = zend_get_gc_buffer_create();
    zend_get_gc_buffer_add_zval(buffer, &pt_bindings_of(object)->context);
    zend_get_gc_buffer_use(buffer, table, count);
    return zend_std_get_properties(object);
}

void pt_bindings_register(zend_class_entry *ce)
{
    ce->create_object = pt_bindings_create;
    memcpy(&pt_bindings_handlers, zend_get_std_object_handlers(), sizeof(zend_object_handlers));
    pt_bindings_handlers.offset = XtOffsetOf(pt_bindings, std);
    pt_bindings_handlers.free_obj = pt_bindings_free;
    pt_bindings_handlers.clone_obj = NULL;
    pt_bindings_handlers.get_gc = pt_bindings_get_gc;
}

/* ----------------------------------------------------------------------------------------------- */
/* Failures, the services of the context and the bindings of values                                 */
/* ----------------------------------------------------------------------------------------------- */

/* Throws the TemplateError of a failure at a node (`throw $this->error(...)`); the message is released. */
static void pt_throw_at(zval *self, const char *code, zval *frame, zval *span, zend_string *message)
{
    pt_context_throw(PT_CONTEXT(self), code, frame, span, message);
    zend_string_release(message);
}

/* `$this->context->services-><method>(...)`: the services are RuntimeServices, which host code may implement itself,
 * so the method is called. */
static void pt_services_call(zval *self, const char *method, size_t length, uint32_t count, zval *arg1, zval *arg2, zval *retval)
{
    zval rv;
    zval *services = zend_read_property(pt_context_ce, Z_OBJ_P(PT_CONTEXT(self)), ZEND_STRL("services"), 1, &rv);
    ZVAL_NULL(retval);
    zend_call_method(Z_OBJ_P(services), Z_OBJCE_P(services), NULL, method, length, retval, count, arg1, arg2);
}

/* `$this->context->env`: the environment of the render, which the built-in and host functions receive. */
static zval *pt_context_env(zval *self, zval *rv)
{
    return zend_read_property(pt_context_ce, Z_OBJ_P(PT_CONTEXT(self)), ZEND_STRL("env"), 1, rv);
}

/* The library's guarded: a FunctionError or a BindError thrown by a value operation becomes the error at the node; any
 * other exception passes unchanged. */
static void pt_guard(zval *self, zval *frame, zval *span)
{
    zend_object *exception = EG(exception);
    if (exception == NULL
        || (!instanceof_function(exception->ce, pt_function_error_ce) && !instanceof_function(exception->ce, pt_bind_error_ce))) {
        return;
    }
    zval rv;
    zval *code = zend_read_property(exception->ce, exception, ZEND_STRL("errorCode"), 1, &rv);
    zend_string *code_text = zval_get_string(code);
    zend_string *message = pt_take_exception(NULL);
    pt_throw_at(self, ZSTR_VAL(code_text), frame, span, message);
    zend_string_release(code_text);
}

static bool pt_is_collection(zval *value)
{
    ZVAL_DEREF(value);
    return Z_TYPE_P(value) == IS_ARRAY || (Z_TYPE_P(value) == IS_OBJECT && instanceof_function(Z_OBJCE_P(value), pt_map_value_ce));
}

static bool pt_is_map(zval *value)
{
    ZVAL_DEREF(value);
    return Z_TYPE_P(value) == IS_OBJECT && instanceof_function(Z_OBJCE_P(value), pt_map_value_ce);
}

static bool pt_is_safe(zval *value)
{
    ZVAL_DEREF(value);
    return Z_TYPE_P(value) == IS_OBJECT && instanceof_function(Z_OBJCE_P(value), pt_safe_string_ce);
}

/* Value::stringify at a node: a list or a map has no text (E_RUNTIME_STRINGIFY). */
static bool pt_text_at(zval *self, zval *value, zval *frame, zval *span, zval *text)
{
    if (!pt_host_stringify(value, text)) {
        return false;
    }
    if (Z_TYPE_P(text) == IS_NULL) {
        pt_throw_at(self, PT_E_RUNTIME_STRINGIFY, frame, span, zend_string_init(ZEND_STRL("a list or map cannot be converted to text"), 0));
        return false;
    }
    return true;
}

/* Helpers::toNumber at a node. */
static bool pt_number_at(zval *self, zval *value, zval *frame, zval *span, double *number)
{
    if (pt_helper_number(value, number)) {
        return true;
    }
    pt_guard(self, frame, span);
    return false;
}

/* The finite check of an arithmetic result at a node. */
static bool pt_finite_at(zval *self, double value, zval *frame, zval *span, zval *result)
{
    if (!isfinite(value)) {
        pt_throw_at(self, PT_E_RUNTIME_TYPE, frame, span, zend_string_init(ZEND_STRL("arithmetic result is not finite"), 0));
        return false;
    }
    ZVAL_DOUBLE(result, value);
    return true;
}

/* Value::compare at a node: a pair without an order is E_RUNTIME_COMPARE. */
static bool pt_compare_at(zval *self, zval *left, zval *right, zval *frame, zval *span, zend_long *order)
{
    if (pt_host_compare(left, right, order)) {
        return true;
    }
    zend_string *message = zend_strpprintf(0, "%s and %s have no order", pt_host_type_name(left), pt_host_type_name(right));
    pt_throw_at(self, PT_E_RUNTIME_COMPARE, frame, span, message);
    return false;
}

/* Binds a host value into the value of the library (Bind::value) at a node; a BindError is the error at the node. */
static bool pt_bind_at(zval *self, zval *input, zval *frame, zval *span, zval *result)
{
    pt_arena arena;
    pt_value value = {0};
    pt_bind_error error = {NULL, NULL};
    pt_arena_init(&arena);
    if (!pt_bind_value(&arena, input, &value, &error)) {
        pt_arena_free(&arena);
        pt_throw_at(self, error.code, frame, span, error.message);
        return false;
    }
    pt_library_value(value, result);
    pt_arena_free(&arena);
    return true;
}

/* The outcome of host code (the library's hostResult): a thrown exception fails at the call with
 * E_RUNTIME_HOST_FUNCTION, a native TemplateError passes unchanged, and the result is bound at the call. The outcome is
 * released. */
static bool pt_host_outcome(zval *self, zend_string *name, zval *outcome, zval *frame, zval *span, zval *result)
{
    if (EG(exception)) {
        zval_ptr_dtor(outcome);
        zend_object *passthrough = NULL;
        zend_string *message = pt_take_exception(&passthrough);
        if (passthrough != NULL) {
            zval error;
            ZVAL_OBJ(&error, passthrough);
            zend_throw_exception_object(&error);
            return false;
        }
        zend_string *text = zend_strpprintf(0, "%s failed: %s", ZSTR_VAL(name), ZSTR_VAL(message));
        zend_string_release(message);
        pt_throw_at(self, PT_E_RUNTIME_HOST_FUNCTION, frame, span, text);
        return false;
    }
    bool bound = pt_bind_at(self, outcome, frame, span, result);
    zval_ptr_dtor(outcome);
    return bound;
}

/* Calls a host callable with (arguments, env) and binds its result, as the library's hostResult does. */
static bool pt_call_host(zval *self, zval *callable, zend_string *name, zval *arguments, zval *frame, zval *span, zval *result)
{
    zval rv, params[2], outcome;
    ZVAL_COPY_VALUE(&params[0], arguments);
    ZVAL_COPY_DEREF(&params[1], pt_context_env(self, &rv));
    ZVAL_UNDEF(&outcome);
    call_user_function(NULL, NULL, callable, &outcome, 2, params);
    zval_ptr_dtor(&params[1]);
    if (Z_TYPE(outcome) == IS_UNDEF) {
        ZVAL_NULL(&outcome);
    }
    return pt_host_outcome(self, name, &outcome, frame, span, result);
}

/* ----------------------------------------------------------------------------------------------- */
/* Operators (VAL-*, EXP-*)                                                                         */
/* ----------------------------------------------------------------------------------------------- */

static bool pt_unary_at(zval *self, zend_string *op, zval *operand, zval *frame, zval *span, zval *result)
{
    if (zend_string_equals_literal(op, "!")) {
        ZVAL_BOOL(result, !pt_host_truthy(operand));
        return true;
    }
    if (zend_string_equals_literal(op, "-")) {
        double number;
        if (!pt_number_at(self, operand, frame, span, &number)) {
            return false;
        }
        return pt_finite_at(self, -number, frame, span, result);
    }
    zend_string *message = zend_strpprintf(0, "unknown operator %.*s", (int)ZSTR_LEN(op), ZSTR_VAL(op));
    pt_throw_at(self, PT_E_RUNTIME_TYPE, frame, span, message);
    return false;
}

/* The `+` of a string operand: the text of both operands, left first. */
static bool pt_concat_at(zval *self, zval *left, zval *right, zval *frame, zval *span, zval *result)
{
    zval a, b;
    if (!pt_text_at(self, left, frame, span, &a)) {
        return false;
    }
    if (!pt_text_at(self, right, frame, span, &b)) {
        zval_ptr_dtor(&a);
        return false;
    }
    ZVAL_STR(result, zend_string_concat2(Z_STRVAL(a), Z_STRLEN(a), Z_STRVAL(b), Z_STRLEN(b)));
    zval_ptr_dtor(&a);
    zval_ptr_dtor(&b);
    return true;
}

/* The `in` operator: an item of a list, a key of a map or a substring of a string. */
static bool pt_in_at(zval *self, zval *left, zval *right, zval *frame, zval *span, zval *result)
{
    ZVAL_DEREF(right);
    if (Z_TYPE_P(right) == IS_ARRAY) {
        zval *item;
        ZEND_HASH_FOREACH_VAL_IND(Z_ARRVAL_P(right), item) {
            if (pt_host_loose_equals(item, left)) {
                ZVAL_TRUE(result);
                return true;
            }
        } ZEND_HASH_FOREACH_END();
        ZVAL_FALSE(result);
        return true;
    }
    if (pt_is_map(right)) {
        zval text;
        if (!pt_text_at(self, left, frame, span, &text)) {
            return false;
        }
        zval *items = OBJ_PROP_NUM(Z_OBJ_P(right), 0);
        ZVAL_BOOL(result, zend_symtable_exists(Z_ARRVAL_P(items), Z_STR(text)));
        zval_ptr_dtor(&text);
        return true;
    }
    if (pt_host_is_string(right)) {
        zend_string *haystack = pt_host_text_of(right);
        zval text;
        if (!pt_text_at(self, left, frame, span, &text)) {
            return false;
        }
        bool found = Z_STRLEN(text) == 0
            || zend_memnstr(ZSTR_VAL(haystack), Z_STRVAL(text), Z_STRLEN(text), ZSTR_VAL(haystack) + ZSTR_LEN(haystack)) != NULL;
        zval_ptr_dtor(&text);
        ZVAL_BOOL(result, found);
        return true;
    }
    pt_throw_at(self, PT_E_RUNTIME_TYPE, frame, span, zend_string_init(ZEND_STRL("in requires a list, map or string on the right"), 0));
    return false;
}

static bool pt_binary_at(zval *self, zend_string *op, zval *left, zval *right, zval *frame, zval *span, zval *result)
{
    double a, b;
    zend_long order;
    if (zend_string_equals_literal(op, "+")) {
        if (pt_is_collection(left) || pt_is_collection(right)) {
            pt_throw_at(self, PT_E_RUNTIME_STRINGIFY, frame, span, zend_string_init(ZEND_STRL("a list or map cannot be converted to text"), 0));
            return false;
        }
        if (pt_host_is_string(left) || pt_host_is_string(right)) {
            return pt_concat_at(self, left, right, frame, span, result);
        }
        if (!pt_number_at(self, left, frame, span, &a) || !pt_number_at(self, right, frame, span, &b)) {
            return false;
        }
        return pt_finite_at(self, a + b, frame, span, result);
    }
    if (zend_string_equals_literal(op, "-")) {
        if (!pt_number_at(self, left, frame, span, &a) || !pt_number_at(self, right, frame, span, &b)) {
            return false;
        }
        return pt_finite_at(self, a - b, frame, span, result);
    }
    if (zend_string_equals_literal(op, "*")) {
        if (!pt_number_at(self, left, frame, span, &a) || !pt_number_at(self, right, frame, span, &b)) {
            return false;
        }
        return pt_finite_at(self, a * b, frame, span, result);
    }
    if (zend_string_equals_literal(op, "/")) {
        if (!pt_number_at(self, right, frame, span, &b)) {
            return false;
        }
        if (b == 0.0) {
            pt_throw_at(self, PT_E_RUNTIME_DIV_ZERO, frame, span, zend_string_init(ZEND_STRL("division by zero"), 0));
            return false;
        }
        if (!pt_number_at(self, left, frame, span, &a)) {
            return false;
        }
        return pt_finite_at(self, a / b, frame, span, result);
    }
    if (zend_string_equals_literal(op, "%")) {
        if (!pt_number_at(self, left, frame, span, &a) || !pt_number_at(self, right, frame, span, &b)) {
            return false;
        }
        if (!pt_is_integer(a) || !pt_is_integer(b)) {
            pt_throw_at(self, PT_E_RUNTIME_TYPE, frame, span, zend_string_init(ZEND_STRL("% requires integer operands"), 0));
            return false;
        }
        if (b == 0.0) {
            pt_throw_at(self, PT_E_RUNTIME_DIV_ZERO, frame, span, zend_string_init(ZEND_STRL("division by zero"), 0));
            return false;
        }
        ZVAL_DOUBLE(result, fmod(a, b));
        return true;
    }
    if (zend_string_equals_literal(op, "==")) {
        ZVAL_BOOL(result, pt_host_loose_equals(left, right));
        return true;
    }
    if (zend_string_equals_literal(op, "!=")) {
        ZVAL_BOOL(result, !pt_host_loose_equals(left, right));
        return true;
    }
    if (zend_string_equals_literal(op, "===")) {
        ZVAL_BOOL(result, pt_host_strict_equals(left, right));
        return true;
    }
    if (zend_string_equals_literal(op, "!==")) {
        ZVAL_BOOL(result, !pt_host_strict_equals(left, right));
        return true;
    }
    if (zend_string_equals_literal(op, "<") || zend_string_equals_literal(op, ">")
        || zend_string_equals_literal(op, "<=") || zend_string_equals_literal(op, ">=")) {
        if (!pt_compare_at(self, left, right, frame, span, &order)) {
            return false;
        }
        bool value;
        if (zend_string_equals_literal(op, "<")) {
            value = order < 0;
        } else if (zend_string_equals_literal(op, ">")) {
            value = order > 0;
        } else if (zend_string_equals_literal(op, "<=")) {
            value = order <= 0;
        } else {
            value = order >= 0;
        }
        ZVAL_BOOL(result, value);
        return true;
    }
    if (zend_string_equals_literal(op, "in")) {
        return pt_in_at(self, left, right, frame, span, result);
    }
    zend_string *message = zend_strpprintf(0, "unknown operator %.*s", (int)ZSTR_LEN(op), ZSTR_VAL(op));
    pt_throw_at(self, PT_E_RUNTIME_TYPE, frame, span, message);
    return false;
}

static bool pt_escape_at(zval *self, zval *value, zval *frame, zval *span, zval *result)
{
    ZVAL_DEREF(value);
    if (pt_is_safe(value)) {
        ZVAL_STR_COPY(result, pt_host_text_of(value));
        return true;
    }
    zval text;
    if (!pt_text_at(self, value, frame, span, &text)) {
        return false;
    }
    ZVAL_STR(result, pt_escape_html_string(Z_STR(text)));
    zval_ptr_dtor(&text);
    return true;
}

/* ----------------------------------------------------------------------------------------------- */
/* Members, calls and entries (VAL-19, EXP-18, EXP-19, FUN-43 to FUN-46)                             */
/* ----------------------------------------------------------------------------------------------- */

/* The entry of a map under a key; a missing key is null. */
static void pt_map_entry(zval *items, zend_string *key, zval *result)
{
    zval *value = zend_symtable_find(Z_ARRVAL_P(items), key);
    if (value == NULL) {
        ZVAL_NULL(result);
        return;
    }
    ZVAL_COPY_DEREF(result, value);
}

/* RuntimeBindings::index: a map key, a list position or a public property of a native object. */
static bool pt_index_at(zval *self, zval *container, zval *key, zval *frame, zval *span, zval *result)
{
    ZVAL_DEREF(container);
    ZVAL_DEREF(key);
    ZVAL_NULL(result);
    if (pt_is_map(container)) {
        zval *items = OBJ_PROP_NUM(Z_OBJ_P(container), 0);
        if (pt_host_is_string(key)) {
            pt_map_entry(items, pt_host_text_of(key), result);
            return true;
        }
        if (Z_TYPE_P(key) == IS_LONG || Z_TYPE_P(key) == IS_DOUBLE) {
            double number = Z_TYPE_P(key) == IS_LONG ? (double)Z_LVAL_P(key) : Z_DVAL_P(key);
            if (pt_is_integer(number)) {
                zval text;
                if (!pt_number_host_text(number, &text)) {
                    return false;
                }
                pt_map_entry(items, Z_STR(text), result);
                zval_ptr_dtor(&text);
            }
        }
        return true;
    }
    if (Z_TYPE_P(container) == IS_ARRAY) {
        zend_long position = 0;
        bool has = false;
        if (Z_TYPE_P(key) == IS_LONG || Z_TYPE_P(key) == IS_DOUBLE) {
            double number = Z_TYPE_P(key) == IS_LONG ? (double)Z_LVAL_P(key) : Z_DVAL_P(key);
            if (pt_is_integer(number)) {
                position = Z_TYPE_P(key) == IS_LONG ? Z_LVAL_P(key) : zend_dval_to_lval(number);
                has = true;
            }
        } else if (pt_host_is_string(key)) {
            zend_string *text = pt_host_text_of(key);
            has = pt_canonical_digits((pt_s){ZSTR_VAL(text), ZSTR_LEN(text)}, &position);
        }
        if (has && position >= 0) {
            zval *item = zend_hash_index_find(Z_ARRVAL_P(container), (zend_ulong)position);
            if (item != NULL) {
                ZVAL_COPY_DEREF(result, item);
            }
        }
        return true;
    }
    if (Z_TYPE_P(container) == IS_OBJECT && !pt_is_safe(container) && pt_host_is_string(key)) {
        zend_string *name = pt_host_text_of(key);
        pt_arena arena;
        pt_value value = {0};
        bool found = false;
        pt_bind_error error = {NULL, NULL};
        pt_arena_init(&arena);
        if (!pt_object_property(&arena, Z_OBJ_P(container), (pt_s){ZSTR_VAL(name), ZSTR_LEN(name)}, &value, &found, &error)) {
            pt_arena_free(&arena);
            pt_throw_at(self, error.code, frame, span, error.message);
            return false;
        }
        if (found) {
            pt_library_value(value, result);
        }
        pt_arena_free(&arena);
    }
    return true;
}

/* RuntimeBindings::memberCall: a public method of the original object, found by its name. */
static bool pt_member_call_at(zval *self, zval *container, zend_string *method, zval *args, zval *frame, zval *span, zval *result)
{
    ZVAL_DEREF(container);
    zend_function *target = NULL;
    if (Z_TYPE_P(container) == IS_OBJECT && !pt_is_map(container) && !pt_is_safe(container)) {
        zend_string *lower = zend_string_tolower(method);
        target = zend_hash_find_ptr(&Z_OBJCE_P(container)->function_table, lower);
        zend_string_release(lower);
    }
    if (target == NULL || !(target->common.fn_flags & ZEND_ACC_PUBLIC)) {
        zend_string *message = zend_strpprintf(0, "%s is not a function", ZSTR_VAL(method));
        pt_throw_at(self, PT_E_RUNTIME_UNKNOWN_FUNCTION, frame, span, message);
        return false;
    }
    zval arguments;
    pt_host_argument_list(Z_ARRVAL_P(args), &arguments);
    uint32_t count = zend_hash_num_elements(Z_ARRVAL(arguments));
    zval *params = count > 0 ? safe_emalloc(count, sizeof(zval), 0) : NULL;
    uint32_t index = 0;
    zval *item;
    ZEND_HASH_FOREACH_VAL(Z_ARRVAL(arguments), item) {
        ZVAL_COPY_VALUE(&params[index++], item);
    } ZEND_HASH_FOREACH_END();
    zval outcome;
    ZVAL_UNDEF(&outcome);
    zend_object *object = (target->common.fn_flags & ZEND_ACC_STATIC) ? NULL : Z_OBJ_P(container);
    zend_call_known_function(target, object, Z_OBJCE_P(container), &outcome, count, params, NULL);
    if (params != NULL) {
        efree(params);
    }
    zval_ptr_dtor(&arguments);
    if (Z_TYPE(outcome) == IS_UNDEF) {
        ZVAL_NULL(&outcome);
    }
    return pt_host_outcome(self, method, &outcome, frame, span, result);
}

/* RuntimeBindings::classCall: a class function of the services, called with (arguments, env). */
static bool pt_class_call_at(zval *self, zend_string *class_name, zend_string *method, zval *args, zval *frame, zval *span, zval *result)
{
    zval names[2], function;
    ZVAL_STR(&names[0], class_name);
    ZVAL_STR(&names[1], method);
    pt_services_call(self, "classFunction", 13, 2, &names[0], &names[1], &function);
    if (EG(exception)) {
        zval_ptr_dtor(&function);
        return false;
    }
    if (Z_TYPE(function) == IS_NULL) {
        zend_string *message = zend_strpprintf(0, "%s::%s is not a function", ZSTR_VAL(class_name), ZSTR_VAL(method));
        pt_throw_at(self, PT_E_RUNTIME_UNKNOWN_FUNCTION, frame, span, message);
        return false;
    }
    zval arguments;
    pt_host_argument_list(Z_ARRVAL_P(args), &arguments);
    zend_string *name = zend_strpprintf(0, "%s::%s", ZSTR_VAL(class_name), ZSTR_VAL(method));
    bool ok = pt_call_host(self, &function, name, &arguments, frame, span, result);
    zend_string_release(name);
    zval_ptr_dtor(&arguments);
    zval_ptr_dtor(&function);
    return ok;
}

/* A built-in function: the arity is checked first (E_RUNTIME_ARITY), then the function runs with the bound arguments
 * and the environment of the render (a FunctionError is the error at the node). */
static bool pt_builtin_at(zval *self, const pt_builtin *builtin, zend_string *name, zval *args, zval *frame, zval *span, zval *result)
{
    uint32_t count = zend_hash_num_elements(Z_ARRVAL_P(args));
    if (count < builtin->min || count > builtin->max) {
        zend_long maximum = builtin->max == UINT32_MAX ? ZEND_LONG_MAX : (zend_long)builtin->max;
        zend_string *message;
        if (builtin->min == builtin->max) {
            message = zend_strpprintf(0, "%s accepts %u arguments, got %u", ZSTR_VAL(name), builtin->min, count);
        } else {
            message = zend_strpprintf(0, "%s accepts %u to " ZEND_LONG_FMT " arguments, got %u", ZSTR_VAL(name), builtin->min, maximum, count);
        }
        pt_throw_at(self, PT_E_RUNTIME_ARITY, frame, span, message);
        return false;
    }
    pt_arena arena;
    pt_arena_init(&arena);
    pt_value *values = pt_alloc(&arena, sizeof(pt_value) * (count > 0 ? count : 1));
    uint32_t index = 0;
    zval *item;
    ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(args), item) {
        pt_bind_error error = {NULL, NULL};
        if (!pt_bind_value(&arena, item, &values[index], &error)) {
            pt_arena_free(&arena);
            pt_throw_at(self, error.code, frame, span, error.message);
            return false;
        }
        index++;
    } ZEND_HASH_FOREACH_END();

    zval rv;
    zval *env = pt_context_env(self, &rv);
    zval *timezone = zend_hash_str_find(Z_ARRVAL_P(env), ZEND_STRL("timezone"));
    zval *now = zend_hash_str_find(Z_ARRVAL_P(env), ZEND_STRL("now"));
    zend_string *zone = timezone != NULL ? zval_get_string(timezone) : ZSTR_EMPTY_ALLOC();
    pt_env library_env = {{ZSTR_VAL(zone), ZSTR_LEN(zone)}, now != NULL ? zval_get_double(now) : 0.0};

    pt_value output = {0};
    pt_function_error error = {NULL, NULL};
    bool ok = builtin->call(&arena, &library_env, values, count, &output, &error);
    zend_string_release(zone);
    if (!ok) {
        pt_arena_free(&arena);
        pt_throw_at(self, error.code, frame, span, error.message);
        return false;
    }
    pt_library_value(output, result);
    pt_arena_free(&arena);
    return true;
}

/* A host function of the services: `$this->context->services->hostFunction($name)`, called with (arguments, env). */
static bool pt_host_function_at(zval *self, zend_string *name, zval *args, zval *frame, zval *span, zval *result)
{
    zval name_value, host;
    ZVAL_STR(&name_value, name);
    pt_services_call(self, "hostFunction", 12, 1, &name_value, NULL, &host);
    if (EG(exception)) {
        zval_ptr_dtor(&host);
        return false;
    }
    if (Z_TYPE(host) == IS_NULL) {
        zend_string *message = zend_strpprintf(0, "%s is not a function", ZSTR_VAL(name));
        pt_throw_at(self, PT_E_RUNTIME_UNKNOWN_FUNCTION, frame, span, message);
        return false;
    }
    zval arguments;
    pt_host_argument_list(Z_ARRVAL_P(args), &arguments);
    bool ok = pt_call_host(self, &host, name, &arguments, frame, span, result);
    zval_ptr_dtor(&arguments);
    zval_ptr_dtor(&host);
    return ok;
}

/* ----------------------------------------------------------------------------------------------- */
/* Methods                                                                                          */
/* ----------------------------------------------------------------------------------------------- */

void pt_bindings_construct(INTERNAL_FUNCTION_PARAMETERS)
{
    zval *context;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_OBJECT_OF_CLASS(context, pt_context_ce)
    ZEND_PARSE_PARAMETERS_END();
    zval_ptr_dtor(PT_CONTEXT(ZEND_THIS));
    ZVAL_COPY(PT_CONTEXT(ZEND_THIS), context);
}

void pt_bindings_truthy(INTERNAL_FUNCTION_PARAMETERS)
{
    zval *value;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_ZVAL(value)
    ZEND_PARSE_PARAMETERS_END();
    RETURN_BOOL(pt_host_truthy(value));
}

void pt_bindings_unary(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *op;
    zval *operand, *frame, *span;
    ZEND_PARSE_PARAMETERS_START(4, 4)
        Z_PARAM_STR(op)
        Z_PARAM_ZVAL(operand)
        Z_PARAM_OBJECT_OF_CLASS(frame, pt_frame_ce)
        Z_PARAM_ARRAY(span)
    ZEND_PARSE_PARAMETERS_END();
    if (!pt_unary_at(ZEND_THIS, op, operand, frame, span, return_value)) {
        RETURN_THROWS();
    }
}

void pt_bindings_binary(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *op;
    zval *left, *right, *frame, *span;
    ZEND_PARSE_PARAMETERS_START(5, 5)
        Z_PARAM_STR(op)
        Z_PARAM_ZVAL(left)
        Z_PARAM_ZVAL(right)
        Z_PARAM_OBJECT_OF_CLASS(frame, pt_frame_ce)
        Z_PARAM_ARRAY(span)
    ZEND_PARSE_PARAMETERS_END();
    if (!pt_binary_at(ZEND_THIS, op, left, right, frame, span, return_value)) {
        RETURN_THROWS();
    }
}

void pt_bindings_stringify(INTERNAL_FUNCTION_PARAMETERS)
{
    zval *value, *frame, *span;
    ZEND_PARSE_PARAMETERS_START(3, 3)
        Z_PARAM_ZVAL(value)
        Z_PARAM_OBJECT_OF_CLASS(frame, pt_frame_ce)
        Z_PARAM_ARRAY(span)
    ZEND_PARSE_PARAMETERS_END();
    if (!pt_text_at(ZEND_THIS, value, frame, span, return_value)) {
        RETURN_THROWS();
    }
}

void pt_bindings_escape(INTERNAL_FUNCTION_PARAMETERS)
{
    zval *value, *frame, *span;
    ZEND_PARSE_PARAMETERS_START(3, 3)
        Z_PARAM_ZVAL(value)
        Z_PARAM_OBJECT_OF_CLASS(frame, pt_frame_ce)
        Z_PARAM_ARRAY(span)
    ZEND_PARSE_PARAMETERS_END();
    if (!pt_escape_at(ZEND_THIS, value, frame, span, return_value)) {
        RETURN_THROWS();
    }
}

void pt_bindings_number(INTERNAL_FUNCTION_PARAMETERS)
{
    zval *value, *frame, *span;
    ZEND_PARSE_PARAMETERS_START(3, 3)
        Z_PARAM_ZVAL(value)
        Z_PARAM_OBJECT_OF_CLASS(frame, pt_frame_ce)
        Z_PARAM_ARRAY(span)
    ZEND_PARSE_PARAMETERS_END();
    double number;
    if (!pt_number_at(ZEND_THIS, value, frame, span, &number)) {
        RETURN_THROWS();
    }
    RETURN_DOUBLE(number);
}

void pt_bindings_finite(INTERNAL_FUNCTION_PARAMETERS)
{
    double value;
    zval *frame, *span;
    ZEND_PARSE_PARAMETERS_START(3, 3)
        Z_PARAM_DOUBLE(value)
        Z_PARAM_OBJECT_OF_CLASS(frame, pt_frame_ce)
        Z_PARAM_ARRAY(span)
    ZEND_PARSE_PARAMETERS_END();
    if (!pt_finite_at(ZEND_THIS, value, frame, span, return_value)) {
        RETURN_THROWS();
    }
}

void pt_bindings_equal(INTERNAL_FUNCTION_PARAMETERS)
{
    zval *left, *right;
    bool strict;
    ZEND_PARSE_PARAMETERS_START(3, 3)
        Z_PARAM_ZVAL(left)
        Z_PARAM_ZVAL(right)
        Z_PARAM_BOOL(strict)
    ZEND_PARSE_PARAMETERS_END();
    RETURN_BOOL(strict ? pt_host_strict_equals(left, right) : pt_host_loose_equals(left, right));
}

void pt_bindings_compare(INTERNAL_FUNCTION_PARAMETERS)
{
    zval *left, *right, *frame, *span;
    ZEND_PARSE_PARAMETERS_START(4, 4)
        Z_PARAM_ZVAL(left)
        Z_PARAM_ZVAL(right)
        Z_PARAM_OBJECT_OF_CLASS(frame, pt_frame_ce)
        Z_PARAM_ARRAY(span)
    ZEND_PARSE_PARAMETERS_END();
    zend_long order;
    if (!pt_compare_at(ZEND_THIS, left, right, frame, span, &order)) {
        RETURN_THROWS();
    }
    RETURN_LONG(order);
}

void pt_bindings_member(INTERNAL_FUNCTION_PARAMETERS)
{
    zval *container, *frame, *span;
    zend_string *key;
    ZEND_PARSE_PARAMETERS_START(4, 4)
        Z_PARAM_ZVAL(container)
        Z_PARAM_STR(key)
        Z_PARAM_OBJECT_OF_CLASS(frame, pt_frame_ce)
        Z_PARAM_ARRAY(span)
    ZEND_PARSE_PARAMETERS_END();
    zval key_value;
    ZVAL_STR(&key_value, key);
    if (!pt_index_at(ZEND_THIS, container, &key_value, frame, span, return_value)) {
        RETURN_THROWS();
    }
}

void pt_bindings_member_call(INTERNAL_FUNCTION_PARAMETERS)
{
    zval *container, *args, *frame, *span;
    zend_string *method;
    ZEND_PARSE_PARAMETERS_START(5, 5)
        Z_PARAM_ZVAL(container)
        Z_PARAM_STR(method)
        Z_PARAM_ARRAY(args)
        Z_PARAM_OBJECT_OF_CLASS(frame, pt_frame_ce)
        Z_PARAM_ARRAY(span)
    ZEND_PARSE_PARAMETERS_END();
    if (!pt_member_call_at(ZEND_THIS, container, method, args, frame, span, return_value)) {
        RETURN_THROWS();
    }
}

void pt_bindings_class_call(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *class_name, *method;
    zval *args, *frame, *span;
    ZEND_PARSE_PARAMETERS_START(5, 5)
        Z_PARAM_STR(class_name)
        Z_PARAM_STR(method)
        Z_PARAM_ARRAY(args)
        Z_PARAM_OBJECT_OF_CLASS(frame, pt_frame_ce)
        Z_PARAM_ARRAY(span)
    ZEND_PARSE_PARAMETERS_END();
    if (!pt_class_call_at(ZEND_THIS, class_name, method, args, frame, span, return_value)) {
        RETURN_THROWS();
    }
}

void pt_bindings_index(INTERNAL_FUNCTION_PARAMETERS)
{
    zval *container, *key, *frame, *span;
    ZEND_PARSE_PARAMETERS_START(4, 4)
        Z_PARAM_ZVAL(container)
        Z_PARAM_ZVAL(key)
        Z_PARAM_OBJECT_OF_CLASS(frame, pt_frame_ce)
        Z_PARAM_ARRAY(span)
    ZEND_PARSE_PARAMETERS_END();
    if (!pt_index_at(ZEND_THIS, container, key, frame, span, return_value)) {
        RETURN_THROWS();
    }
}

void pt_bindings_depth(INTERNAL_FUNCTION_PARAMETERS)
{
    zval *value, *frame, *span;
    ZEND_PARSE_PARAMETERS_START(3, 3)
        Z_PARAM_ZVAL(value)
        Z_PARAM_OBJECT_OF_CLASS(frame, pt_frame_ce)
        Z_PARAM_ARRAY(span)
    ZEND_PARSE_PARAMETERS_END();
    if (!pt_zval_depth_within(value, PT_MAX_DEPTH)) {
        zend_string *message = zend_strpprintf(0, "a list or map literal nests deeper than %d levels", PT_MAX_DEPTH);
        pt_throw_at(ZEND_THIS, PT_E_RUNTIME_LIMIT, frame, span, message);
        RETURN_THROWS();
    }
    RETURN_COPY_DEREF(value);
}

/* RuntimeBindings::entries: the pairs [position, item] of a list (the position is a float), [key, item] of a map, none
 * for null. */
void pt_bindings_entries(INTERNAL_FUNCTION_PARAMETERS)
{
    zval *value, *frame, *span;
    ZEND_PARSE_PARAMETERS_START(3, 3)
        Z_PARAM_ZVAL(value)
        Z_PARAM_OBJECT_OF_CLASS(frame, pt_frame_ce)
        Z_PARAM_ARRAY(span)
    ZEND_PARSE_PARAMETERS_END();
    array_init(return_value);
    ZVAL_DEREF(value);
    if (Z_TYPE_P(value) == IS_NULL) {
        return;
    }
    if (Z_TYPE_P(value) == IS_ARRAY) {
        zend_ulong index;
        zend_string *key;
        zval *item;
        ZEND_HASH_FOREACH_KEY_VAL_IND(Z_ARRVAL_P(value), index, key, item) {
            zval pair, copy;
            array_init(&pair);
            add_next_index_double(&pair, key != NULL ? zend_strtod(ZSTR_VAL(key), NULL) : (double)index);
            ZVAL_COPY_DEREF(&copy, item);
            add_next_index_zval(&pair, &copy);
            add_next_index_zval(return_value, &pair);
        } ZEND_HASH_FOREACH_END();
        return;
    }
    if (pt_is_map(value)) {
        zval *items = OBJ_PROP_NUM(Z_OBJ_P(value), 0);
        zend_ulong index;
        zend_string *key;
        zval *item;
        ZEND_HASH_FOREACH_KEY_VAL(Z_ARRVAL_P(items), index, key, item) {
            zval pair, copy;
            array_init(&pair);
            if (key != NULL) {
                add_next_index_str(&pair, zend_string_copy(key));
            } else {
                add_next_index_str(&pair, zend_long_to_str((zend_long)index));
            }
            ZVAL_COPY_DEREF(&copy, item);
            add_next_index_zval(&pair, &copy);
            add_next_index_zval(return_value, &pair);
        } ZEND_HASH_FOREACH_END();
        return;
    }
    pt_throw_at(ZEND_THIS, PT_E_RUNTIME_TYPE, frame, span, zend_string_init(ZEND_STRL("loop requires a list, a map or null"), 0));
    RETURN_THROWS();
}

void pt_bindings_list_spread(INTERNAL_FUNCTION_PARAMETERS)
{
    zval *value, *frame, *span;
    ZEND_PARSE_PARAMETERS_START(3, 3)
        Z_PARAM_ZVAL(value)
        Z_PARAM_OBJECT_OF_CLASS(frame, pt_frame_ce)
        Z_PARAM_ARRAY(span)
    ZEND_PARSE_PARAMETERS_END();
    ZVAL_DEREF(value);
    if (Z_TYPE_P(value) != IS_ARRAY) {
        pt_throw_at(ZEND_THIS, PT_E_RUNTIME_TYPE, frame, span, zend_string_init(ZEND_STRL("spread in a list requires a list"), 0));
        RETURN_THROWS();
    }
    RETURN_COPY_DEREF(value);
}

void pt_bindings_map_spread(INTERNAL_FUNCTION_PARAMETERS)
{
    zval *value, *frame, *span;
    ZEND_PARSE_PARAMETERS_START(3, 3)
        Z_PARAM_ZVAL(value)
        Z_PARAM_OBJECT_OF_CLASS(frame, pt_frame_ce)
        Z_PARAM_ARRAY(span)
    ZEND_PARSE_PARAMETERS_END();
    if (!pt_is_map(value)) {
        pt_throw_at(ZEND_THIS, PT_E_RUNTIME_TYPE, frame, span, zend_string_init(ZEND_STRL("spread in a map requires a map"), 0));
        RETURN_THROWS();
    }
    RETURN_COPY_DEREF(value);
}

void pt_bindings_call(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *name;
    zval *args, *frame, *span;
    ZEND_PARSE_PARAMETERS_START(4, 4)
        Z_PARAM_STR(name)
        Z_PARAM_ARRAY(args)
        Z_PARAM_OBJECT_OF_CLASS(frame, pt_frame_ce)
        Z_PARAM_ARRAY(span)
    ZEND_PARSE_PARAMETERS_END();
    const pt_builtin *builtin = pt_builtin_find(ZSTR_VAL(name), ZSTR_LEN(name));
    bool ok = builtin != NULL
        ? pt_builtin_at(ZEND_THIS, builtin, name, args, frame, span, return_value)
        : pt_host_function_at(ZEND_THIS, name, args, frame, span, return_value);
    if (!ok) {
        RETURN_THROWS();
    }
}

/* RuntimeBindings::limit: the count of a loop iteration or of an expression nesting is at most the limit. */
void pt_bindings_limit(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *kind;
    zend_long count;
    zval *frame, *span;
    ZEND_PARSE_PARAMETERS_START(4, 4)
        Z_PARAM_STR(kind)
        Z_PARAM_LONG(count)
        Z_PARAM_OBJECT_OF_CLASS(frame, pt_frame_ce)
        Z_PARAM_ARRAY(span)
    ZEND_PARSE_PARAMETERS_END();
    bool expression = zend_string_equals_literal(kind, "expression");
    zend_long maximum;
    if (!pt_context_limit(PT_CONTEXT(ZEND_THIS), expression ? "expressionDepth" : "iterations",
            expression ? strlen("expressionDepth") : strlen("iterations"), &maximum)) {
        RETURN_THROWS();
    }
    if (count <= maximum) {
        return;
    }
    zend_string *message = zend_strpprintf(0, "%s" ZEND_LONG_FMT,
        expression ? "expression nesting exceeds " : "loop iterations exceed ", maximum);
    pt_throw_at(ZEND_THIS, PT_E_RUNTIME_LIMIT, frame, span, message);
    RETURN_THROWS();
}

void pt_bindings_error(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *code, *message;
    zval *frame, *span;
    ZEND_PARSE_PARAMETERS_START(4, 4)
        Z_PARAM_OBJECT_OF_CLASS(frame, pt_frame_ce)
        Z_PARAM_ARRAY(span)
        Z_PARAM_STR(code)
        Z_PARAM_STR(message)
    ZEND_PARSE_PARAMETERS_END();
    zval error;
    pt_context_error(PT_CONTEXT(ZEND_THIS), code, frame, span, message, &error);
    if (EG(exception)) {
        RETURN_THROWS();
    }
    ZVAL_COPY_VALUE(return_value, &error);
}
