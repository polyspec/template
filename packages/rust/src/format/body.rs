//! Tag body formatting: writes the body of each tag kind in the formatting style (GRM-2).

use crate::format::expression::{ExpressionToken, join_tokens};
use crate::parser::{SyntaxToken, TagKind};

/// The source text of one tag body and the tokens that the parser classified inside it, its sigil first.
pub struct BodyInput<'a> {
    /// Kind of the tag.
    pub kind: TagKind,
    /// The whole source text.
    pub source: &'a str,
    /// Byte offset after the open delimiter.
    pub body_start: usize,
    /// Byte offset of the close delimiter.
    pub body_end: usize,
    /// The tokens inside the body.
    pub tokens: &'a [SyntaxToken],
}

fn is_whitespace(text: &str) -> bool {
    text.bytes().all(|byte| matches!(byte, b' ' | b'\t' | b'\r' | b'\n'))
}

// The white space that the trim of the reference implementation removes: ECMAScript WhiteSpace and LineTerminator.
fn is_trimmed(character: char) -> bool {
    matches!(
        character,
        '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'
    )
}

/// Returns the formatted body of a tag, or None when the tag is kept as written: comments, directives, bodies that
/// contain a line terminator and bodies whose expression tokens do not cover every non-whitespace character.
pub fn format_body(input: &BodyInput) -> Option<String> {
    let BodyInput {
        kind,
        source,
        body_start,
        body_end,
        tokens,
    } = *input;
    let body = &source[body_start..body_end];
    if body.contains(['\r', '\n']) || kind == TagKind::Comment || kind == TagKind::Directive {
        return None;
    }
    let sigil = tokens[0];
    let rest = &tokens[1..];
    let text = |token: &SyntaxToken| &source[token.start..token.end];
    let after = source[sigil.end..body_end].trim_matches(is_trimmed);
    match kind {
        TagKind::Echo => with_rest("=", expression_text(input, rest, sigil.end)),
        TagKind::If => with_rest("?", expression_text(input, rest, sigil.end)),
        TagKind::Elseif => with_rest(":?", expression_text(input, rest, sigil.end)),
        TagKind::Else => Some(":".to_string()),
        TagKind::Close => Some("/".to_string()),
        TagKind::Ifblock => with_rest("?#", Some(after.to_string())),
        TagKind::Include => with_rest("+", Some(after.to_string())),
        TagKind::Block => with_rest("#", Some(words(after).join(" "))),
        TagKind::For => {
            // The loop variable and its `=`, then the iterated expression.
            let (name, equals) = (&rest[0], &rest[1]);
            let iter = expression_text(input, &rest[2..], equals.end)?;
            Some(format!("@ {} = {iter}", text(name)))
        }
        TagKind::Assignment => {
            // The assigned name and its operator, then the value unless the operator is `++` or `--`.
            let (name, operator) = (&rest[0], &rest[1]);
            if rest.len() == 2 {
                return is_whitespace(&source[operator.end..body_end]).then(|| format!(":{}{}", text(name), text(operator)));
            }
            let value = expression_text(input, &rest[2..], operator.end)?;
            Some(format!(":{} {} {value}", text(name), text(operator)))
        }
        TagKind::Comment | TagKind::Directive => None,
    }
}

fn with_rest(sigil: &str, rest: Option<String>) -> Option<String> {
    let rest = rest?;
    Some(if rest.is_empty() {
        sigil.to_string()
    } else {
        format!("{sigil} {rest}")
    })
}

// Joins the expression tokens that start at `from`. Returns None when anything other than whitespace lies between them.
fn expression_text(input: &BodyInput, tokens: &[SyntaxToken], from: usize) -> Option<String> {
    let mut cursor = from;
    let mut joined = Vec::with_capacity(tokens.len());
    for token in tokens {
        if !is_whitespace(&input.source[cursor..token.start]) {
            return None;
        }
        joined.push(ExpressionToken {
            text: &input.source[token.start..token.end],
            kind: token.kind,
        });
        cursor = token.end;
    }
    if !is_whitespace(&input.source[cursor..input.body_end]) || joined.is_empty() {
        return None;
    }
    Some(join_tokens(&joined))
}

// Splits a block tag body at horizontal whitespace outside string literals.
fn words(text: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut characters = text.chars();
    while let Some(character) = characters.next() {
        if let Some(open) = quote {
            current.push(character);
            if character == '\\' {
                if let Some(next) = characters.next() {
                    current.push(next);
                }
            } else if character == open {
                quote = None;
            }
            continue;
        }
        if character == ' ' || character == '\t' {
            if !current.is_empty() {
                result.push(std::mem::take(&mut current));
            }
            continue;
        }
        if character == '"' || character == '\'' {
            quote = Some(character);
        }
        current.push(character);
    }
    if !current.is_empty() {
        result.push(current);
    }
    result
}
