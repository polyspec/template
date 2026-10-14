//! Expression spacing: joins the expression tokens of one tag with the separators of the formatting style.

use crate::parser::TokenKind;

/// An expression token: its text and the EDT-8 class that the parser gives it.
#[derive(Debug, Clone, Copy)]
pub struct ExpressionToken<'a> {
    /// Source text of the token.
    pub text: &'a str,
    /// Class of the token.
    pub kind: TokenKind,
}

// A name that can be called or indexed: a variable or a function name, not a keyword.
fn is_name(token: &ExpressionToken) -> bool {
    token.kind == TokenKind::Variable || (token.kind == TokenKind::Function && !token.text.starts_with('.'))
}

// DOT_IDENT and DOT_INDEX tokens (EXP-5). They must stay adjacent to the token on their left.
fn is_accessor(token: &ExpressionToken) -> bool {
    token.kind == TokenKind::Property || (token.kind == TokenKind::Function && token.text.starts_with('.'))
}

// True when the token can end an operand, so that a following `-` is binary and a following `[` is an index.
fn ends_operand(token: Option<&ExpressionToken>) -> bool {
    let Some(token) = token else { return false };
    if token.text == ")" || token.text == "]" {
        return true;
    }
    if token.kind == TokenKind::Keyword {
        return token.text != "in";
    }
    token.kind != TokenKind::Operator
}

/// Joins expression tokens with the separators of the formatting style: one space around binary and ternary
/// operators, `|`, `=>` and `in`; one space after `,`; no space after `(`, `[`, `...` and unary `!` and `-`; no space
/// before `,`, `)`, `]` and accessors; no space between a function or method name and `(`, between an operand and an
/// index `[`, and around the `::` token of `Class::name`.
pub fn join_tokens(tokens: &[ExpressionToken]) -> String {
    let unary: Vec<bool> = tokens
        .iter()
        .enumerate()
        .map(|(index, token)| token.text == "!" || (token.text == "-" && !ends_operand(index.checked_sub(1).map(|i| &tokens[i]))))
        .collect();
    let mut output = tokens.first().map_or(String::new(), |token| token.text.to_string());
    for index in 1..tokens.len() {
        output.push_str(separator(&tokens[index - 1], &tokens[index], unary[index - 1]));
        output.push_str(tokens[index].text);
    }
    output
}

fn separator(previous: &ExpressionToken, current: &ExpressionToken, previous_unary: bool) -> &'static str {
    if previous.text == "::" || current.text == "::" {
        return "";
    }
    if current.text == "," || current.text == ")" || current.text == "]" || is_accessor(current) {
        return "";
    }
    if previous.text == "(" || previous.text == "[" || previous.text == "..." || previous_unary {
        return "";
    }
    if current.text == "(" {
        return if is_name(previous) || is_accessor(previous) { "" } else { " " };
    }
    if current.text == "[" {
        return if ends_operand(Some(previous)) { "" } else { " " };
    }
    " "
}
