//! Path tokens (GRM-3) and block tag bodies (GRM-13 to GRM-15).

use crate::ast::{Expr, ScopeItem};
use crate::error::{ErrorCode, TemplateError};
use crate::expr::lexer::{LexerOptions, lex_string_literal};
use crate::expr::parser::ExpressionParser;
use crate::parser::scanner::{ident_length, is_horizontal_space, skip_horizontal_space};
use crate::source::Source;

fn is_path_char(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.' | b'/' | b'-')
}

enum RawToken {
    Path { value: String, start: usize, end: usize },
    Ident { value: String, start: usize, end: usize },
}

/// The parsed body of a block tag.
pub struct BlockBody {
    /// Block identifier.
    pub id: Option<String>,
    /// Template path.
    pub path: Option<String>,
    /// Scope items.
    pub scope: Vec<ScopeItem>,
    /// Byte offset after the body.
    pub end: usize,
}

/// Reader for tag bodies that are not expressions.
pub struct RawTagReader<'a> {
    source: &'a Source,
    close: u8,
    close_count: usize,
}

impl<'a> RawTagReader<'a> {
    /// Creates a reader for a tag with the given close delimiter.
    pub fn new(source: &'a Source, close: u8, close_count: usize) -> RawTagReader<'a> {
        RawTagReader {
            source,
            close,
            close_count,
        }
    }

    fn bytes(&self) -> &'a [u8] {
        self.source.bytes()
    }

    fn at_close(&self, index: usize) -> bool {
        let bytes = self.bytes();
        let sequence: Vec<u8> = std::iter::repeat_n(self.close, self.close_count).collect();
        index < bytes.len() && bytes[index..].starts_with(&sequence)
    }

    fn read_token(&self, index: usize) -> Result<Option<RawToken>, TemplateError> {
        let bytes = self.bytes();
        let index = skip_horizontal_space(bytes, index);
        if index >= bytes.len() || self.at_close(index) {
            return Ok(None);
        }
        let byte = bytes[index];
        if byte == b'"' || byte == b'\'' {
            let (decoded, end) = lex_string_literal(self.source, index)?;
            return Ok(Some(RawToken::Path {
                value: decoded,
                start: index,
                end,
            }));
        }
        let mut end = index;
        while end < bytes.len() && is_path_char(bytes[end]) {
            end += 1;
        }
        let value = self.source.text[index..end].to_string();
        if value.contains('.') || value.contains('/') {
            return Ok(Some(RawToken::Path { value, start: index, end }));
        }
        if !value.is_empty() && ident_length(bytes, index) == value.len() {
            return Ok(Some(RawToken::Ident { value, start: index, end }));
        }
        Ok(Some(RawToken::Ident {
            value: String::new(),
            start: index,
            end: index + 1,
        }))
    }

    /// GRM-12: `+ path`.
    pub fn read_include_path(&self, index: usize) -> Result<(String, usize), TemplateError> {
        match self.read_token(index)? {
            Some(RawToken::Path { value, end, .. }) => Ok((value, end)),
            Some(RawToken::Ident { value, start, end }) if !value.is_empty() => {
                Err(self
                    .source
                    .error(ErrorCode::E_PARSE_INVALID_PATH, start, end, format!("{value:?} is not a path")))
            }
            _ => {
                let at = skip_horizontal_space(self.bytes(), index);
                Err(self
                    .source
                    .error(ErrorCode::E_PARSE_INVALID_PATH, at, at + 1, "include requires a path"))
            }
        }
    }

    /// GRM-13 to GRM-15: `# [id] [path] {scope_item}`.
    pub fn read_block_body(&self, index: usize) -> Result<BlockBody, TemplateError> {
        let bytes = self.bytes();
        let mut id = None;
        let mut path = None;
        let mut scope = Vec::new();
        let mut cursor = index;
        match self.read_token(cursor)? {
            Some(RawToken::Path { value, end, .. }) => {
                path = Some(value);
                cursor = end;
            }
            Some(RawToken::Ident { value, end, .. }) if !value.is_empty() => {
                id = Some(value);
                cursor = end;
                if let Some(RawToken::Path { value, end, .. }) = self.read_token(cursor)? {
                    path = Some(value);
                    cursor = end;
                }
            }
            _ => {
                let at = skip_horizontal_space(bytes, cursor);
                return Err(self.source.error(
                    ErrorCode::E_PARSE_INVALID_BLOCK_TAG,
                    at,
                    at + 1,
                    "block tag requires an identifier or a path",
                ));
            }
        }
        while let Some(token) = self.read_token(cursor)? {
            let (value, start, end) = match token {
                RawToken::Ident { value, start, end } if !value.is_empty() => (value, start, end),
                RawToken::Ident { start, end, .. } | RawToken::Path { start, end, .. } => {
                    let text = self.source.text[start..end.min(self.source.text.len())].to_string();
                    return Err(self.source.error(
                        ErrorCode::E_PARSE_INVALID_BLOCK_TAG,
                        start,
                        end,
                        format!("unexpected {text:?} in block tag"),
                    ));
                }
            };
            cursor = end;
            if bytes.get(cursor) == Some(&b':') {
                let value_start = cursor + 1;
                if value_start >= bytes.len() || is_horizontal_space(bytes[value_start]) {
                    return Err(self.source.error(
                        ErrorCode::E_PARSE_INVALID_BLOCK_TAG,
                        cursor,
                        cursor + 1,
                        "scope item requires a value after \":\"",
                    ));
                }
                let options = LexerOptions {
                    close: Some(self.close),
                    close_count: self.close_count,
                    open_index: None,
                };
                let mut parser = ExpressionParser::new(self.source, value_start, options);
                let expr: Expr = parser.parse_postfix(true)?;
                scope.push(ScopeItem { name: value, expr });
                cursor = parser.end();
            } else {
                scope.push(ScopeItem {
                    name: value.clone(),
                    expr: Expr::Var {
                        name: value,
                        span: [start, end],
                    },
                });
            }
        }
        Ok(BlockBody {
            id,
            path,
            scope,
            end: cursor,
        })
    }
}
