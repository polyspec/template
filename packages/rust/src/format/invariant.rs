//! Safety invariant: two templates are equivalent when their ASTs are equal after every `span` field is removed (AST-2,
//! AST-7), and, for indented lines, after the spaces and tabs at the start of every line of text are removed. The ASTs
//! are compared as the AST types, with every span set to `[0, 0]`.

use crate::ast::{Expr, MapEntry, Node, Template};

/// Whether two ASTs are equal without their spans and, with `unindent`, without the indentation of their lines of text.
pub fn same_tree(left: &Template, right: &Template, unindent: bool) -> bool {
    normalized(left, unindent) == normalized(right, unindent)
}

fn normalized(template: &Template, unindent: bool) -> Template {
    let mut template = template.clone();
    for comment in &mut template.comments {
        comment.span = [0, 0];
    }
    nodes(&mut template.body, unindent);
    template
}

/// Removes the spans of the nodes and, with `unindent`, the spaces and tabs at the start of every line of a `Text` node;
/// a `Text` node that becomes empty is removed: indentation after a line that the renderer removes is a `Text` node of
/// its own.
fn nodes(items: &mut Vec<Node>, unindent: bool) {
    for node in items.iter_mut() {
        match node {
            Node::Text { value, span } => {
                *span = [0, 0];
                if unindent {
                    *value = unindented(value);
                }
            }
            Node::Echo { expr, span } | Node::Set { expr, span, .. } => {
                *span = [0, 0];
                self::expr(expr);
            }
            Node::If { branches, r#else, span } => {
                *span = [0, 0];
                for branch in branches {
                    branch.span = [0, 0];
                    expr(&mut branch.test);
                    nodes(&mut branch.body, unindent);
                }
                if let Some(body) = r#else {
                    nodes(body, unindent);
                }
            }
            Node::For {
                iter, body, empty, span, ..
            } => {
                *span = [0, 0];
                expr(iter);
                nodes(body, unindent);
                if let Some(body) = empty {
                    nodes(body, unindent);
                }
            }
            Node::Include { span, .. } => *span = [0, 0],
            Node::Block { scope, span, .. } => {
                *span = [0, 0];
                for item in scope {
                    expr(&mut item.expr);
                }
            }
            Node::IfBlock { body, r#else, span, .. } => {
                *span = [0, 0];
                nodes(body, unindent);
                if let Some(body) = r#else {
                    nodes(body, unindent);
                }
            }
        }
    }
    if unindent {
        items.retain(|node| !matches!(node, Node::Text { value, .. } if value.is_empty()));
    }
}

fn expr(expr: &mut Expr) {
    match expr {
        Expr::Literal { span, .. } | Expr::Var { span, .. } | Expr::LoopMeta { span, .. } => *span = [0, 0],
        Expr::Member { object, span, .. } => {
            *span = [0, 0];
            self::expr(object);
        }
        Expr::MemberCall { object, args, span, .. } => {
            *span = [0, 0];
            self::expr(object);
            args.iter_mut().for_each(self::expr);
        }
        Expr::ClassCall { args, span, .. } | Expr::Call { args, span, .. } | Expr::List { items: args, span } => {
            *span = [0, 0];
            args.iter_mut().for_each(self::expr);
        }
        Expr::Index { object, index, span } => {
            *span = [0, 0];
            self::expr(object);
            self::expr(index);
        }
        Expr::Unary { operand, span, .. } | Expr::Spread { expr: operand, span } => {
            *span = [0, 0];
            self::expr(operand);
        }
        Expr::Binary { left, right, span, .. } => {
            *span = [0, 0];
            self::expr(left);
            self::expr(right);
        }
        Expr::Ternary { test, then, r#else, span } => {
            *span = [0, 0];
            self::expr(test);
            if let Some(then) = then {
                self::expr(then);
            }
            self::expr(r#else);
        }
        Expr::Map { entries, span } => {
            *span = [0, 0];
            for entry in entries {
                match entry {
                    MapEntry::Entry { key, value } => {
                        self::expr(key);
                        self::expr(value);
                    }
                    MapEntry::Spread { expr: spread } => self::expr(spread),
                }
            }
        }
    }
}

fn unindented(value: &str) -> String {
    value
        .split('\n')
        .map(|line| line.trim_start_matches([' ', '\t']))
        .collect::<Vec<_>>()
        .join("\n")
}
