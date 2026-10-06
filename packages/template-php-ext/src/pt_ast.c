/*
 * The AST as nested PHP arrays with the fields of docs/spec/ast.md in their order (RT-2). A number
 * literal that is an integer within the safe range is a PHP integer, so the JSON text writes it as
 * an integer.
 */
#include "pt.h"
#include <math.h>

static void pt_add_string(zval *array, const char *key, pt_s value)
{
    add_assoc_stringl_ex(array, key, strlen(key), value.s, value.n);
}

static void pt_add_span(zval *array, size_t start, size_t end)
{
    zval span;
    array_init_size(&span, 2);
    add_next_index_long(&span, (zend_long)start);
    add_next_index_long(&span, (zend_long)end);
    add_assoc_zval_ex(array, "span", 4, &span);
}

static void pt_number_zval(double value, zval *result)
{
    if (pt_is_integer(value) && fabs(value) <= PT_MAX_SAFE) {
        ZVAL_LONG(result, (zend_long)value);
    } else {
        ZVAL_DOUBLE(result, value);
    }
}

static void pt_expr_zval(const pt_expr *expr, zval *result);

static void pt_exprs_zval(pt_expr *const *items, uint32_t count, zval *result)
{
    array_init_size(result, count);
    for (uint32_t i = 0; i < count; i++) {
        zval item;
        pt_expr_zval(items[i], &item);
        add_next_index_zval(result, &item);
    }
}

static void pt_add_expr(zval *array, const char *key, const pt_expr *expr)
{
    zval value;
    if (expr == NULL) {
        ZVAL_NULL(&value);
    } else {
        pt_expr_zval(expr, &value);
    }
    add_assoc_zval_ex(array, key, strlen(key), &value);
}

static void pt_add_exprs(zval *array, const char *key, pt_expr *const *items, uint32_t count)
{
    zval value;
    pt_exprs_zval(items, count, &value);
    add_assoc_zval_ex(array, key, strlen(key), &value);
}

static void pt_expr_zval(const pt_expr *expr, zval *result)
{
    array_init(result);
    switch (expr->type) {
        case X_LITERAL: {
            add_assoc_string_ex(result, "type", 4, "Literal");
            static const char *const kinds[] = {"null", "bool", "number", "string"};
            add_assoc_string_ex(result, "kind", 4, (char *)kinds[expr->kind]);
            zval value;
            switch (expr->kind) {
                case L_NULL: ZVAL_NULL(&value); break;
                case L_BOOL: ZVAL_BOOL(&value, expr->literal.u.b); break;
                case L_NUMBER: pt_number_zval(expr->literal.u.number, &value); break;
                default: ZVAL_STRINGL(&value, expr->literal.u.str.s, expr->literal.u.str.n); break;
            }
            add_assoc_zval_ex(result, "value", 5, &value);
            break;
        }
        case X_VAR:
            add_assoc_string_ex(result, "type", 4, "Var");
            pt_add_string(result, "name", expr->name);
            break;
        case X_LOOP_META:
            add_assoc_string_ex(result, "type", 4, "LoopMeta");
            pt_add_string(result, "loop", expr->name);
            pt_add_string(result, "field", expr->name2);
            break;
        case X_MEMBER:
            add_assoc_string_ex(result, "type", 4, "Member");
            pt_add_expr(result, "object", expr->a);
            pt_add_string(result, "key", expr->name);
            break;
        case X_MEMBER_CALL:
            add_assoc_string_ex(result, "type", 4, "MemberCall");
            pt_add_expr(result, "object", expr->a);
            pt_add_string(result, "method", expr->name);
            pt_add_exprs(result, "args", expr->items, expr->count);
            break;
        case X_CLASS_CALL:
            add_assoc_string_ex(result, "type", 4, "ClassCall");
            pt_add_string(result, "className", expr->name);
            pt_add_string(result, "method", expr->name2);
            pt_add_exprs(result, "args", expr->items, expr->count);
            break;
        case X_INDEX:
            add_assoc_string_ex(result, "type", 4, "Index");
            pt_add_expr(result, "object", expr->a);
            pt_add_expr(result, "index", expr->b);
            break;
        case X_CALL:
            add_assoc_string_ex(result, "type", 4, "Call");
            pt_add_string(result, "name", expr->name);
            pt_add_exprs(result, "args", expr->items, expr->count);
            break;
        case X_UNARY:
            add_assoc_string_ex(result, "type", 4, "Unary");
            add_assoc_string_ex(result, "op", 2, (char *)pt_operator_text((pt_operator)expr->op));
            pt_add_expr(result, "operand", expr->a);
            break;
        case X_BINARY:
            add_assoc_string_ex(result, "type", 4, "Binary");
            add_assoc_string_ex(result, "op", 2, (char *)pt_operator_text((pt_operator)expr->op));
            pt_add_expr(result, "left", expr->a);
            pt_add_expr(result, "right", expr->b);
            break;
        case X_TERNARY:
            add_assoc_string_ex(result, "type", 4, "Ternary");
            pt_add_expr(result, "test", expr->a);
            pt_add_expr(result, "then", expr->b);
            pt_add_expr(result, "else", expr->c);
            break;
        case X_LIST:
            add_assoc_string_ex(result, "type", 4, "List");
            pt_add_exprs(result, "items", expr->items, expr->count);
            break;
        case X_MAP:
            add_assoc_string_ex(result, "type", 4, "Map");
            pt_add_exprs(result, "entries", expr->items, expr->count);
            break;
        case X_SPREAD:
            add_assoc_string_ex(result, "type", 4, "Spread");
            pt_add_expr(result, "expr", expr->a);
            break;
        case X_PAIR:
            /* A map entry has no type and no span. */
            pt_add_expr(result, "key", expr->a);
            pt_add_expr(result, "value", expr->b);
            return;
    }
    pt_add_span(result, expr->start, expr->end);
}

static void pt_body_zval(const pt_body *body, zval *result);

static void pt_add_body(zval *array, const char *key, const pt_body *body)
{
    zval value;
    pt_body_zval(body, &value);
    add_assoc_zval_ex(array, key, strlen(key), &value);
}

static void pt_add_alt(zval *array, const char *key, const pt_node *node)
{
    if (node->has_alt) {
        pt_add_body(array, key, &node->alt);
    } else {
        add_assoc_null_ex(array, key, strlen(key));
    }
}

static void pt_node_zval(const pt_node *node, zval *result)
{
    array_init(result);
    switch (node->type) {
        case N_TEXT:
            add_assoc_string_ex(result, "type", 4, "Text");
            pt_add_string(result, "value", node->text);
            break;
        case N_ECHO:
            add_assoc_string_ex(result, "type", 4, "Echo");
            pt_add_expr(result, "expr", node->expr);
            break;
        case N_SET:
            add_assoc_string_ex(result, "type", 4, "Set");
            pt_add_string(result, "name", node->text);
            pt_add_expr(result, "expr", node->expr);
            break;
        case N_INCLUDE:
            add_assoc_string_ex(result, "type", 4, "Include");
            pt_add_string(result, "path", node->text);
            break;
        case N_BLOCK: {
            add_assoc_string_ex(result, "type", 4, "Block");
            if (node->has_id) {
                pt_add_string(result, "id", node->text);
            } else {
                add_assoc_null_ex(result, "id", 2);
            }
            if (node->has_path) {
                pt_add_string(result, "path", node->path);
            } else {
                add_assoc_null_ex(result, "path", 4);
            }
            zval scope;
            array_init_size(&scope, node->scope_count);
            for (uint32_t i = 0; i < node->scope_count; i++) {
                zval item;
                array_init_size(&item, 2);
                pt_add_string(&item, "name", node->scope[i].name);
                pt_add_expr(&item, "expr", node->scope[i].expr);
                add_next_index_zval(&scope, &item);
            }
            add_assoc_zval_ex(result, "scope", 5, &scope);
            break;
        }
        case N_IF: {
            add_assoc_string_ex(result, "type", 4, "If");
            zval branches;
            array_init_size(&branches, node->branch_count);
            for (uint32_t i = 0; i < node->branch_count; i++) {
                zval branch;
                array_init_size(&branch, 3);
                pt_add_expr(&branch, "test", node->branches[i].test);
                pt_add_body(&branch, "body", &node->branches[i].body);
                pt_add_span(&branch, node->branches[i].start, node->branches[i].end);
                add_next_index_zval(&branches, &branch);
            }
            add_assoc_zval_ex(result, "branches", 8, &branches);
            pt_add_alt(result, "else", node);
            break;
        }
        case N_FOR:
            add_assoc_string_ex(result, "type", 4, "For");
            pt_add_string(result, "name", node->text);
            pt_add_expr(result, "iter", node->expr);
            pt_add_body(result, "body", &node->body);
            pt_add_alt(result, "empty", node);
            break;
        case N_IF_BLOCK:
            add_assoc_string_ex(result, "type", 4, "IfBlock");
            pt_add_string(result, "id", node->text);
            pt_add_body(result, "body", &node->body);
            pt_add_alt(result, "else", node);
            break;
    }
    pt_add_span(result, node->start, node->end);
}

static void pt_body_zval(const pt_body *body, zval *result)
{
    array_init_size(result, body->count);
    for (uint32_t i = 0; i < body->count; i++) {
        zval node;
        pt_node_zval(body->nodes[i], &node);
        add_next_index_zval(result, &node);
    }
}

void pt_ast_to_zval(const pt_template *template, zval *result)
{
    array_init_size(result, 4);
    add_assoc_string_ex(result, "type", 4, "Template");
    pt_add_string(result, "name", template->name);
    pt_add_body(result, "body", &template->body);
    zval comments;
    array_init_size(&comments, template->comment_count);
    for (uint32_t i = 0; i < template->comment_count; i++) {
        zval comment;
        array_init_size(&comment, 3);
        add_assoc_string_ex(&comment, "type", 4, "Comment");
        pt_add_string(&comment, "value", template->comments[i].value);
        pt_add_span(&comment, template->comments[i].start, template->comments[i].end);
        add_next_index_zval(&comments, &comment);
    }
    add_assoc_zval_ex(result, "comments", 8, &comments);
}
