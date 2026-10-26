//! Native expression-vector harness support.

use crate::ast::Expr;
use crate::error::{ErrorCode, TemplateError};
use crate::expr::lexer::{ExpressionLexer, LexerOptions, TokenType};
use crate::expr::parser::ExpressionParser;
use crate::render::context::{Frame, RenderContext, Scope};
use crate::render::engine::AstProgram;
use crate::render::expressions::Evaluator;
use crate::source::Source;
use crate::value::Value;
use crate::value::bind::bind_map;
use std::sync::Arc;

impl TokenType {
    /// Token type name of CNF-13.
    fn name(self) -> &'static str {
        match self {
            TokenType::Ident => "IDENT",
            TokenType::Number => "NUMBER",
            TokenType::Str => "STRING",
            TokenType::DotIdent => "DOT_IDENT",
            TokenType::DotIndex => "DOT_INDEX",
            TokenType::LParen => "LPAREN",
            TokenType::RParen => "RPAREN",
            TokenType::LBracket => "LBRACKET",
            TokenType::RBracket => "RBRACKET",
            TokenType::Comma => "COMMA",
            TokenType::Pipe => "PIPE",
            TokenType::Question => "QUESTION",
            TokenType::Colon => "COLON",
            TokenType::DoubleColon => "DOUBLE_COLON",
            TokenType::Elvis => "ELVIS",
            TokenType::Coalesce => "COALESCE",
            TokenType::Arrow => "ARROW",
            TokenType::Spread => "SPREAD",
            TokenType::Plus => "PLUS",
            TokenType::Minus => "MINUS",
            TokenType::Star => "STAR",
            TokenType::Slash => "SLASH",
            TokenType::Percent => "PERCENT",
            TokenType::Bang => "BANG",
            TokenType::Eq => "EQ",
            TokenType::Ne => "NE",
            TokenType::Seq => "SEQ",
            TokenType::Sne => "SNE",
            TokenType::Lt => "LT",
            TokenType::Gt => "GT",
            TokenType::Le => "LE",
            TokenType::Ge => "GE",
            TokenType::And => "AND",
            TokenType::Or => "OR",
            TokenType::In => "IN",
            TokenType::Null => "NULL",
            TokenType::True => "TRUE",
            TokenType::False => "FALSE",
            TokenType::Eof => "EOF",
            TokenType::Close => "CLOSE",
        }
    }
}

/// A token of a bare expression: type name and source text (CNF-13).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExpressionToken {
    /// Token type name.
    pub kind: String,
    /// Source text.
    pub value: String,
}

const BARE: LexerOptions = LexerOptions {
    close: None,
    close_count: 0,
    open_index: None,
};

/// Tokens of a bare expression, whitespace omitted, ending with EOF.
pub fn tokenize_expression(text: &str) -> Result<Vec<ExpressionToken>, TemplateError> {
    let source = Source::from_bytes("expression", text.as_bytes())?;
    let mut lexer = ExpressionLexer::new(&source, 0, BARE);
    let mut tokens = Vec::new();
    loop {
        let token = lexer.next_token()?;
        tokens.push(ExpressionToken {
            kind: token.kind.name().to_string(),
            value: token.value.clone(),
        });
        if token.kind == TokenType::Eof {
            return Ok(tokens);
        }
    }
}

/// AST of a bare expression with spans counted from the start of the text.
pub fn parse_expression(text: &str) -> Result<Expr, TemplateError> {
    let source = Source::from_bytes("expression", text.as_bytes())?;
    let mut parser = ExpressionParser::new(&source, 0, BARE);
    let expr = parser.parse_expression()?;
    let trailing = parser.peek()?;
    if trailing.kind != TokenType::Eof {
        return Err(parser.unexpected(&trailing));
    }
    Ok(expr)
}

/// Evaluates a bare expression AST against root data given as JSON.
pub fn evaluate_expression(expr: &Expr, data: &serde_json::Value) -> Result<Value, TemplateError> {
    let engine = AstProgram::new(Default::default())
        .map_err(|error| TemplateError::without_position(ErrorCode::E_INTERNAL, "expression", error.message))?;
    let root = bind_map(data).map_err(|error| TemplateError::without_position(error.code, "expression", error.message))?;
    let root = Arc::new(root);
    let mut context = RenderContext::new(
        &engine,
        Arc::clone(&root),
        crate::functions::Env {
            timezone: "Z".to_string(),
            now: 0.0,
        },
        "expression",
    );
    let mut scope = Scope::default();
    let frame = Frame {
        name: "expression".to_string(),
        lines: None,
        context: root,
    };
    Evaluator::new(&mut context).evaluate(expr, &frame, &mut scope)
}
