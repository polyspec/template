//! Expression parser (EXP-7 to EXP-16, AST-4, AST-5).

use crate::ast::{BinaryOp, Expr, LiteralValue, LoopMetaField, MapEntry, UnaryOp};
use crate::error::{ErrorCode, Span, TemplateError};
use crate::expr::lexer::{ExpressionLexer, LexerOptions, Token, TokenType};
use crate::source::Source;

/// Maximum expression nesting depth (RT-33).
pub const EXPRESSION_DEPTH_LIMIT: usize = 64;

fn equality_op(kind: TokenType) -> Option<BinaryOp> {
    match kind {
        TokenType::Eq => Some(BinaryOp::Equal),
        TokenType::Ne => Some(BinaryOp::NotEqual),
        TokenType::Seq => Some(BinaryOp::StrictEqual),
        TokenType::Sne => Some(BinaryOp::StrictNotEqual),
        _ => None,
    }
}

fn comparison_op(kind: TokenType) -> Option<BinaryOp> {
    match kind {
        TokenType::Lt => Some(BinaryOp::Less),
        TokenType::Gt => Some(BinaryOp::Greater),
        TokenType::Le => Some(BinaryOp::LessEqual),
        TokenType::Ge => Some(BinaryOp::GreaterEqual),
        TokenType::In => Some(BinaryOp::In),
        _ => None,
    }
}

fn additive_op(kind: TokenType) -> Option<BinaryOp> {
    match kind {
        TokenType::Plus => Some(BinaryOp::Add),
        TokenType::Minus => Some(BinaryOp::Subtract),
        _ => None,
    }
}

fn multiplicative_op(kind: TokenType) -> Option<BinaryOp> {
    match kind {
        TokenType::Star => Some(BinaryOp::Multiply),
        TokenType::Slash => Some(BinaryOp::Divide),
        TokenType::Percent => Some(BinaryOp::Remainder),
        _ => None,
    }
}

fn starts_expression(kind: TokenType) -> bool {
    matches!(
        kind,
        TokenType::Ident
            | TokenType::Number
            | TokenType::Str
            | TokenType::Null
            | TokenType::True
            | TokenType::False
            | TokenType::LParen
            | TokenType::LBracket
            | TokenType::Bang
            | TokenType::Minus
    )
}

enum BracketEntry {
    Plain(Expr),
    Pair(Expr, Expr),
    Spread(Expr),
}

/// Recursive descent expression parser.
pub struct ExpressionParser<'a> {
    lexer: ExpressionLexer<'a>,
    options: LexerOptions,
    depth: usize,
}

impl<'a> ExpressionParser<'a> {
    /// Creates a parser at a byte offset of the source.
    pub fn new(source: &'a Source, start: usize, options: LexerOptions) -> ExpressionParser<'a> {
        ExpressionParser {
            lexer: ExpressionLexer::new(source, start, options),
            options,
            depth: 0,
        }
    }

    /// Byte offset after the last consumed token.
    pub fn end(&self) -> usize {
        self.lexer.consumed_end()
    }

    /// The next token without consuming it.
    pub fn peek(&mut self) -> Result<Token, TemplateError> {
        self.lexer.peek().cloned()
    }

    /// Consumes the next token.
    pub fn next_token(&mut self) -> Result<Token, TemplateError> {
        self.lexer.next_token()
    }

    /// The error for a token the grammar does not accept.
    pub fn unexpected(&self, token: &Token) -> TemplateError {
        if let (Some(open), Some(close)) = (self.options.open_index, self.options.close)
            && !self.lexer.source().bytes()[token.start..].contains(&close)
        {
            return self
                .lexer
                .error(ErrorCode::E_PARSE_UNTERMINATED_TAG, open, open + 1, "tag is not terminated");
        }
        if token.kind == TokenType::Eof {
            return self.lexer.error(
                ErrorCode::E_PARSE_UNEXPECTED_TOKEN,
                token.start,
                token.start,
                "unexpected end of input",
            );
        }
        self.lexer.error(
            ErrorCode::E_PARSE_UNEXPECTED_TOKEN,
            token.start,
            token.end,
            format!("unexpected token {:?}", token.value),
        )
    }

    /// Consumes a token of a type or fails.
    pub fn expect(&mut self, kind: TokenType) -> Result<Token, TemplateError> {
        let token = self.peek()?;
        if token.kind != kind {
            return Err(self.unexpected(&token));
        }
        self.next_token()
    }

    /// Consumes the close delimiter of a tag (LEX-11) and returns the byte offset after it.
    pub fn expect_close(&mut self) -> Result<usize, TemplateError> {
        let token = self.peek()?;
        if token.kind == TokenType::Close {
            self.next_token()?;
            return Ok(token.end);
        }
        if token.kind == TokenType::Eof {
            return Err(self.unexpected(&token));
        }
        let close = self.options.close.expect("close delimiter") as char;
        let mut end = 0;
        for k in 0..self.options.close_count {
            let part = self.peek()?;
            if part.value.len() != 1 || !part.value.starts_with(close) || (k > 0 && part.start != end) {
                return Err(self.unexpected(&part));
            }
            self.next_token()?;
            end = part.end;
        }
        Ok(end)
    }

    fn enter(&mut self) -> Result<(), TemplateError> {
        self.depth += 1;
        if self.depth > EXPRESSION_DEPTH_LIMIT {
            let token = self.peek()?;
            return Err(self.lexer.error(
                ErrorCode::E_RUNTIME_LIMIT,
                token.start,
                token.end,
                format!("expression nesting exceeds {EXPRESSION_DEPTH_LIMIT}"),
            ));
        }
        Ok(())
    }

    fn leave(&mut self) {
        self.depth -= 1;
    }

    fn span(&self, start: usize, end: usize) -> Span {
        [start, end]
    }

    /// Parses a full expression.
    pub fn parse_expression(&mut self) -> Result<Expr, TemplateError> {
        self.enter()?;
        let start = self.peek()?.start;
        let mut left = self.parse_ternary()?;
        while self.peek()?.kind == TokenType::Pipe {
            self.next_token()?;
            let name = self.expect(TokenType::Ident)?;
            let mut args = vec![left];
            let mut end = name.end;
            if self.peek()?.kind == TokenType::LParen {
                self.next_token()?;
                self.parse_arguments(&mut args)?;
                end = self.expect(TokenType::RParen)?.end;
            }
            left = Expr::Call {
                name: name.value,
                args,
                span: self.span(start, end),
            };
        }
        self.leave();
        Ok(left)
    }

    fn parse_ternary(&mut self) -> Result<Expr, TemplateError> {
        let start = self.peek()?.start;
        let test = self.parse_coalesce()?;
        let token = self.peek()?;
        if token.kind == TokenType::Question {
            self.next_token()?;
            let then = self.parse_ternary()?;
            self.expect(TokenType::Colon)?;
            let otherwise = self.parse_ternary()?;
            let end = self.end();
            return Ok(Expr::Ternary {
                test: Box::new(test),
                then: Some(Box::new(then)),
                r#else: Box::new(otherwise),
                span: self.span(start, end),
            });
        }
        if token.kind == TokenType::Elvis {
            self.next_token()?;
            let otherwise = self.parse_ternary()?;
            let end = self.end();
            return Ok(Expr::Ternary {
                test: Box::new(test),
                then: None,
                r#else: Box::new(otherwise),
                span: self.span(start, end),
            });
        }
        Ok(test)
    }

    fn parse_coalesce(&mut self) -> Result<Expr, TemplateError> {
        let start = self.peek()?.start;
        let left = self.parse_or()?;
        if self.peek()?.kind != TokenType::Coalesce {
            return Ok(left);
        }
        let operator = self.next_token()?;
        if !starts_expression(self.peek()?.kind) {
            let literal = Expr::Literal {
                kind: "null".to_string(),
                value: LiteralValue::Null,
                span: self.span(operator.end, operator.end),
            };
            return Ok(Expr::Binary {
                op: BinaryOp::Coalesce,
                left: Box::new(left),
                right: Box::new(literal),
                span: self.span(start, operator.end),
            });
        }
        let right = self.parse_coalesce()?;
        let end = self.end();
        Ok(Expr::Binary {
            op: BinaryOp::Coalesce,
            left: Box::new(left),
            right: Box::new(right),
            span: self.span(start, end),
        })
    }

    fn parse_or(&mut self) -> Result<Expr, TemplateError> {
        let start = self.peek()?.start;
        let mut left = self.parse_and()?;
        while self.peek()?.kind == TokenType::Or {
            self.next_token()?;
            let right = self.parse_and()?;
            let end = self.end();
            left = Expr::Binary {
                op: BinaryOp::Or,
                left: Box::new(left),
                right: Box::new(right),
                span: self.span(start, end),
            };
        }
        Ok(left)
    }

    fn parse_and(&mut self) -> Result<Expr, TemplateError> {
        let start = self.peek()?.start;
        let mut left = self.parse_equality()?;
        while self.peek()?.kind == TokenType::And {
            self.next_token()?;
            let right = self.parse_equality()?;
            let end = self.end();
            left = Expr::Binary {
                op: BinaryOp::And,
                left: Box::new(left),
                right: Box::new(right),
                span: self.span(start, end),
            };
        }
        Ok(left)
    }

    fn parse_equality(&mut self) -> Result<Expr, TemplateError> {
        let start = self.peek()?.start;
        let left = self.parse_comparison()?;
        let Some(op) = equality_op(self.peek()?.kind) else {
            return Ok(left);
        };
        self.next_token()?;
        let right = self.parse_comparison()?;
        let end = self.end();
        let node = Expr::Binary {
            op,
            left: Box::new(left),
            right: Box::new(right),
            span: self.span(start, end),
        };
        let next = self.peek()?;
        if equality_op(next.kind).is_some() {
            return Err(self.unexpected(&next));
        }
        Ok(node)
    }

    fn parse_comparison(&mut self) -> Result<Expr, TemplateError> {
        let start = self.peek()?.start;
        let left = self.parse_additive()?;
        let Some(op) = comparison_op(self.peek()?.kind) else {
            return Ok(left);
        };
        self.next_token()?;
        let right = self.parse_additive()?;
        let end = self.end();
        let node = Expr::Binary {
            op,
            left: Box::new(left),
            right: Box::new(right),
            span: self.span(start, end),
        };
        let next = self.peek()?;
        if comparison_op(next.kind).is_some() {
            return Err(self.unexpected(&next));
        }
        Ok(node)
    }

    fn parse_additive(&mut self) -> Result<Expr, TemplateError> {
        let start = self.peek()?.start;
        let mut left = self.parse_multiplicative()?;
        while let Some(op) = additive_op(self.peek()?.kind) {
            self.next_token()?;
            let right = self.parse_multiplicative()?;
            let end = self.end();
            left = Expr::Binary {
                op,
                left: Box::new(left),
                right: Box::new(right),
                span: self.span(start, end),
            };
        }
        Ok(left)
    }

    fn parse_multiplicative(&mut self) -> Result<Expr, TemplateError> {
        let start = self.peek()?.start;
        let mut left = self.parse_unary()?;
        while let Some(op) = multiplicative_op(self.peek()?.kind) {
            self.next_token()?;
            let right = self.parse_unary()?;
            let end = self.end();
            left = Expr::Binary {
                op,
                left: Box::new(left),
                right: Box::new(right),
                span: self.span(start, end),
            };
        }
        Ok(left)
    }

    fn parse_unary(&mut self) -> Result<Expr, TemplateError> {
        let token = self.peek()?;
        if token.kind == TokenType::Bang || token.kind == TokenType::Minus {
            self.next_token()?;
            self.enter()?;
            let operand = self.parse_unary()?;
            self.leave();
            let end = self.end();
            let op = if token.kind == TokenType::Bang {
                UnaryOp::Not
            } else {
                UnaryOp::Negate
            };
            return Ok(Expr::Unary {
                op,
                operand: Box::new(operand),
                span: self.span(token.start, end),
            });
        }
        self.parse_postfix(false)
    }

    /// Parses a postfix expression. With `adjacent_only`, accessors and calls must touch the previous token (GRM-14).
    pub fn parse_postfix(&mut self, adjacent_only: bool) -> Result<Expr, TemplateError> {
        self.enter()?;
        let first = self.peek()?;
        let start = first.start;
        let mut node = if first.kind == TokenType::Ident {
            self.next_token()?;
            let after = self.peek()?;
            if after.kind == TokenType::LParen && (!adjacent_only || after.start == first.end) {
                self.next_token()?;
                let mut args = Vec::new();
                self.parse_arguments(&mut args)?;
                let close = self.expect(TokenType::RParen)?;
                Expr::Call {
                    name: first.value,
                    args,
                    span: self.span(start, close.end),
                }
            } else if after.kind == TokenType::DotIdent && LoopMetaField::from_name(&after.value[1..]).is_some() {
                self.next_token()?;
                let field = LoopMetaField::from_name(&after.value[1..]).expect("field");
                Expr::LoopMeta {
                    r#loop: first.value,
                    field,
                    span: self.span(start, after.end),
                }
            } else {
                Expr::Var {
                    name: first.value,
                    span: self.span(start, first.end),
                }
            }
        } else {
            self.parse_primary()?
        };
        loop {
            let token = self.peek()?;
            if adjacent_only && token.start != self.end() {
                break;
            }
            match token.kind {
                TokenType::DotIdent | TokenType::DotIndex => {
                    self.next_token()?;
                    node = Expr::Member {
                        object: Box::new(node),
                        key: token.value[1..].to_string(),
                        span: self.span(start, token.end),
                    };
                }
                TokenType::LBracket => {
                    self.next_token()?;
                    let index = self.parse_expression()?;
                    let close = self.expect(TokenType::RBracket)?;
                    node = Expr::Index {
                        object: Box::new(node),
                        index: Box::new(index),
                        span: self.span(start, close.end),
                    };
                }
                TokenType::LParen => return Err(self.unexpected(&token)),
                _ => break,
            }
        }
        self.leave();
        Ok(node)
    }

    fn parse_primary(&mut self) -> Result<Expr, TemplateError> {
        let token = self.peek()?;
        match token.kind {
            TokenType::Null => {
                self.next_token()?;
                Ok(Expr::Literal {
                    kind: "null".to_string(),
                    value: LiteralValue::Null,
                    span: self.span(token.start, token.end),
                })
            }
            TokenType::True | TokenType::False => {
                self.next_token()?;
                Ok(Expr::Literal {
                    kind: "bool".to_string(),
                    value: LiteralValue::Bool(token.kind == TokenType::True),
                    span: self.span(token.start, token.end),
                })
            }
            TokenType::Number => {
                self.next_token()?;
                let value: f64 = token.value.parse().unwrap_or(0.0);
                Ok(Expr::Literal {
                    kind: "number".to_string(),
                    value: LiteralValue::Number(value),
                    span: self.span(token.start, token.end),
                })
            }
            TokenType::Str => {
                self.next_token()?;
                Ok(Expr::Literal {
                    kind: "string".to_string(),
                    value: LiteralValue::String(token.decoded.unwrap_or_default()),
                    span: self.span(token.start, token.end),
                })
            }
            TokenType::LParen => {
                self.next_token()?;
                let inner = self.parse_expression()?;
                self.expect(TokenType::RParen)?;
                Ok(inner)
            }
            TokenType::LBracket => self.parse_bracket(),
            _ => Err(self.unexpected(&token)),
        }
    }

    fn parse_bracket(&mut self) -> Result<Expr, TemplateError> {
        let open = self.next_token()?;
        let mut entries: Vec<BracketEntry> = Vec::new();
        let mut arrows = 0;
        while self.peek()?.kind != TokenType::RBracket {
            let token = self.peek()?;
            if token.kind == TokenType::Spread {
                self.next_token()?;
                let expr = self.parse_expression()?;
                let end = self.end();
                entries.push(BracketEntry::Spread(Expr::Spread {
                    expr: Box::new(expr),
                    span: self.span(token.start, end),
                }));
            } else {
                let key = self.parse_expression()?;
                if self.peek()?.kind == TokenType::Arrow {
                    self.next_token()?;
                    arrows += 1;
                    let value = self.parse_expression()?;
                    entries.push(BracketEntry::Pair(key, value));
                } else {
                    entries.push(BracketEntry::Plain(key));
                }
            }
            if self.peek()?.kind == TokenType::Comma {
                self.next_token()?;
                continue;
            }
            let next = self.peek()?;
            if next.kind != TokenType::RBracket {
                return Err(self.unexpected(&next));
            }
        }
        let close = self.next_token()?;
        let span = self.span(open.start, close.end);
        if arrows == 0 {
            let items = entries
                .into_iter()
                .map(|entry| match entry {
                    BracketEntry::Plain(expr) | BracketEntry::Spread(expr) => expr,
                    BracketEntry::Pair(key, _) => key,
                })
                .collect();
            return Ok(Expr::List { items, span });
        }
        let mut map_entries = Vec::new();
        for entry in entries {
            match entry {
                BracketEntry::Spread(expr) => map_entries.push(MapEntry::Spread(expr)),
                BracketEntry::Pair(key, value) => map_entries.push(MapEntry::Entry { key, value }),
                BracketEntry::Plain(key) => {
                    let start = key.span()[0];
                    return Err(self.lexer.error(
                        ErrorCode::E_PARSE_UNEXPECTED_TOKEN,
                        start,
                        start + 1,
                        "map literal entry without \"=>\"",
                    ));
                }
            }
        }
        Ok(Expr::Map {
            entries: map_entries,
            span,
        })
    }

    fn parse_arguments(&mut self, args: &mut Vec<Expr>) -> Result<(), TemplateError> {
        while self.peek()?.kind != TokenType::RParen {
            args.push(self.parse_expression()?);
            if self.peek()?.kind == TokenType::Comma {
                self.next_token()?;
                continue;
            }
            let next = self.peek()?;
            if next.kind != TokenType::RParen {
                return Err(self.unexpected(&next));
            }
        }
        Ok(())
    }
}
