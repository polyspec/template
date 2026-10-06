/*
 * Rendering (docs/spec/runtime.md): the loader and template names (RT-7 to RT-10, RT-40), statements
 * (RT-11 to RT-32), expressions (docs/spec/expressions.md), function calls (FUN-43 to FUN-46) and the
 * resource limits.
 */
#include "pt.h"
#include "main/php_streams.h"
#include "Zend/zend_exceptions.h"
#include <math.h>
#include <sys/stat.h>
#include <unistd.h>

/* ----------------------------------------------------------------------------------------------- */
/* Template names (RT-7, RT-8)                                                                      */
/* ----------------------------------------------------------------------------------------------- */

bool pt_resolve_path(pt_arena *arena, pt_s current, pt_s path, pt_s *name)
{
    /* The segments of the result, as ranges of `current` or `path`. */
    size_t capacity = current.n + path.n + 2;
    pt_s *segments = pt_alloc(arena, sizeof(pt_s) * capacity);
    size_t count = 0;
    if (!(path.n > 0 && path.s[0] == '/')) {
        size_t start = 0;
        for (size_t i = 0; i <= current.n; i++) {
            if (i == current.n || current.s[i] == '/') {
                if (i == current.n) {
                    break; /* the name of the current template itself is dropped */
                }
                if (i > start) {
                    segments[count++] = (pt_s){current.s + start, i - start};
                }
                start = i + 1;
            }
        }
    }
    size_t start = 0;
    for (size_t i = 0; i <= path.n; i++) {
        if (i < path.n && path.s[i] != '/') {
            continue;
        }
        pt_s segment = {path.s + start, i - start};
        start = i + 1;
        if (segment.n == 0 || PT_EQ(segment, ".")) {
            continue;
        }
        if (PT_EQ(segment, "..")) {
            if (count == 0) {
                return false;
            }
            count--;
            continue;
        }
        segments[count++] = segment;
    }
    pt_buf buf;
    pt_buf_init(&buf, arena);
    for (size_t i = 0; i < count; i++) {
        if (i) {
            pt_buf_addc(&buf, '/');
        }
        pt_buf_adds(&buf, segments[i]);
    }
    *name = pt_buf_done(&buf);
    return true;
}

/* ----------------------------------------------------------------------------------------------- */
/* Render state                                                                                     */
/* ----------------------------------------------------------------------------------------------- */

typedef struct pt_frame {
    pt_s name;
    const pt_lines *lines;
    pt_map *context;
} pt_frame;

typedef struct pt_meta {
    double index, size;
    pt_value key, value;
    bool first, last;
} pt_meta;

typedef struct pt_loop {
    pt_s name;
    pt_meta *stack;
    uint32_t count, capacity;
} pt_loop;

/* Local variables and loop stacks shared by includes and isolated by blocks. */
typedef struct pt_scope {
    pt_map *locals;
    pt_loop *loops;
    uint32_t loop_count, loop_capacity;
} pt_scope;

typedef struct pt_ctx {
    pt_run *run;
    pt_arena *arena;
    pt_engine *engine;
    const pt_request *request;
    pt_s entry;
    HashTable *registry;
    pt_s *chain;
    uint32_t chain_count, chain_capacity;
    zend_long iterations;
    smart_str *output;
    zend_long output_bytes;
    const pt_frame *frame; /* the node that renders, for the output limit */
    size_t start, end;
    zend_long depth;
} pt_ctx;

ZEND_NORETURN static void pt_ctx_fail(pt_ctx *ctx, const char *code, const pt_frame *frame, size_t start, size_t end, zend_string *message)
{
    if (frame == NULL) {
        pt_fail_bare(ctx->run, code, ctx->entry, message);
    }
    pt_fail_at(ctx->run, code, frame->name, frame->lines, start, end, message);
}

#define PT_FAIL_AT(ctx, code, frame, expr, ...) pt_ctx_fail((ctx), (code), (frame), (expr)->start, (expr)->end, zend_strpprintf(0, __VA_ARGS__))

static void pt_hold(pt_run *run, pt_template *template)
{
    if (run->held_count == run->held_capacity) {
        run->held_capacity = run->held_capacity ? run->held_capacity * 2 : 8;
        run->held = erealloc(run->held, sizeof(pt_template *) * run->held_capacity);
    }
    template->refcount++;
    run->held[run->held_count++] = template;
}

void pt_run_release_templates(pt_run *run)
{
    for (uint32_t i = 0; i < run->held_count; i++) {
        pt_template_release(run->held[i]);
    }
    if (run->held) {
        efree(run->held);
    }
    run->held = NULL;
    run->held_count = run->held_capacity = 0;
}

/* ----------------------------------------------------------------------------------------------- */
/* Loader (RT-9, RT-10, RT-40)                                                                      */
/* ----------------------------------------------------------------------------------------------- */

static pt_template *pt_load_template(pt_ctx *ctx, pt_s name, const pt_frame *from, size_t start, size_t end)
{
    pt_engine *engine = ctx->engine;
    pt_run *run = ctx->run;
#define PT_LOAD_FAIL(code, ...)                                                                          \
    do {                                                                                                 \
        zend_string *message_ = zend_strpprintf(0, __VA_ARGS__);                                         \
        if (from != NULL) {                                                                              \
            pt_fail_at(run, code, from->name, from->lines, start, end, message_);                         \
        }                                                                                                \
        pt_fail_bare(run, code, name, message_);                                                         \
    } while (0)
    if (engine->root == NULL) {
        PT_LOAD_FAIL("E_LOAD_NOT_FOUND", "template %s does not exist", name.s);
    }
    pt_buf path;
    pt_buf_init(&path, ctx->arena);
    pt_buf_add(&path, ZSTR_VAL(engine->root), ZSTR_LEN(engine->root));
    pt_buf_addc(&path, '/');
    pt_buf_adds(&path, name);
    pt_s file = pt_buf_done(&path);
    if (memchr(file.s, '\0', file.n) != NULL) {
        /* The filesystem functions of PHP reject such a path with an error, a failure of the loader. */
        PT_LOAD_FAIL("E_LOAD_FAILED", "template %s cannot be loaded: the path contains a NUL byte", name.s);
    }
    zend_stat_t info;
    if (VCWD_STAT(file.s, &info) != 0 || !S_ISREG(info.st_mode)) {
        PT_LOAD_FAIL("E_LOAD_NOT_FOUND", "template %s does not exist", name.s);
    }
    char real[MAXPATHLEN];
    if (!VCWD_REALPATH(file.s, real) || strncmp(real, ZSTR_VAL(engine->root), ZSTR_LEN(engine->root)) != 0 || real[ZSTR_LEN(engine->root)] != '/') {
        PT_LOAD_FAIL("E_LOAD_NOT_FOUND", "template %s does not exist", name.s);
    }
    if (VCWD_ACCESS(file.s, R_OK) != 0) {
        PT_LOAD_FAIL("E_LOAD_FAILED", "template %s cannot be loaded: %s cannot be read", name.s, name.s);
    }
    zend_string *version = zend_strpprintf(0, "%lld:%lld", (long long)info.st_mtime, (long long)info.st_size);
    pt_template *cached = zend_hash_str_find_ptr(&engine->cache, name.s, name.n);
    if (cached != NULL && zend_string_equals(cached->version, version)) {
        zend_string_release(version);
        pt_hold(run, cached);
        return cached;
    }
    php_stream *stream = php_stream_open_wrapper_ex(file.s, "rb", 0, NULL, NULL);
    zend_string *bytes = stream ? php_stream_copy_to_mem(stream, PHP_STREAM_COPY_ALL, 0) : NULL;
    if (stream) {
        php_stream_close(stream);
    }
    if (stream == NULL) {
        zend_string_release(version);
        PT_LOAD_FAIL("E_LOAD_FAILED", "template %s cannot be loaded: %s cannot be read", name.s, name.s);
    }
    pt_s source = bytes ? pt_strdup(ctx->arena, ZSTR_VAL(bytes), ZSTR_LEN(bytes)) : PT_S("");
    if (bytes) {
        zend_string_release(bytes);
    }
    /* The version string is kept in the arena until the template owns it. */
    zval kept;
    ZVAL_STR(&kept, version);
    pt_arena_keep(ctx->arena, &kept);
    zval_ptr_dtor(&kept);
    pt_template *template = pt_parse(run, name.s, name.n, source.s, source.n, engine->open, engine->close);
    template->version = zend_string_copy(version);
    run->parsing = NULL;
    zend_hash_str_update_ptr(&engine->cache, name.s, name.n, template);
    pt_hold(run, template);
    return template;
#undef PT_LOAD_FAIL
}

/* ----------------------------------------------------------------------------------------------- */
/* Values at a position                                                                             */
/* ----------------------------------------------------------------------------------------------- */

static pt_s pt_text_at(pt_ctx *ctx, pt_value value, const pt_frame *frame, size_t start, size_t end)
{
    pt_s text;
    if (!pt_stringify(ctx->arena, value, &text)) {
        pt_ctx_fail(ctx, "E_RUNTIME_STRINGIFY", frame, start, end, zend_string_init("a list or map cannot be converted to text", 41, 0));
    }
    return text;
}

static double pt_number_at(pt_ctx *ctx, pt_value value, const pt_frame *frame, const pt_expr *expr)
{
    switch (value.type) {
        case PT_NULL: return 0;
        case PT_BOOL: return value.u.b ? 1 : 0;
        case PT_NUMBER: return value.u.number;
        case PT_STRING:
        case PT_SAFE: {
            double number;
            if (pt_numeric_string(value.u.str.s, value.u.str.n, &number)) {
                return number;
            }
            zend_string *quoted = pt_json_quote(value.u.str.s, value.u.str.n);
            zend_string *message = zend_strpprintf(0, "%s is not a number", ZSTR_VAL(quoted));
            zend_string_release(quoted);
            pt_ctx_fail(ctx, "E_RUNTIME_TYPE", frame, expr->start, expr->end, message);
        }
        default:
            PT_FAIL_AT(ctx, "E_RUNTIME_TYPE", frame, expr, "a %s is not a number", pt_type_name(value));
    }
}

static double pt_finite_at(pt_ctx *ctx, double value, const pt_frame *frame, const pt_expr *expr)
{
    if (!isfinite(value)) {
        PT_FAIL_AT(ctx, "E_RUNTIME_TYPE", frame, expr, "arithmetic result is not finite");
    }
    return value;
}

/* ----------------------------------------------------------------------------------------------- */
/* Host calls (FUN-43 to FUN-46, VAL-18, VAL-19, VAL-21)                                            */
/* ----------------------------------------------------------------------------------------------- */

static void pt_host_args(pt_value *args, uint32_t count, zval *list)
{
    array_init_size(list, count);
    for (uint32_t i = 0; i < count; i++) {
        zval item;
        pt_host_value(args[i], &item);
        add_next_index_zval(list, &item);
    }
}

/* Takes the outcome of host code: a thrown exception fails with E_RUNTIME_HOST_FUNCTION at the call,
 * a native TemplateError passes unchanged, and the result is bound at the call (ERR-5). */
static pt_value pt_host_result(pt_ctx *ctx, const char *name, zval *result, const pt_frame *frame, const pt_expr *expr)
{
    if (EG(exception)) {
        zval_ptr_dtor(result);
        zend_object *passthrough = NULL;
        zend_string *message = pt_take_exception(&passthrough);
        if (passthrough != NULL) {
            pt_error_clear(&ctx->run->error);
            ctx->run->error.exception = passthrough;
            longjmp(ctx->run->jump, 1);
        }
        zend_string *text = zend_strpprintf(0, "%s failed: %s", name, ZSTR_VAL(message));
        zend_string_release(message);
        pt_ctx_fail(ctx, "E_RUNTIME_HOST_FUNCTION", frame, expr->start, expr->end, text);
    }
    pt_value value;
    pt_bind_error error = {NULL, NULL};
    bool bound = pt_bind_value(ctx->arena, result, &value, &error);
    zval_ptr_dtor(result);
    if (!bound) {
        pt_ctx_fail(ctx, error.code, frame, expr->start, expr->end, error.message);
    }
    return value;
}

static pt_value pt_call_callable(pt_ctx *ctx, zval *callable, const char *name, pt_value *args, uint32_t count, const pt_frame *frame, const pt_expr *expr)
{
    zval function, params[2], result;
    ZVAL_COPY(&function, callable);
    pt_host_args(args, count, &params[0]);
    array_init_size(&params[1], 2);
    add_assoc_stringl_ex(&params[1], "timezone", 8, ctx->request->env.timezone.s, ctx->request->env.timezone.n);
    add_assoc_double_ex(&params[1], "now", 3, ctx->request->env.now);
    ZVAL_UNDEF(&result);
    call_user_function(NULL, NULL, &function, &result, 2, params);
    zval_ptr_dtor(&params[0]);
    zval_ptr_dtor(&params[1]);
    zval_ptr_dtor(&function);
    if (Z_TYPE(result) == IS_UNDEF) {
        ZVAL_NULL(&result);
    }
    return pt_host_result(ctx, name, &result, frame, expr);
}

static pt_value pt_member_call(pt_ctx *ctx, pt_value container, const pt_expr *expr, pt_value *args, const pt_frame *frame)
{
    zend_function *method = NULL;
    if (container.type == PT_OBJECT) {
        zend_string *name = zend_string_init(expr->name.s, expr->name.n, 0);
        zend_string *lower = zend_string_tolower(name);
        zend_string_release(name);
        method = zend_hash_find_ptr(&container.u.object->ce->function_table, lower);
        zend_string_release(lower);
        if (method != NULL && !(method->common.fn_flags & ZEND_ACC_PUBLIC)) {
            method = NULL;
        }
    }
    if (method == NULL) {
        PT_FAIL_AT(ctx, "E_RUNTIME_UNKNOWN_FUNCTION", frame, expr, "%s is not a function", expr->name.s);
    }
    zend_object *object = container.u.object;
    zval params, result;
    pt_host_args(args, expr->count, &params);
    uint32_t count = expr->count;
    zval *arguments = count ? safe_emalloc(count, sizeof(zval), 0) : NULL;
    uint32_t i = 0;
    zval *item;
    ZEND_HASH_FOREACH_VAL(Z_ARRVAL(params), item) {
        ZVAL_COPY(&arguments[i++], item);
    } ZEND_HASH_FOREACH_END();
    GC_ADDREF(object);
    ZVAL_UNDEF(&result);
    bool is_static = (method->common.fn_flags & ZEND_ACC_STATIC) != 0;
    zend_call_known_function(method, is_static ? NULL : object, object->ce, &result, count, arguments, NULL);
    for (i = 0; i < count; i++) {
        zval_ptr_dtor(&arguments[i]);
    }
    if (arguments) {
        efree(arguments);
    }
    zval_ptr_dtor(&params);
    OBJ_RELEASE(object);
    if (Z_TYPE(result) == IS_UNDEF) {
        ZVAL_NULL(&result);
    }
    return pt_host_result(ctx, expr->name.s, &result, frame, expr);
}

/* ----------------------------------------------------------------------------------------------- */
/* Expressions                                                                                      */
/* ----------------------------------------------------------------------------------------------- */

static pt_value pt_evaluate(pt_ctx *ctx, const pt_expr *expr, const pt_frame *frame, pt_scope *scope);

static pt_value pt_lookup(pt_scope *scope, const pt_frame *frame, pt_s name)
{
    pt_value *local = pt_map_get(scope->locals, name.s, name.n);
    if (local != NULL) {
        return *local;
    }
    pt_value *data = pt_map_get(frame->context, name.s, name.n);
    return data != NULL ? *data : pt_null();
}

static pt_loop *pt_loop_of(pt_scope *scope, pt_s name)
{
    for (uint32_t i = 0; i < scope->loop_count; i++) {
        if (pt_eq(scope->loops[i].name, name.s, name.n)) {
            return &scope->loops[i];
        }
    }
    return NULL;
}

static bool pt_canonical_digits(pt_s text, zend_long *index)
{
    if (text.n == 0 || (text.n > 1 && text.s[0] == '0')) {
        return false;
    }
    zend_long value = 0;
    for (size_t i = 0; i < text.n; i++) {
        if (text.s[i] < '0' || text.s[i] > '9') {
            return false;
        }
        value = value > (ZEND_LONG_MAX - 9) / 10 ? ZEND_LONG_MAX : value * 10 + (text.s[i] - '0');
    }
    *index = value;
    return true;
}

/* Reads a list position, a map key or a public property of a native object (EXP-18, EXP-19, VAL-19). */
static pt_value pt_index(pt_ctx *ctx, pt_value container, pt_value key, const pt_frame *frame, const pt_expr *expr)
{
    if (container.type == PT_MAP) {
        pt_value *found = NULL;
        if (pt_is_string(key)) {
            found = pt_map_get(container.u.map, key.u.str.s, key.u.str.n);
        } else if (key.type == PT_NUMBER && pt_is_integer(key.u.number)) {
            pt_s text = pt_number_text(ctx->arena, key.u.number);
            found = pt_map_get(container.u.map, text.s, text.n);
        }
        return found ? *found : pt_null();
    }
    if (container.type == PT_LIST) {
        zend_long position;
        bool has = false;
        if (key.type == PT_NUMBER && pt_is_integer(key.u.number)) {
            position = zend_dval_to_lval(key.u.number);
            has = true;
        } else if (pt_is_string(key) && pt_canonical_digits(key.u.str, &position)) {
            has = true;
        }
        if (has && position >= 0 && position < (zend_long)container.u.list->count) {
            return container.u.list->items[position];
        }
        return pt_null();
    }
    if (container.type == PT_OBJECT && pt_is_string(key)) {
        pt_value value;
        bool found;
        pt_bind_error error = {NULL, NULL};
        if (!pt_object_property(ctx->arena, container.u.object, key.u.str, &value, &found, &error)) {
            pt_ctx_fail(ctx, error.code, frame, expr->start, expr->end, error.message);
        }
        return found ? value : pt_null();
    }
    return pt_null();
}

static pt_value pt_depth_checked(pt_ctx *ctx, pt_value value, const pt_frame *frame, const pt_expr *expr)
{
    if (!pt_depth_within(value, PT_MAX_DEPTH)) {
        PT_FAIL_AT(ctx, "E_RUNTIME_LIMIT", frame, expr, "a list or map literal nests deeper than %d levels", PT_MAX_DEPTH);
    }
    return value;
}

static pt_value *pt_evaluate_args(pt_ctx *ctx, const pt_expr *expr, const pt_frame *frame, pt_scope *scope)
{
    pt_value *args = pt_alloc(ctx->arena, sizeof(pt_value) * (expr->count ? expr->count : 1));
    for (uint32_t i = 0; i < expr->count; i++) {
        args[i] = pt_evaluate(ctx, expr->items[i], frame, scope);
    }
    return args;
}

static pt_value pt_call(pt_ctx *ctx, const pt_expr *expr, pt_value *args, const pt_frame *frame)
{
    const pt_builtin *builtin = pt_builtin_find(expr->name.s, expr->name.n);
    if (builtin != NULL) {
        uint32_t count = expr->count;
        if (count < builtin->min || count > builtin->max) {
            if (builtin->min == builtin->max) {
                PT_FAIL_AT(ctx, "E_RUNTIME_ARITY", frame, expr, "%s accepts %u arguments, got %u", expr->name.s, builtin->min, count);
            }
            PT_FAIL_AT(ctx, "E_RUNTIME_ARITY", frame, expr, "%s accepts %u to " ZEND_LONG_FMT " arguments, got %u", expr->name.s, builtin->min, builtin->max == UINT32_MAX ? ZEND_LONG_MAX : (zend_long)builtin->max, count);
        }
        pt_value result;
        pt_function_error error = {NULL, NULL};
        if (!builtin->call(ctx->arena, &ctx->request->env, args, count, &result, &error)) {
            pt_ctx_fail(ctx, error.code, frame, expr->start, expr->end, error.message);
        }
        return result;
    }
    zval *callable = zend_hash_str_find(&ctx->engine->functions, expr->name.s, expr->name.n);
    if (callable == NULL) {
        PT_FAIL_AT(ctx, "E_RUNTIME_UNKNOWN_FUNCTION", frame, expr, "%s is not a function", expr->name.s);
    }
    return pt_call_callable(ctx, callable, expr->name.s, args, expr->count, frame, expr);
}

static bool pt_equal(pt_value left, pt_value right, bool strict)
{
    return strict ? pt_strict_equals(left, right) : pt_loose_equals(left, right);
}

static pt_value pt_binary(pt_ctx *ctx, const pt_expr *expr, const pt_frame *frame, pt_scope *scope)
{
    pt_operator op = (pt_operator)expr->op;
    if (op == OP_AND) {
        pt_value left = pt_evaluate(ctx, expr->a, frame, scope);
        return pt_bool(pt_truthy(left) ? pt_truthy(pt_evaluate(ctx, expr->b, frame, scope)) : false);
    }
    if (op == OP_OR) {
        pt_value left = pt_evaluate(ctx, expr->a, frame, scope);
        return pt_bool(pt_truthy(left) ? true : pt_truthy(pt_evaluate(ctx, expr->b, frame, scope)));
    }
    if (op == OP_COALESCE) {
        pt_value left = pt_evaluate(ctx, expr->a, frame, scope);
        return left.type != PT_NULL ? left : pt_evaluate(ctx, expr->b, frame, scope);
    }
    pt_value left = pt_evaluate(ctx, expr->a, frame, scope);
    pt_value right = pt_evaluate(ctx, expr->b, frame, scope);
    switch (op) {
        case OP_ADD:
            if (left.type == PT_LIST || left.type == PT_MAP || right.type == PT_LIST || right.type == PT_MAP) {
                PT_FAIL_AT(ctx, "E_RUNTIME_STRINGIFY", frame, expr, "a list or map cannot be converted to text");
            }
            if (pt_is_string(left) || pt_is_string(right)) {
                pt_s a = pt_text_at(ctx, left, frame, expr->start, expr->end);
                pt_s b = pt_text_at(ctx, right, frame, expr->start, expr->end);
                pt_buf buf;
                pt_buf_init(&buf, ctx->arena);
                pt_buf_adds(&buf, a);
                pt_buf_adds(&buf, b);
                return pt_string(pt_buf_done(&buf));
            }
            return pt_number(pt_finite_at(ctx, pt_number_at(ctx, left, frame, expr) + pt_number_at(ctx, right, frame, expr), frame, expr));
        case OP_SUB:
            return pt_number(pt_finite_at(ctx, pt_number_at(ctx, left, frame, expr) - pt_number_at(ctx, right, frame, expr), frame, expr));
        case OP_MUL:
            return pt_number(pt_finite_at(ctx, pt_number_at(ctx, left, frame, expr) * pt_number_at(ctx, right, frame, expr), frame, expr));
        case OP_DIV: {
            double divisor = pt_number_at(ctx, right, frame, expr);
            if (divisor == 0.0) {
                PT_FAIL_AT(ctx, "E_RUNTIME_DIV_ZERO", frame, expr, "division by zero");
            }
            return pt_number(pt_finite_at(ctx, pt_number_at(ctx, left, frame, expr) / divisor, frame, expr));
        }
        case OP_MOD: {
            double dividend = pt_number_at(ctx, left, frame, expr);
            double divisor = pt_number_at(ctx, right, frame, expr);
            if (!pt_is_integer(dividend) || !pt_is_integer(divisor)) {
                PT_FAIL_AT(ctx, "E_RUNTIME_TYPE", frame, expr, "%% requires integer operands");
            }
            if (divisor == 0.0) {
                PT_FAIL_AT(ctx, "E_RUNTIME_DIV_ZERO", frame, expr, "division by zero");
            }
            return pt_number(fmod(dividend, divisor));
        }
        case OP_EQ: return pt_bool(pt_equal(left, right, false));
        case OP_NE: return pt_bool(!pt_equal(left, right, false));
        case OP_SEQ: return pt_bool(pt_equal(left, right, true));
        case OP_SNE: return pt_bool(!pt_equal(left, right, true));
        case OP_LT:
        case OP_GT:
        case OP_LE:
        case OP_GE: {
            int order;
            if (!pt_compare(left, right, &order)) {
                PT_FAIL_AT(ctx, "E_RUNTIME_COMPARE", frame, expr, "%s and %s have no order", pt_type_name(left), pt_type_name(right));
            }
            switch (op) {
                case OP_LT: return pt_bool(order < 0);
                case OP_GT: return pt_bool(order > 0);
                case OP_LE: return pt_bool(order <= 0);
                default: return pt_bool(order >= 0);
            }
        }
        case OP_IN:
            if (right.type == PT_LIST) {
                for (uint32_t i = 0; i < right.u.list->count; i++) {
                    if (pt_equal(right.u.list->items[i], left, false)) {
                        return pt_bool(true);
                    }
                }
                return pt_bool(false);
            }
            if (right.type == PT_MAP) {
                pt_s key = pt_text_at(ctx, left, frame, expr->start, expr->end);
                return pt_bool(pt_map_get(right.u.map, key.s, key.n) != NULL);
            }
            if (pt_is_string(right)) {
                pt_s needle = pt_text_at(ctx, left, frame, expr->start, expr->end);
                pt_s haystack = right.u.str;
                if (needle.n == 0) {
                    return pt_bool(true);
                }
                for (size_t i = 0; i + needle.n <= haystack.n; i++) {
                    if (memcmp(haystack.s + i, needle.s, needle.n) == 0) {
                        return pt_bool(true);
                    }
                }
                return pt_bool(false);
            }
            PT_FAIL_AT(ctx, "E_RUNTIME_TYPE", frame, expr, "in requires a list, map or string on the right");
        default:
            PT_FAIL_AT(ctx, "E_RUNTIME_TYPE", frame, expr, "unknown operator %s", pt_operator_text(op));
    }
}

static pt_value pt_evaluate_node(pt_ctx *ctx, const pt_expr *expr, const pt_frame *frame, pt_scope *scope)
{
    switch (expr->type) {
        case X_LITERAL:
            return expr->literal;
        case X_VAR:
            return pt_lookup(scope, frame, expr->name);
        case X_LOOP_META: {
            pt_loop *loop = pt_loop_of(scope, expr->name);
            if (loop == NULL || loop->count == 0) {
                PT_FAIL_AT(ctx, "E_RUNTIME_UNKNOWN_LOOP", frame, expr, "%s is not an active loop variable", expr->name.s);
            }
            const pt_meta *meta = &loop->stack[loop->count - 1];
            pt_s field = expr->name2;
            if (PT_EQ(field, "index_")) {
                return pt_number(meta->index);
            }
            if (PT_EQ(field, "key_")) {
                return meta->key;
            }
            if (PT_EQ(field, "value_")) {
                return meta->value;
            }
            if (PT_EQ(field, "first_")) {
                return pt_bool(meta->first);
            }
            if (PT_EQ(field, "last_")) {
                return pt_bool(meta->last);
            }
            return pt_number(meta->size);
        }
        case X_MEMBER: {
            pt_value container = pt_evaluate(ctx, expr->a, frame, scope);
            return pt_index(ctx, container, pt_string(expr->name), frame, expr);
        }
        case X_MEMBER_CALL: {
            pt_value *args = pt_evaluate_args(ctx, expr, frame, scope);
            pt_value container = pt_evaluate(ctx, expr->a, frame, scope);
            return pt_member_call(ctx, container, expr, args, frame);
        }
        case X_CLASS_CALL: {
            pt_value *args = pt_evaluate_args(ctx, expr, frame, scope);
            pt_buf key;
            pt_buf_init(&key, ctx->arena);
            pt_buf_adds(&key, expr->name);
            PT_BUF_LIT(&key, "::");
            pt_buf_adds(&key, expr->name2);
            pt_s name = pt_buf_done(&key);
            zval *callable = zend_hash_str_find(&ctx->engine->classes, name.s, name.n);
            if (callable == NULL) {
                PT_FAIL_AT(ctx, "E_RUNTIME_UNKNOWN_FUNCTION", frame, expr, "%s is not a function", name.s);
            }
            return pt_call_callable(ctx, callable, name.s, args, expr->count, frame, expr);
        }
        case X_INDEX: {
            pt_value container = pt_evaluate(ctx, expr->a, frame, scope);
            pt_value key = pt_evaluate(ctx, expr->b, frame, scope);
            return pt_index(ctx, container, key, frame, expr);
        }
        case X_CALL: {
            pt_value *args = pt_evaluate_args(ctx, expr, frame, scope);
            return pt_call(ctx, expr, args, frame);
        }
        case X_UNARY: {
            pt_value operand = pt_evaluate(ctx, expr->a, frame, scope);
            if (expr->op == OP_NOT) {
                return pt_bool(!pt_truthy(operand));
            }
            return pt_number(pt_finite_at(ctx, -pt_number_at(ctx, operand, frame, expr), frame, expr));
        }
        case X_BINARY:
            return pt_binary(ctx, expr, frame, scope);
        case X_TERNARY: {
            pt_value test = pt_evaluate(ctx, expr->a, frame, scope);
            if (expr->b == NULL) {
                return pt_truthy(test) ? test : pt_evaluate(ctx, expr->c, frame, scope);
            }
            return pt_truthy(test) ? pt_evaluate(ctx, expr->b, frame, scope) : pt_evaluate(ctx, expr->c, frame, scope);
        }
        case X_LIST: {
            pt_vec items;
            pt_vec_init(&items, ctx->arena);
            for (uint32_t i = 0; i < expr->count; i++) {
                const pt_expr *item = expr->items[i];
                if (item->type == X_SPREAD) {
                    pt_value spread = pt_evaluate(ctx, item->a, frame, scope);
                    if (spread.type != PT_LIST) {
                        PT_FAIL_AT(ctx, "E_RUNTIME_TYPE", frame, item, "spread in a list requires a list");
                    }
                    for (uint32_t k = 0; k < spread.u.list->count; k++) {
                        pt_vec_push(&items, spread.u.list->items[k]);
                    }
                } else {
                    pt_vec_push(&items, pt_evaluate(ctx, item, frame, scope));
                }
            }
            return pt_depth_checked(ctx, pt_list_value(pt_vec_list(&items)), frame, expr);
        }
        case X_MAP: {
            pt_map *map = pt_map_new(ctx->arena, expr->count);
            for (uint32_t i = 0; i < expr->count; i++) {
                const pt_expr *entry = expr->items[i];
                if (entry->type == X_SPREAD) {
                    pt_value spread = pt_evaluate(ctx, entry->a, frame, scope);
                    if (spread.type != PT_MAP) {
                        PT_FAIL_AT(ctx, "E_RUNTIME_TYPE", frame, entry, "spread in a map requires a map");
                    }
                    const pt_map *source = spread.u.map;
                    for (uint32_t k = 0; k < source->used; k++) {
                        if (source->entries[k].live) {
                            pt_map_set(map, source->entries[k].key, source->entries[k].value);
                        }
                    }
                } else {
                    pt_value key = pt_evaluate(ctx, entry->a, frame, scope);
                    pt_s text = pt_text_at(ctx, key, frame, entry->a->start, entry->a->end);
                    pt_map_set(map, text, pt_evaluate(ctx, entry->b, frame, scope));
                }
            }
            return pt_depth_checked(ctx, pt_map_value(map), frame, expr);
        }
        default:
            PT_FAIL_AT(ctx, "E_RUNTIME_TYPE", frame, expr, "unknown expression node");
    }
}

static pt_value pt_evaluate(pt_ctx *ctx, const pt_expr *expr, const pt_frame *frame, pt_scope *scope)
{
    ctx->depth++;
    if (ctx->depth > ctx->engine->limits.expression_depth) {
        PT_FAIL_AT(ctx, "E_RUNTIME_LIMIT", frame, expr, "expression nesting exceeds " ZEND_LONG_FMT, ctx->engine->limits.expression_depth);
    }
    pt_value value = pt_evaluate_node(ctx, expr, frame, scope);
    ctx->depth--;
    return value;
}

/* ----------------------------------------------------------------------------------------------- */
/* Statements                                                                                       */
/* ----------------------------------------------------------------------------------------------- */

static void pt_write(pt_ctx *ctx, pt_s text)
{
    if (text.n == 0) {
        return;
    }
    ctx->output_bytes += (zend_long)text.n;
    zend_long limit = ctx->engine->limits.output_bytes;
    if (ctx->output_bytes > limit) {
        pt_ctx_fail(ctx, "E_RUNTIME_LIMIT", ctx->frame, ctx->start, ctx->end, zend_strpprintf(0, "output exceeds " ZEND_LONG_FMT " bytes", limit));
    }
    smart_str_appendl(ctx->output, text.s, text.n);
}

static void pt_enter_template(pt_ctx *ctx, pt_s name, const pt_frame *frame, size_t start, size_t end)
{
    for (uint32_t i = 0; i < ctx->chain_count; i++) {
        if (pt_eq(ctx->chain[i], name.s, name.n)) {
            pt_ctx_fail(ctx, "E_LOAD_CYCLE", frame, start, end, zend_strpprintf(0, "%s is already being rendered", name.s));
        }
    }
    zend_long limit = ctx->engine->limits.depth;
    if ((zend_long)ctx->chain_count > limit) {
        pt_ctx_fail(ctx, "E_RUNTIME_DEPTH", frame, start, end, zend_strpprintf(0, "nesting depth exceeds " ZEND_LONG_FMT, limit));
    }
    if (ctx->chain_count == ctx->chain_capacity) {
        uint32_t capacity = ctx->chain_capacity ? ctx->chain_capacity * 2 : 8;
        pt_s *grown = pt_alloc(ctx->arena, sizeof(pt_s) * capacity);
        if (ctx->chain_count) {
            memcpy(grown, ctx->chain, sizeof(pt_s) * ctx->chain_count);
        }
        ctx->chain = grown;
        ctx->chain_capacity = capacity;
    }
    ctx->chain[ctx->chain_count++] = name;
}

static void pt_scope_init(pt_ctx *ctx, pt_scope *scope)
{
    scope->locals = pt_map_new(ctx->arena, 4);
    scope->loops = NULL;
    scope->loop_count = scope->loop_capacity = 0;
}

static void pt_render_nodes(pt_ctx *ctx, const pt_body *body, const pt_frame *frame, pt_scope *scope);

static pt_s pt_resolve_at(pt_ctx *ctx, pt_s path, const pt_frame *frame, size_t start, size_t end)
{
    pt_s name;
    if (!pt_resolve_path(ctx->arena, frame->name, path, &name)) {
        zend_string *quoted = pt_json_quote(path.s, path.n);
        zend_string *message = zend_strpprintf(0, "%s leaves the loader root", ZSTR_VAL(quoted));
        zend_string_release(quoted);
        pt_ctx_fail(ctx, "E_LOAD_OUTSIDE_ROOT", frame, start, end, message);
    }
    return name;
}

static void pt_render_for(pt_ctx *ctx, const pt_node *node, const pt_frame *frame, pt_scope *scope)
{
    pt_value iterable = pt_evaluate(ctx, node->expr, frame, scope);
    uint32_t size;
    if (iterable.type == PT_NULL) {
        size = 0;
    } else if (iterable.type == PT_LIST) {
        size = iterable.u.list->count;
    } else if (iterable.type == PT_MAP) {
        size = iterable.u.map->count;
    } else {
        pt_ctx_fail(ctx, "E_RUNTIME_TYPE", frame, node->start, node->end, zend_string_init("loop requires a list, a map or null", 35, 0));
    }
    if (size == 0) {
        if (node->has_alt) {
            pt_render_nodes(ctx, &node->alt, frame, scope);
        }
        return;
    }
    pt_s name = node->text;
    pt_value *previous_slot = pt_map_get(scope->locals, name.s, name.n);
    bool had_local = previous_slot != NULL;
    pt_value previous = had_local ? *previous_slot : pt_null();
    pt_loop *loop = pt_loop_of(scope, name);
    if (loop == NULL) {
        if (scope->loop_count == scope->loop_capacity) {
            uint32_t capacity = scope->loop_capacity ? scope->loop_capacity * 2 : 4;
            pt_loop *grown = pt_alloc(ctx->arena, sizeof(pt_loop) * capacity);
            if (scope->loop_count) {
                memcpy(grown, scope->loops, sizeof(pt_loop) * scope->loop_count);
            }
            scope->loops = grown;
            scope->loop_capacity = capacity;
        }
        loop = &scope->loops[scope->loop_count++];
        memset(loop, 0, sizeof(*loop));
        loop->name = name;
    }
    uint32_t loop_index = (uint32_t)(loop - scope->loops);
    /* The loop stack of the name gets one entry for this loop. */
    if (loop->count == loop->capacity) {
        uint32_t capacity = loop->capacity ? loop->capacity * 2 : 4;
        pt_meta *grown = pt_alloc(ctx->arena, sizeof(pt_meta) * capacity);
        if (loop->count) {
            memcpy(grown, loop->stack, sizeof(pt_meta) * loop->count);
        }
        loop->stack = grown;
        loop->capacity = capacity;
    }
    uint32_t level = loop->count++;
    uint32_t position = 0;
    const pt_map *map = iterable.type == PT_MAP ? iterable.u.map : NULL;
    for (uint32_t i = 0; position < size; i++) {
        pt_value key, value;
        if (map != NULL) {
            if (!map->entries[i].live) {
                continue;
            }
            key = pt_string(map->entries[i].key);
            value = map->entries[i].value;
        } else {
            key = pt_number(position);
            value = iterable.u.list->items[position];
        }
        ctx->iterations++;
        if (ctx->iterations > ctx->engine->limits.iterations) {
            pt_ctx_fail(ctx, "E_RUNTIME_LIMIT", frame, node->start, node->end, zend_strpprintf(0, "loop iterations exceed " ZEND_LONG_FMT, ctx->engine->limits.iterations));
        }
        /* The scope may have grown its loops while the body ran; the loop is found by its index. */
        loop = &scope->loops[loop_index];
        pt_meta *meta = &loop->stack[level];
        meta->index = position;
        meta->key = key;
        meta->value = value;
        meta->first = position == 0;
        meta->last = position == size - 1;
        meta->size = size;
        loop->count = level + 1;
        pt_map_set(scope->locals, name, value);
        pt_render_nodes(ctx, &node->body, frame, scope);
        position++;
    }
    scope->loops[loop_index].count = level;
    if (had_local) {
        pt_map_set(scope->locals, name, previous);
    } else {
        pt_map_remove(scope->locals, name.s, name.n);
    }
}

static void pt_render_include(pt_ctx *ctx, const pt_node *node, const pt_frame *frame, pt_scope *scope)
{
    pt_s name = pt_resolve_at(ctx, node->text, frame, node->start, node->end);
    pt_template *template = pt_load_template(ctx, name, frame, node->start, node->end);
    pt_enter_template(ctx, name, frame, node->start, node->end);
    pt_frame included = {template->name, &template->lines, frame->context};
    pt_render_nodes(ctx, &template->body, &included, scope);
    ctx->chain_count--;
}

static void pt_render_block(pt_ctx *ctx, const pt_node *node, const pt_frame *frame, pt_scope *scope)
{
    pt_define *entry;
    if (node->has_id && !node->has_path) {
        entry = zend_hash_str_find_ptr(ctx->registry, node->text.s, node->text.n);
        if (entry == NULL) {
            pt_ctx_fail(ctx, "E_RUNTIME_BLOCK_UNDEFINED", frame, node->start, node->end, zend_strpprintf(0, "define %s is not registered", node->text.s));
        }
    } else {
        pt_s name = pt_resolve_at(ctx, node->path, frame, node->start, node->end);
        entry = pt_alloc(ctx->arena, sizeof(pt_define));
        entry->html = false;
        entry->template = name;
        entry->data = NULL;
        if (node->has_id) {
            pt_define *registered = zend_hash_str_find_ptr(ctx->registry, node->text.s, node->text.n);
            if (registered != NULL) {
                if (registered->html || !pt_eq(registered->template, name.s, name.n)) {
                    pt_ctx_fail(ctx, "E_RUNTIME_BLOCK_REDEFINED", frame, node->start, node->end, zend_strpprintf(0, "define %s is registered with a different template", node->text.s));
                }
                entry = registered;
            } else {
                zend_hash_str_update_ptr(ctx->registry, node->text.s, node->text.n, entry);
            }
        }
    }
    if (entry->html) {
        pt_write(ctx, entry->template);
        return;
    }
    pt_map *data = pt_map_copy(ctx->arena, ctx->request->data);
    if (entry->data != NULL) {
        const pt_map *source = entry->data;
        for (uint32_t i = 0; i < source->used; i++) {
            if (source->entries[i].live) {
                pt_map_set(data, source->entries[i].key, source->entries[i].value);
            }
        }
    }
    for (uint32_t i = 0; i < node->scope_count; i++) {
        pt_map_set(data, node->scope[i].name, pt_evaluate(ctx, node->scope[i].expr, frame, scope));
    }
    pt_template *template = pt_load_template(ctx, entry->template, frame, node->start, node->end);
    pt_enter_template(ctx, entry->template, frame, node->start, node->end);
    pt_frame inner = {template->name, &template->lines, data};
    pt_scope fresh;
    pt_scope_init(ctx, &fresh);
    pt_render_nodes(ctx, &template->body, &inner, &fresh);
    ctx->chain_count--;
}

static void pt_render_node(pt_ctx *ctx, const pt_node *node, const pt_frame *frame, pt_scope *scope)
{
    ctx->frame = frame;
    ctx->start = node->start;
    ctx->end = node->end;
    switch (node->type) {
        case N_TEXT:
            pt_write(ctx, node->text);
            return;
        case N_ECHO: {
            pt_value value = pt_evaluate(ctx, node->expr, frame, scope);
            if (value.type == PT_SAFE) {
                pt_write(ctx, value.u.str);
                return;
            }
            pt_s text = pt_text_at(ctx, value, frame, node->expr->start, node->expr->end);
            pt_buf escaped;
            pt_buf_init(&escaped, ctx->arena);
            pt_escape_html(&escaped, text);
            pt_write(ctx, pt_buf_done(&escaped));
            return;
        }
        case N_IF:
            for (uint32_t i = 0; i < node->branch_count; i++) {
                if (pt_truthy(pt_evaluate(ctx, node->branches[i].test, frame, scope))) {
                    pt_render_nodes(ctx, &node->branches[i].body, frame, scope);
                    return;
                }
            }
            if (node->has_alt) {
                pt_render_nodes(ctx, &node->alt, frame, scope);
            }
            return;
        case N_FOR:
            pt_render_for(ctx, node, frame, scope);
            return;
        case N_SET:
            pt_map_set(scope->locals, node->text, pt_evaluate(ctx, node->expr, frame, scope));
            return;
        case N_INCLUDE:
            pt_render_include(ctx, node, frame, scope);
            return;
        case N_BLOCK:
            pt_render_block(ctx, node, frame, scope);
            return;
        case N_IF_BLOCK:
            if (zend_hash_str_exists(ctx->registry, node->text.s, node->text.n)) {
                pt_render_nodes(ctx, &node->body, frame, scope);
            } else if (node->has_alt) {
                pt_render_nodes(ctx, &node->alt, frame, scope);
            }
            return;
    }
}

static void pt_render_nodes(pt_ctx *ctx, const pt_body *body, const pt_frame *frame, pt_scope *scope)
{
    for (uint32_t i = 0; i < body->count; i++) {
        pt_render_node(ctx, body->nodes[i], frame, scope);
    }
}

void pt_render(pt_run *run, pt_engine *engine, const pt_request *request, smart_str *output)
{
    pt_ctx ctx;
    memset(&ctx, 0, sizeof(ctx));
    ctx.run = run;
    ctx.arena = &run->arena;
    ctx.engine = engine;
    ctx.request = request;
    ctx.output = output;
    /* The registry of the render starts with the definitions of the request; a block with an id and
     * a path adds to it (RT-24). */
    ctx.registry = zend_new_array(request->defines ? zend_hash_num_elements(request->defines) : 0);
    zval owner;
    ZVAL_ARR(&owner, ctx.registry);
    pt_arena_keep(ctx.arena, &owner);
    zval_ptr_dtor(&owner);
    if (request->defines) {
        zend_string *key;
        zval *entry;
        ZEND_HASH_FOREACH_STR_KEY_VAL(request->defines, key, entry) {
            zend_hash_update(ctx.registry, key, entry);
        } ZEND_HASH_FOREACH_END();
    }
    pt_s target = request->name;
    pt_define *defined = request->defines ? zend_hash_str_find_ptr(request->defines, request->name.s, request->name.n) : NULL;
    if (defined != NULL && !defined->html) {
        target = defined->template;
    }
    ctx.entry = target;
    pt_template *template = pt_load_template(&ctx, target, NULL, 0, 0);
    pt_enter_template(&ctx, target, NULL, 0, 0);
    pt_frame frame = {template->name, &template->lines, request->data};
    pt_scope scope;
    pt_scope_init(&ctx, &scope);
    pt_render_nodes(&ctx, &template->body, &frame, &scope);
}
