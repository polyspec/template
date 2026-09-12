//! Expression lexer, parser and the standalone expression API used by the expression fixtures.

pub mod lexer;
pub mod parser;

use crate::ast::Expr;
use crate::error::TemplateError;
use crate::expr::lexer::{ExpressionLexer, LexerOptions, TokenType};
use crate::expr::parser::ExpressionParser;
use crate::render::context::{Frame, ParsedTemplate, RenderContext, Scope};
use crate::render::engine::Engine;
use crate::render::expressions::Evaluator;
use crate::source::Source;
use crate::value::Value;
use crate::value::bind::bind_map;
use std::rc::Rc;

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
    let source = Source::from_text("expression", text);
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
    let source = Source::from_text("expression", text);
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
    let engine = Engine::new(Default::default());
    let root = bind_map(data).map_err(|error| TemplateError::without_position(error.code, "expression", error.message))?;
    let root = Rc::new(root);
    let template = Rc::new(ParsedTemplate {
        ast: crate::ast::Template {
            name: "expression".to_string(),
            body: Vec::new(),
        },
        lines: None,
    });
    let mut context = RenderContext::new(
        &engine,
        Rc::clone(&root),
        crate::functions::Env {
            timezone: "Z".to_string(),
            now: 0.0,
        },
        "expression",
    );
    let mut scope = Scope::default();
    let frame = Frame { template, context: root };
    Evaluator::new(&mut context).evaluate(expr, &frame, &mut scope)
}
