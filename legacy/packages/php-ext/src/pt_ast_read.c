/*
 * The template of an AST that PHP code gives as nested arrays (AST-*, RT-41): the inverse of pt_ast_to_zval. The fields are
 * those of docs/spec/ast.md that a render reads, so the comments of a template are not read. A field that is missing or
 * does not hold the value of its kind is an internal failure of the entry template; no value is made up in its place.
 */
#include "pt.h"

typedef struct pt_reader {
    pt_run *run;
    pt_arena *arena;
    pt_s name;
} pt_reader;

ZEND_NORETURN static void pt_reader_fail(pt_reader *reader, const char *what, const char *field)
{
    pt_fail_bare(reader->run, PT_E_INTERNAL, reader->name, zend_strpprintf(0, "internal failure: the AST has %s at %s", what, field));
}

static zval *pt_field(pt_reader *reader, zval *array, const char *key)
{
    ZVAL_DEREF(array);
    zval *value = Z_TYPE_P(array) == IS_ARRAY ? zend_hash_str_find_deref(Z_ARRVAL_P(array), key, strlen(key)) : NULL;
    if (value == NULL) {
        pt_reader_fail(reader, "no field", key);
    }
    return value;
}

static pt_s pt_text(pt_reader *reader, zval *array, const char *key)
{
    zval *value = pt_field(reader, array, key);
    if (Z_TYPE_P(value) != IS_STRING) {
        pt_reader_fail(reader, "a field that is not a string", key);
    }
    return pt_strdup(reader->arena, Z_STRVAL_P(value), Z_STRLEN_P(value));
}

static zval *pt_list_field(pt_reader *reader, zval *array, const char *key)
{
    zval *value = pt_field(reader, array, key);
    if (Z_TYPE_P(value) != IS_ARRAY) {
        pt_reader_fail(reader, "a field that is not an array", key);
    }
    return value;
}

static void pt_span(pt_reader *reader, zval *array, size_t *start, size_t *end)
{
    zval *span = pt_list_field(reader, array, "span");
    zval *first = zend_hash_index_find(Z_ARRVAL_P(span), 0), *second = zend_hash_index_find(Z_ARRVAL_P(span), 1);
    if (first == NULL || second == NULL) {
        pt_reader_fail(reader, "a malformed span", "span");
    }
    ZVAL_DEREF(first);
    ZVAL_DEREF(second);
    if (Z_TYPE_P(first) != IS_LONG || Z_TYPE_P(second) != IS_LONG || Z_LVAL_P(first) < 0 || Z_LVAL_P(second) < 0) {
        pt_reader_fail(reader, "a span that is not two byte offsets", "span");
    }
    *start = (size_t)Z_LVAL_P(first);
    *end = (size_t)Z_LVAL_P(second);
}

static pt_expr *pt_read_expr(pt_reader *reader, zval *input);

static pt_expr *pt_read_optional_expr(pt_reader *reader, zval *array, const char *key)
{
    zval *value = pt_field(reader, array, key);
    return Z_TYPE_P(value) == IS_NULL ? NULL : pt_read_expr(reader, value);
}

static pt_expr *pt_read_required_expr(pt_reader *reader, zval *array, const char *key)
{
    return pt_read_expr(reader, pt_field(reader, array, key));
}

static void pt_read_exprs(pt_reader *reader, zval *array, const char *key, pt_expr ***items, uint32_t *count)
{
    zval *list = pt_list_field(reader, array, key);
    uint32_t n = zend_hash_num_elements(Z_ARRVAL_P(list));
    *items = pt_alloc(reader->arena, sizeof(pt_expr *) * (n ? n : 1));
    *count = 0;
    zval *item;
    ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(list), item) {
        (*items)[(*count)++] = pt_read_expr(reader, item);
    } ZEND_HASH_FOREACH_END();
}

static pt_operator pt_read_operator(pt_reader *reader, zval *array)
{
    pt_s text = pt_text(reader, array, "op");
    for (int op = OP_NOT; op <= OP_COALESCE; op++) {
        if (pt_eq(text, pt_operator_text((pt_operator)op), strlen(pt_operator_text((pt_operator)op)))) {
            return (pt_operator)op;
        }
    }
    pt_reader_fail(reader, "an unknown operator", "op");
}

static pt_expr *pt_read_expr(pt_reader *reader, zval *input)
{
    ZVAL_DEREF(input);
    pt_expr *expr = pt_alloc(reader->arena, sizeof(pt_expr));
    memset(expr, 0, sizeof(*expr));
    zval *type = Z_TYPE_P(input) == IS_ARRAY ? zend_hash_str_find_deref(Z_ARRVAL_P(input), "type", 4) : NULL;
    if (Z_TYPE_P(input) != IS_ARRAY) {
        pt_reader_fail(reader, "an expression that is not an array", "expr");
    }
    if (type == NULL) {
        /* A map entry has no type and no span. */
        expr->type = X_PAIR;
        expr->a = pt_read_required_expr(reader, input, "key");
        expr->b = pt_read_required_expr(reader, input, "value");
        return expr;
    }
    if (Z_TYPE_P(type) != IS_STRING) {
        pt_reader_fail(reader, "a type that is not a string", "type");
    }
    pt_span(reader, input, &expr->start, &expr->end);
    pt_s kind = {Z_STRVAL_P(type), Z_STRLEN_P(type)};
    if (PT_EQ(kind, "Literal")) {
        expr->type = X_LITERAL;
        pt_s literal = pt_text(reader, input, "kind");
        zval *value = pt_field(reader, input, "value");
        if (PT_EQ(literal, "null") && Z_TYPE_P(value) == IS_NULL) {
            expr->kind = L_NULL;
            expr->literal = pt_null();
        } else if (PT_EQ(literal, "bool") && (Z_TYPE_P(value) == IS_TRUE || Z_TYPE_P(value) == IS_FALSE)) {
            expr->kind = L_BOOL;
            expr->literal = pt_bool(Z_TYPE_P(value) == IS_TRUE);
        } else if (PT_EQ(literal, "number") && (Z_TYPE_P(value) == IS_LONG || Z_TYPE_P(value) == IS_DOUBLE)) {
            expr->kind = L_NUMBER;
            expr->literal = pt_number(Z_TYPE_P(value) == IS_LONG ? (double)Z_LVAL_P(value) : Z_DVAL_P(value));
        } else if (PT_EQ(literal, "string") && Z_TYPE_P(value) == IS_STRING) {
            expr->kind = L_STRING;
            expr->literal = pt_string(pt_strdup(reader->arena, Z_STRVAL_P(value), Z_STRLEN_P(value)));
        } else if (PT_EQ(literal, "null") || PT_EQ(literal, "bool") || PT_EQ(literal, "number") || PT_EQ(literal, "string")) {
            pt_reader_fail(reader, "a literal value that is not of its kind", "value");
        } else {
            pt_reader_fail(reader, "an unknown literal kind", "kind");
        }
    } else if (PT_EQ(kind, "Var")) {
        expr->type = X_VAR;
        expr->name = pt_text(reader, input, "name");
    } else if (PT_EQ(kind, "LoopMeta")) {
        expr->type = X_LOOP_META;
        expr->name = pt_text(reader, input, "loop");
        expr->name2 = pt_text(reader, input, "field");
    } else if (PT_EQ(kind, "Member")) {
        expr->type = X_MEMBER;
        expr->a = pt_read_required_expr(reader, input, "object");
        expr->name = pt_text(reader, input, "key");
    } else if (PT_EQ(kind, "MemberCall")) {
        expr->type = X_MEMBER_CALL;
        expr->a = pt_read_required_expr(reader, input, "object");
        expr->name = pt_text(reader, input, "method");
        pt_read_exprs(reader, input, "args", &expr->items, &expr->count);
    } else if (PT_EQ(kind, "ClassCall")) {
        expr->type = X_CLASS_CALL;
        expr->name = pt_text(reader, input, "className");
        expr->name2 = pt_text(reader, input, "method");
        pt_read_exprs(reader, input, "args", &expr->items, &expr->count);
    } else if (PT_EQ(kind, "Index")) {
        expr->type = X_INDEX;
        expr->a = pt_read_required_expr(reader, input, "object");
        expr->b = pt_read_required_expr(reader, input, "index");
    } else if (PT_EQ(kind, "Call")) {
        expr->type = X_CALL;
        expr->name = pt_text(reader, input, "name");
        pt_read_exprs(reader, input, "args", &expr->items, &expr->count);
    } else if (PT_EQ(kind, "Unary")) {
        expr->type = X_UNARY;
        expr->op = pt_read_operator(reader, input);
        expr->a = pt_read_required_expr(reader, input, "operand");
    } else if (PT_EQ(kind, "Binary")) {
        expr->type = X_BINARY;
        expr->op = pt_read_operator(reader, input);
        expr->a = pt_read_required_expr(reader, input, "left");
        expr->b = pt_read_required_expr(reader, input, "right");
    } else if (PT_EQ(kind, "Ternary")) {
        expr->type = X_TERNARY;
        expr->a = pt_read_required_expr(reader, input, "test");
        expr->b = pt_read_optional_expr(reader, input, "then");
        expr->c = pt_read_required_expr(reader, input, "else");
    } else if (PT_EQ(kind, "List")) {
        expr->type = X_LIST;
        pt_read_exprs(reader, input, "items", &expr->items, &expr->count);
    } else if (PT_EQ(kind, "Map")) {
        expr->type = X_MAP;
        pt_read_exprs(reader, input, "entries", &expr->items, &expr->count);
    } else if (PT_EQ(kind, "Spread")) {
        expr->type = X_SPREAD;
        expr->a = pt_read_required_expr(reader, input, "expr");
    } else {
        pt_reader_fail(reader, "an unknown expression type", "type");
    }
    return expr;
}

static pt_node *pt_read_node(pt_reader *reader, zval *input);

static pt_body pt_read_body(pt_reader *reader, zval *array, const char *key)
{
    zval *list = pt_list_field(reader, array, key);
    pt_body body;
    uint32_t n = zend_hash_num_elements(Z_ARRVAL_P(list));
    body.nodes = pt_alloc(reader->arena, sizeof(pt_node *) * (n ? n : 1));
    body.count = 0;
    zval *item;
    ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(list), item) {
        body.nodes[body.count++] = pt_read_node(reader, item);
    } ZEND_HASH_FOREACH_END();
    return body;
}

/* The optional body of an else or an empty branch: null is none. */
static bool pt_read_alt(pt_reader *reader, zval *array, const char *key, pt_body *body)
{
    zval *value = pt_field(reader, array, key);
    if (Z_TYPE_P(value) == IS_NULL) {
        return false;
    }
    *body = pt_read_body(reader, array, key);
    return true;
}

static pt_node *pt_read_node(pt_reader *reader, zval *input)
{
    ZVAL_DEREF(input);
    pt_node *node = pt_alloc(reader->arena, sizeof(pt_node));
    memset(node, 0, sizeof(*node));
    zval *type = pt_field(reader, input, "type");
    if (Z_TYPE_P(type) != IS_STRING) {
        pt_reader_fail(reader, "a type that is not a string", "type");
    }
    pt_span(reader, input, &node->start, &node->end);
    pt_s kind = {Z_STRVAL_P(type), Z_STRLEN_P(type)};
    if (PT_EQ(kind, "Text")) {
        node->type = N_TEXT;
        node->text = pt_text(reader, input, "value");
    } else if (PT_EQ(kind, "Echo")) {
        node->type = N_ECHO;
        node->expr = pt_read_required_expr(reader, input, "expr");
    } else if (PT_EQ(kind, "Set")) {
        node->type = N_SET;
        node->text = pt_text(reader, input, "name");
        node->expr = pt_read_required_expr(reader, input, "expr");
    } else if (PT_EQ(kind, "Include")) {
        node->type = N_INCLUDE;
        node->text = pt_text(reader, input, "path");
    } else if (PT_EQ(kind, "Block")) {
        node->type = N_BLOCK;
        zval *id = pt_field(reader, input, "id"), *path = pt_field(reader, input, "path");
        if (Z_TYPE_P(id) != IS_NULL) {
            node->has_id = true;
            node->text = pt_text(reader, input, "id");
        }
        if (Z_TYPE_P(path) != IS_NULL) {
            node->has_path = true;
            node->path = pt_text(reader, input, "path");
        }
        zval *scope = pt_list_field(reader, input, "scope");
        uint32_t n = zend_hash_num_elements(Z_ARRVAL_P(scope));
        node->scope = pt_alloc(reader->arena, sizeof(pt_scope_item) * (n ? n : 1));
        zval *item;
        ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(scope), item) {
            node->scope[node->scope_count].name = pt_text(reader, item, "name");
            node->scope[node->scope_count].expr = pt_read_required_expr(reader, item, "expr");
            node->scope_count++;
        } ZEND_HASH_FOREACH_END();
    } else if (PT_EQ(kind, "If")) {
        node->type = N_IF;
        zval *branches = pt_list_field(reader, input, "branches");
        uint32_t n = zend_hash_num_elements(Z_ARRVAL_P(branches));
        node->branches = pt_alloc(reader->arena, sizeof(pt_branch) * (n ? n : 1));
        zval *item;
        ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(branches), item) {
            pt_branch *branch = &node->branches[node->branch_count++];
            branch->test = pt_read_required_expr(reader, item, "test");
            branch->body = pt_read_body(reader, item, "body");
            pt_span(reader, item, &branch->start, &branch->end);
        } ZEND_HASH_FOREACH_END();
        node->has_alt = pt_read_alt(reader, input, "else", &node->alt);
    } else if (PT_EQ(kind, "For")) {
        node->type = N_FOR;
        node->text = pt_text(reader, input, "name");
        node->expr = pt_read_required_expr(reader, input, "iter");
        node->body = pt_read_body(reader, input, "body");
        node->has_alt = pt_read_alt(reader, input, "empty", &node->alt);
    } else if (PT_EQ(kind, "IfBlock")) {
        node->type = N_IF_BLOCK;
        node->text = pt_text(reader, input, "id");
        node->body = pt_read_body(reader, input, "body");
        node->has_alt = pt_read_alt(reader, input, "else", &node->alt);
    } else {
        pt_reader_fail(reader, "an unknown node type", "type");
    }
    return node;
}

pt_template *pt_ast_from_zval(pt_run *run, zval *ast)
{
    pt_template *template = ecalloc(1, sizeof(pt_template));
    pt_arena_init(&template->arena);
    template->refcount = 1;
    run->parsing = template;
    pt_reader reader = {run, &template->arena, PT_S("")};
    template->name = pt_text(&reader, ast, "name");
    reader.name = template->name;
    template->text = PT_S("");
    template->body = pt_read_body(&reader, ast, "body");
    run->parsing = NULL;
    return template;
}
