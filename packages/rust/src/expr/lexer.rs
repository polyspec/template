//! Expression tokens (EXP-1 to EXP-6, CNF-13).

use crate::error::{ErrorCode, TemplateError};
use crate::source::Source;

/// Token types. `Close` is the close delimiter of a tag when it is not an expression character.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TokenType {
    /// `IDENT`: an identifier.
    Ident,
    /// `NUMBER`: a number literal.
    Number,
    /// `STRING`: a string literal.
    Str,
    /// `DOT_IDENT`: `.` followed by a member name.
    DotIdent,
    /// `DOT_INDEX`: `.` followed by digits, as in `a.0`.
    DotIndex,
    /// `LPAREN`: `(`.
    LParen,
    /// `RPAREN`: `)`.
    RParen,
    /// `LBRACKET`: `[`.
    LBracket,
    /// `RBRACKET`: `]`.
    RBracket,
    /// `COMMA`: `,`.
    Comma,
    /// `PIPE`: `|`.
    Pipe,
    /// `QUESTION`: `?`.
    Question,
    /// `COLON`: `:`.
    Colon,
    /// `DOUBLE_COLON`: `::` of a class call.
    DoubleColon,
    /// `ELVIS`: `?:`.
    Elvis,
    /// `COALESCE`: `??`.
    Coalesce,
    /// `ARROW`: `=>` of a map entry.
    Arrow,
    /// `SPREAD`: `...`.
    Spread,
    /// `PLUS`: `+`.
    Plus,
    /// `MINUS`: `-`.
    Minus,
    /// `STAR`: `*`.
    Star,
    /// `SLASH`: `/`.
    Slash,
    /// `PERCENT`: `%`.
    Percent,
    /// `BANG`: `!`.
    Bang,
    /// `EQ`: `==`.
    Eq,
    /// `NE`: `!=`.
    Ne,
    /// `SEQ`: `===`.
    Seq,
    /// `SNE`: `!==`.
    Sne,
    /// `LT`: `<`.
    Lt,
    /// `GT`: `>`.
    Gt,
    /// `LE`: `<=`.
    Le,
    /// `GE`: `>=`.
    Ge,
    /// `AND`: `&&`.
    And,
    /// `OR`: `||`.
    Or,
    /// `IN`: the keyword `in`.
    In,
    /// `NULL`: the keyword `null`.
    Null,
    /// `TRUE`: the keyword `true`.
    True,
    /// `FALSE`: the keyword `false`.
    False,
    /// `EOF`: the end of the expression.
    Eof,
    /// `CLOSE`: the close delimiter of the tag.
    Close,
}

/// A token with byte offsets into the source text.
#[derive(Debug, Clone, PartialEq)]
pub struct Token {
    /// Type.
    pub kind: TokenType,
    /// Source text of the token.
    pub value: String,
    /// Start byte offset.
    pub start: usize,
    /// End byte offset.
    pub end: usize,
    /// Decoded value of a string token.
    pub decoded: Option<String>,
}

const OPERATORS: &[(&str, TokenType)] = &[
    ("===", TokenType::Seq),
    ("!==", TokenType::Sne),
    ("...", TokenType::Spread),
    ("==", TokenType::Eq),
    ("!=", TokenType::Ne),
    ("<=", TokenType::Le),
    (">=", TokenType::Ge),
    ("&&", TokenType::And),
    ("||", TokenType::Or),
    ("??", TokenType::Coalesce),
    ("?:", TokenType::Elvis),
    ("::", TokenType::DoubleColon),
    ("=>", TokenType::Arrow),
    ("(", TokenType::LParen),
    (")", TokenType::RParen),
    ("[", TokenType::LBracket),
    ("]", TokenType::RBracket),
    (",", TokenType::Comma),
    ("|", TokenType::Pipe),
    ("?", TokenType::Question),
    (":", TokenType::Colon),
    ("+", TokenType::Plus),
    ("-", TokenType::Minus),
    ("*", TokenType::Star),
    ("/", TokenType::Slash),
    ("%", TokenType::Percent),
    ("!", TokenType::Bang),
    ("<", TokenType::Lt),
    (">", TokenType::Gt),
];

const EXPRESSION_CHARS: &[u8] = b"()[],|?:=>.+-*/%!<&'\"";

fn is_ident_start(byte: u8) -> bool {
    byte.is_ascii_alphabetic() || byte == b'_'
}

fn is_ident_part(byte: u8) -> bool {
    is_ident_start(byte) || byte.is_ascii_digit()
}

fn is_whitespace(byte: u8) -> bool {
    matches!(byte, b' ' | b'\t' | b'\r' | b'\n')
}

fn is_postfix_end(kind: TokenType) -> bool {
    matches!(
        kind,
        TokenType::Ident | TokenType::RParen | TokenType::RBracket | TokenType::DotIdent | TokenType::DotIndex
    )
}

/// Lexer options: the close delimiter of the tag, or none for a bare expression.
#[derive(Debug, Clone, Copy)]
pub struct LexerOptions {
    /// Close delimiter character.
    pub close: Option<u8>,
    /// How many times the close delimiter is repeated to end the tag.
    pub close_count: usize,
    /// Byte offset of the open delimiter, used for E_PARSE_UNTERMINATED_TAG.
    pub open_index: Option<usize>,
}

/// Reads a string literal starting at the quote at `start` (EXP-3). Returns the decoded value and the end offset. A
/// `\uXXXX` escape of a surrogate that is not part of a pair is E_PARSE_INVALID_ESCAPE at that escape.
pub fn lex_string_literal(source: &Source, start: usize) -> Result<(String, usize), TemplateError> {
    let bytes = source.bytes();
    let quote = bytes[start];
    let mut decoded = String::new();
    // A high surrogate escape and its offset, waiting for the low surrogate escape that must follow it.
    let mut pending_high: Option<(u16, usize)> = None;
    let mut index = start + 1;
    let lone = |at: usize| {
        source.error(
            ErrorCode::E_PARSE_INVALID_ESCAPE,
            at,
            at + 6,
            "a \\u escape leaves a surrogate unpaired",
        )
    };
    loop {
        if index >= bytes.len() {
            return Err(source.error(
                ErrorCode::E_PARSE_UNTERMINATED_STRING,
                start,
                start + 1,
                "string literal is not terminated",
            ));
        }
        let byte = bytes[index];
        let is_unicode_escape = byte == b'\\' && bytes.get(index + 1) == Some(&b'u');
        if !is_unicode_escape && let Some((_, at)) = pending_high {
            return Err(lone(at));
        }
        if byte == quote {
            return Ok((decoded, index + 1));
        }
        if byte != b'\\' {
            let Some(char) = source.text.get(index..).and_then(|rest| rest.chars().next()) else {
                return Err(source.error(ErrorCode::E_INTERNAL, index, index + 1, "a string literal splits a character"));
            };
            decoded.push(char);
            index += char.len_utf8();
            continue;
        }
        match bytes.get(index + 1) {
            Some(b'\\') => decoded.push('\\'),
            Some(b'\'') => decoded.push('\''),
            Some(b'"') => decoded.push('"'),
            Some(b'n') => decoded.push('\n'),
            Some(b'r') => decoded.push('\r'),
            Some(b't') => decoded.push('\t'),
            Some(b'u') => {
                let Some(unit) = source.text.get(index + 2..index + 6).and_then(hex_unit) else {
                    return Err(source.error(ErrorCode::E_PARSE_INVALID_ESCAPE, index, index + 2, "invalid escape sequence"));
                };
                match (pending_high.take(), unit) {
                    (Some((high, _)), 0xdc00..=0xdfff) => {
                        let combined = 0x10000 + ((u32::from(high) - 0xd800) << 10) + (u32::from(unit) - 0xdc00);
                        match char::from_u32(combined) {
                            Some(char) => decoded.push(char),
                            None => return Err(lone(index)),
                        }
                    }
                    (Some((_, at)), _) => return Err(lone(at)),
                    (None, 0xd800..=0xdbff) => pending_high = Some((unit, index)),
                    (None, _) => match char::from_u32(u32::from(unit)) {
                        Some(char) => decoded.push(char),
                        None => return Err(lone(index)),
                    },
                }
                index += 6;
                continue;
            }
            _ => return Err(source.error(ErrorCode::E_PARSE_INVALID_ESCAPE, index, index + 2, "invalid escape sequence")),
        }
        index += 2;
    }
}

/// The code unit of four ASCII hexadecimal digits, or None.
fn hex_unit(hex: &str) -> Option<u16> {
    if hex.len() != 4 {
        return None;
    }
    let mut unit: u16 = 0;
    for digit in hex.bytes() {
        let value = match digit {
            b'0'..=b'9' => digit - b'0',
            b'a'..=b'f' => digit - b'a' + 10,
            b'A'..=b'F' => digit - b'A' + 10,
            _ => return None,
        };
        unit = unit * 16 + u16::from(value);
    }
    Some(unit)
}

/// Expression lexer over the source text from a start offset.
pub struct ExpressionLexer<'a> {
    source: &'a Source,
    index: usize,
    previous: Option<Token>,
    lookahead: Option<Token>,
    nesting_depth: usize,
    options: LexerOptions,
    close_is_expression_char: bool,
    consumed: Vec<Token>,
}

impl<'a> ExpressionLexer<'a> {
    /// Creates a lexer at a byte offset.
    pub fn new(source: &'a Source, start: usize, options: LexerOptions) -> ExpressionLexer<'a> {
        let close_is_expression_char = options.close.is_some_and(|c| EXPRESSION_CHARS.contains(&c));
        ExpressionLexer {
            source,
            index: start,
            previous: None,
            lookahead: None,
            nesting_depth: 0,
            options,
            close_is_expression_char,
            consumed: Vec::new(),
        }
    }

    /// The source.
    pub fn source(&self) -> &'a Source {
        self.source
    }

    /// Creates an error at a byte span.
    pub fn error(&self, code: ErrorCode, start: usize, end: usize, message: impl Into<String>) -> TemplateError {
        self.source.error(code, start, end, message)
    }

    /// The next token without advancing past it.
    pub fn peek(&mut self) -> Result<&Token, TemplateError> {
        if self.lookahead.is_none() {
            let token = self.read()?;
            self.lookahead = Some(token);
        }
        Ok(self.lookahead.as_ref().expect("lookahead"))
    }

    /// Consumes and returns the next token.
    pub fn next_token(&mut self) -> Result<Token, TemplateError> {
        self.peek()?;
        let token = self.lookahead.take().expect("lookahead");
        self.previous = Some(token.clone());
        if matches!(token.kind, TokenType::LParen | TokenType::LBracket) {
            self.nesting_depth += 1;
        }
        if matches!(token.kind, TokenType::RParen | TokenType::RBracket) && self.nesting_depth > 0 {
            self.nesting_depth -= 1;
        }
        self.consumed.push(token.clone());
        Ok(token)
    }

    /// The tokens consumed so far, the close delimiter included.
    pub fn consumed(&self) -> &[Token] {
        &self.consumed
    }

    /// Byte offset after the last consumed token.
    pub fn consumed_end(&self) -> usize {
        self.previous.as_ref().map_or(self.index, |token| token.end)
    }

    fn token(&self, kind: TokenType, start: usize, end: usize) -> Token {
        Token {
            kind,
            value: self.source.text[start..end].to_string(),
            start,
            end,
            decoded: None,
        }
    }

    fn read(&mut self) -> Result<Token, TemplateError> {
        let bytes = self.source.bytes();
        while self.index < bytes.len() && is_whitespace(bytes[self.index]) {
            self.index += 1;
        }
        let start = self.index;
        if start >= bytes.len() {
            return Ok(Token {
                kind: TokenType::Eof,
                value: String::new(),
                start,
                end: start,
                decoded: None,
            });
        }
        if let Some(close) = self.options.close
            && (self.previous.as_ref().is_some_and(|token| {
                matches!(
                    token.kind,
                    TokenType::Ident
                        | TokenType::Number
                        | TokenType::Str
                        | TokenType::Null
                        | TokenType::True
                        | TokenType::False
                        | TokenType::RParen
                        | TokenType::RBracket
                        | TokenType::DotIdent
                        | TokenType::DotIndex
                ) && self.nesting_depth == 0
            }) || !self.close_is_expression_char)
        {
            let sequence: Vec<u8> = std::iter::repeat_n(close, self.options.close_count).collect();
            if bytes[start..].starts_with(&sequence) {
                self.index = start + sequence.len();
                return Ok(self.token(TokenType::Close, start, self.index));
            }
        }
        let byte = bytes[start];
        if is_ident_start(byte) {
            let mut end = start + 1;
            while end < bytes.len() && is_ident_part(bytes[end]) {
                end += 1;
            }
            self.index = end;
            let kind = match &self.source.text[start..end] {
                "null" => TokenType::Null,
                "true" => TokenType::True,
                "false" => TokenType::False,
                "in" => TokenType::In,
                _ => TokenType::Ident,
            };
            return Ok(self.token(kind, start, end));
        }
        if byte.is_ascii_digit() {
            return self.read_number(start);
        }
        if byte == b'"' || byte == b'\'' {
            let (decoded, end) = lex_string_literal(self.source, start)?;
            self.index = end;
            let mut token = self.token(TokenType::Str, start, end);
            token.decoded = Some(decoded);
            return Ok(token);
        }
        if byte == b'.' {
            return self.read_dot(start);
        }
        for (operator, kind) in OPERATORS {
            if bytes[start..].starts_with(operator.as_bytes()) {
                self.index = start + operator.len();
                return Ok(self.token(*kind, start, self.index));
            }
        }
        let char = self.source.text[start..].chars().next().expect("char");
        Err(self.error(
            ErrorCode::E_PARSE_UNEXPECTED_TOKEN,
            start,
            start + char.len_utf8(),
            format!("unexpected character {char:?}"),
        ))
    }

    fn read_number(&mut self, start: usize) -> Result<Token, TemplateError> {
        let bytes = self.source.bytes();
        let mut end = start;
        while end < bytes.len() && bytes[end].is_ascii_digit() {
            end += 1;
        }
        if bytes.get(end) == Some(&b'.') && bytes.get(end + 1).is_some_and(|b| b.is_ascii_digit()) {
            end += 1;
            while end < bytes.len() && bytes[end].is_ascii_digit() {
                end += 1;
            }
        }
        if matches!(bytes.get(end), Some(b'e') | Some(b'E')) {
            let mut cursor = end + 1;
            if matches!(bytes.get(cursor), Some(b'+') | Some(b'-')) {
                cursor += 1;
            }
            if bytes.get(cursor).is_some_and(|b| b.is_ascii_digit()) {
                while cursor < bytes.len() && bytes[cursor].is_ascii_digit() {
                    cursor += 1;
                }
                end = cursor;
            } else {
                return Err(self.error(
                    ErrorCode::E_PARSE_INVALID_NUMBER,
                    start,
                    cursor,
                    format!("invalid number {:?}", &self.source.text[start..cursor]),
                ));
            }
        }
        let close_at_end = self
            .options
            .close
            .is_some_and(|close| self.nesting_depth == 0 && bytes[end..].starts_with(&[close]));
        if end < bytes.len() && (is_ident_part(bytes[end]) || (bytes[end] == b'.' && !close_at_end)) {
            let mut cursor = end + 1;
            while cursor < bytes.len() && (is_ident_part(bytes[cursor]) || bytes[cursor] == b'.') {
                cursor += 1;
            }
            return Err(self.error(
                ErrorCode::E_PARSE_INVALID_NUMBER,
                start,
                cursor,
                format!("invalid number {:?}", &self.source.text[start..cursor]),
            ));
        }
        self.index = end;
        Ok(self.token(TokenType::Number, start, end))
    }

    fn read_dot(&mut self, start: usize) -> Result<Token, TemplateError> {
        let bytes = self.source.bytes();
        if bytes[start..].starts_with(b"...") {
            self.index = start + 3;
            return Ok(self.token(TokenType::Spread, start, self.index));
        }
        let next = bytes.get(start + 1).copied().unwrap_or(0);
        let adjacent = self
            .previous
            .as_ref()
            .is_some_and(|token| token.end == start && is_postfix_end(token.kind));
        if adjacent && is_ident_start(next) {
            let mut end = start + 2;
            while end < bytes.len() && is_ident_part(bytes[end]) {
                end += 1;
            }
            self.index = end;
            return Ok(self.token(TokenType::DotIdent, start, end));
        }
        if adjacent && next.is_ascii_digit() {
            let mut end = start + 2;
            while end < bytes.len() && bytes[end].is_ascii_digit() {
                end += 1;
            }
            self.index = end;
            return Ok(self.token(TokenType::DotIndex, start, end));
        }
        if next.is_ascii_digit() {
            let mut end = start + 1;
            while end < bytes.len() && (is_ident_part(bytes[end]) || bytes[end] == b'.') {
                end += 1;
            }
            return Err(self.error(
                ErrorCode::E_PARSE_INVALID_NUMBER,
                start,
                end,
                format!("invalid number {:?}", &self.source.text[start..end]),
            ));
        }
        Err(self.error(ErrorCode::E_PARSE_UNEXPECTED_TOKEN, start, start + 1, "unexpected \".\""))
    }
}
