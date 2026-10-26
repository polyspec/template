//! Template parser: text scanning, tag bodies, block structure and standalone lines
//! (docs/spec/lexical.md, docs/spec/grammar.md).

pub mod block_tag;
pub mod scanner;
pub mod standalone;

use crate::ast::{BinaryOp, Comment, Expr, IfBranch, LiteralValue, Node, Template};
use crate::error::{ErrorCode, TemplateError};
use crate::expr::lexer::{LexerOptions, Token, TokenType};
use crate::expr::parser::ExpressionParser;
use crate::parser::block_tag::RawTagReader;
use crate::parser::scanner::{
    Delimiters, Wrapper, assign_operator_length, ident_length, is_horizontal_space, parse_delimiters, sigil_after, skip_horizontal_space,
    starts_tag, wrapped_tag_at,
};
use crate::parser::standalone::{Range, TagRange, standalone_ranges};
use crate::source::Source;

const RESERVED: &[&str] = &["true", "false", "null", "in"];

/// The kind of an accepted tag.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TagKind {
    /// `{: name = value}` and the other assignment forms.
    Assignment,
    /// `{# ...}`.
    Block,
    /// `{/}`.
    Close,
    /// `{* ... *}`.
    Comment,
    /// `{% delimiter OC}`.
    Directive,
    /// `{= ...}`.
    Echo,
    /// `{:}`.
    Else,
    /// `{:? ...}`.
    Elseif,
    /// `{@ name = ...}`.
    For,
    /// `{? ...}`.
    If,
    /// `{?# id}`.
    Ifblock,
    /// `{+ path}`.
    Include,
}

impl TagKind {
    /// The name of the kind.
    pub fn as_str(self) -> &'static str {
        match self {
            TagKind::Assignment => "assignment",
            TagKind::Block => "block",
            TagKind::Close => "close",
            TagKind::Comment => "comment",
            TagKind::Directive => "directive",
            TagKind::Echo => "echo",
            TagKind::Else => "else",
            TagKind::Elseif => "elseif",
            TagKind::For => "for",
            TagKind::If => "if",
            TagKind::Ifblock => "ifblock",
            TagKind::Include => "include",
        }
    }
}

/// Parser-owned source range of one accepted tag. `body_start` and `body_end` are the byte offsets of the text
/// between the open and the close delimiters, sigil included.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SyntaxTag {
    /// Start byte offset, wrapper included.
    pub start: usize,
    /// End byte offset, wrapper included.
    pub end: usize,
    /// Whether the tag is an echo tag.
    pub echo: bool,
    /// Kind of the tag.
    pub kind: TagKind,
    /// Byte offset after the open delimiter.
    pub body_start: usize,
    /// Byte offset of the close delimiter.
    pub body_end: usize,
}

/// The token classes of EDT-8.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TokenKind {
    /// Open and close delimiters with their wrappers.
    Delimiter,
    /// Sigils, `null`, `true`, `false`, `in` and `delimiter`.
    Keyword,
    /// Variable names.
    Variable,
    /// Property accessors.
    Property,
    /// Function and method names.
    Function,
    /// String literals.
    String,
    /// Number literals.
    Number,
    /// Operators and punctuation.
    Operator,
    /// A whole comment tag.
    Comment,
    /// Template paths and block tag words.
    Path,
}

impl TokenKind {
    /// The name of the class.
    pub fn as_str(self) -> &'static str {
        match self {
            TokenKind::Delimiter => "delimiter",
            TokenKind::Keyword => "keyword",
            TokenKind::Variable => "variable",
            TokenKind::Property => "property",
            TokenKind::Function => "function",
            TokenKind::String => "string",
            TokenKind::Number => "number",
            TokenKind::Operator => "operator",
            TokenKind::Comment => "comment",
            TokenKind::Path => "path",
        }
    }
}

/// A classified byte range of an accepted tag (EDT-8).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SyntaxToken {
    /// Start byte offset.
    pub start: usize,
    /// End byte offset.
    pub end: usize,
    /// Class of the range.
    pub kind: TokenKind,
}

/// The AST of a template with the tags accepted while producing it and their tokens, in source order.
#[derive(Debug, Clone)]
pub struct TemplateAnalysis {
    /// The AST.
    pub ast: Template,
    /// The accepted tags.
    pub tags: Vec<SyntaxTag>,
    /// The tokens of the accepted tags.
    pub tokens: Vec<SyntaxToken>,
}

/// Accepted parser ranges and its first parse error (EDT-11).
#[derive(Debug, Clone)]
pub struct PrefixAnalysis {
    /// Tags accepted before the error.
    pub tags: Vec<SyntaxTag>,
    /// Classified ranges belonging to the accepted tags.
    pub tokens: Vec<SyntaxToken>,
    /// The first parse error, or none for a source that parses.
    pub error: Option<TemplateError>,
}

// The EDT-8 class of an expression token, which depends on its neighbours for names.
fn expression_kind(token: &Token, previous: Option<&Token>, next: Option<&Token>) -> TokenKind {
    match token.kind {
        TokenType::Str => TokenKind::String,
        TokenType::Number => TokenKind::Number,
        TokenType::Null | TokenType::True | TokenType::False | TokenType::In => TokenKind::Keyword,
        TokenType::Ident => {
            if next.is_some_and(|next| next.kind == TokenType::LParen) || previous.is_some_and(|previous| previous.kind == TokenType::Pipe)
            {
                TokenKind::Function
            } else {
                TokenKind::Variable
            }
        }
        TokenType::DotIdent => {
            if next.is_some_and(|next| next.kind == TokenType::LParen) {
                TokenKind::Function
            } else {
                TokenKind::Property
            }
        }
        TokenType::DotIndex => TokenKind::Property,
        _ => TokenKind::Operator,
    }
}

fn expression_tokens(parser: &ExpressionParser) -> Vec<SyntaxToken> {
    let tokens: Vec<&Token> = parser
        .consumed()
        .iter()
        .filter(|token| token.kind != TokenType::Close && token.kind != TokenType::Eof)
        .collect();
    tokens
        .iter()
        .enumerate()
        .map(|(index, token)| SyntaxToken {
            start: token.start,
            end: token.end,
            kind: expression_kind(token, index.checked_sub(1).map(|i| tokens[i]), tokens.get(index + 1).copied()),
        })
        .collect()
}

fn syntax_kind(sigil: &str, assignment: bool) -> TagKind {
    if assignment {
        return TagKind::Assignment;
    }
    match sigil {
        "*" => TagKind::Comment,
        "=" => TagKind::Echo,
        "@" => TagKind::For,
        "?" => TagKind::If,
        "?#" => TagKind::Ifblock,
        ":?" => TagKind::Elseif,
        ":" => TagKind::Else,
        "/" => TagKind::Close,
        "+" => TagKind::Include,
        "#" => TagKind::Block,
        "%" => TagKind::Directive,
        other => unreachable!("unknown accepted tag sigil {other:?}"),
    }
}

#[derive(Debug, Clone)]
struct TextPiece {
    start: usize,
    end: usize,
    value: String,
}

#[derive(Debug, Clone)]
enum Item {
    Text(TextPiece),
    Node(Node),
}

struct Frame {
    node: Node,
    /// Bodies: for If one list per branch plus an optional else; for For the body and the empty branch; for IfBlock the body and else.
    bodies: Vec<Vec<Item>>,
    /// Index into `bodies` of the list that receives new items.
    current: usize,
    has_else: bool,
    open_start: usize,
}

struct TagContext {
    start: usize,
    open: usize,
    close_count: usize,
    wrapper: Option<Wrapper>,
}

/// Parses a source into a template AST.
pub fn parse_template(source: &Source, delimiters: Delimiters) -> Result<Template, TemplateError> {
    Ok(analyze_template(source, delimiters)?.ast)
}

/// Parses a source once and returns its AST with the parser-owned tag ranges and tokens.
pub fn analyze_template(source: &Source, delimiters: Delimiters) -> Result<TemplateAnalysis, TemplateError> {
    TemplateParser::new(source, delimiters).parse()
}

/// Preserves accepted ranges when the next tag or EOF fails to parse (EDT-11).
pub fn analyze_template_prefix(source: &Source, delimiters: Delimiters) -> PrefixAnalysis {
    let mut parser = TemplateParser::new(source, delimiters);
    let error = parser.scan_complete().err();
    PrefixAnalysis {
        tags: parser.tags,
        tokens: parser.tokens,
        error,
    }
}

struct TemplateParser<'a> {
    source: &'a Source,
    delimiters: Delimiters,
    root: Vec<Item>,
    frames: Vec<Frame>,
    tags: Vec<SyntaxTag>,
    tokens: Vec<SyntaxToken>,
    // The tokens of the tag being parsed outside expressions, and those of its expressions.
    tag_marks: Vec<SyntaxToken>,
    tag_expressions: Vec<SyntaxToken>,
    comments: Vec<Comment>,
    saw_tag: bool,
    text_before_first_tag_is_whitespace: bool,
}

impl<'a> TemplateParser<'a> {
    fn new(source: &'a Source, delimiters: Delimiters) -> TemplateParser<'a> {
        TemplateParser {
            source,
            delimiters,
            root: Vec::new(),
            frames: Vec::new(),
            tags: Vec::new(),
            tokens: Vec::new(),
            tag_marks: Vec::new(),
            tag_expressions: Vec::new(),
            comments: Vec::new(),
            saw_tag: false,
            text_before_first_tag_is_whitespace: true,
        }
    }

    fn bytes(&self) -> &'a [u8] {
        self.source.bytes()
    }

    fn fail(&self, code: ErrorCode, start: usize, end: usize, message: impl Into<String>) -> TemplateError {
        self.source.error(code, start, end, message)
    }

    fn push_item(&mut self, item: Item) {
        match self.frames.last_mut() {
            Some(frame) => frame.bodies[frame.current].push(item),
            None => self.root.push(item),
        }
    }

    fn push_text(&mut self, start: usize, end: usize, value: String) {
        if !self.saw_tag && self.text_before_first_tag_is_whitespace && !value.bytes().all(|b| matches!(b, b' ' | b'\t' | b'\r' | b'\n')) {
            self.text_before_first_tag_is_whitespace = false;
        }
        self.push_item(Item::Text(TextPiece { start, end, value }));
    }

    fn mark(&mut self, start: usize, end: usize, kind: TokenKind) {
        self.tag_marks.push(SyntaxToken { start, end, kind });
    }

    fn collect(&mut self, parser: &ExpressionParser) {
        self.tag_expressions.extend(expression_tokens(parser));
    }

    fn scan_complete(&mut self) -> Result<(), TemplateError> {
        self.scan()?;
        if let Some(frame) = self.frames.last() {
            return Err(self.fail(
                ErrorCode::E_PARSE_UNCLOSED_BLOCK,
                frame.open_start,
                frame.open_start + 1,
                "block is not closed before the end of the file",
            ));
        }
        Ok(())
    }

    fn parse(mut self) -> Result<TemplateAnalysis, TemplateError> {
        self.scan_complete()?;
        let ranges: Vec<TagRange> = self
            .tags
            .iter()
            .map(|tag| TagRange {
                start: tag.start,
                end: tag.end,
                echo: tag.echo,
            })
            .collect();
        let removed = standalone_ranges(self.bytes(), &ranges);
        let root = std::mem::take(&mut self.root);
        Ok(TemplateAnalysis {
            ast: Template {
                name: self.source.name.clone(),
                body: finalize(root, &removed),
                comments: std::mem::take(&mut self.comments),
            },
            tags: self.tags,
            tokens: self.tokens,
        })
    }

    fn scan(&mut self) -> Result<(), TemplateError> {
        let bytes = self.bytes();
        let mut index = 0;
        let mut text_start = 0;
        while index < bytes.len() {
            let byte = bytes[index];
            let open = self.delimiters.open;
            if byte == b'\\' && bytes.get(index + 1) == Some(&open) && starts_tag(bytes, index + 1, self.delimiters) {
                self.flush_text(text_start, index);
                self.push_text(index, index + 2, (open as char).to_string());
                index += 2;
                text_start = index;
                continue;
            }
            if byte == open && starts_tag(bytes, index, self.delimiters) {
                self.flush_text(text_start, index);
                index = self.parse_tag(TagContext {
                    start: index,
                    open: index,
                    close_count: 1,
                    wrapper: None,
                })?;
                text_start = index;
                continue;
            }
            if let Some(wrapper) = wrapped_tag_at(bytes, index, self.delimiters) {
                self.flush_text(text_start, index);
                let open_index = skip_horizontal_space(bytes, index + wrapper.opener.len()) + 1;
                index = self.parse_tag(TagContext {
                    start: index,
                    open: open_index,
                    close_count: 2,
                    wrapper: Some(wrapper),
                })?;
                text_start = index;
                continue;
            }
            index += 1;
        }
        self.flush_text(text_start, bytes.len());
        Ok(())
    }

    fn flush_text(&mut self, start: usize, end: usize) {
        if end > start {
            let value = self.source.text[start..end].to_string();
            self.push_text(start, end, value);
        }
    }

    fn close_sequence(&self, context: &TagContext) -> Vec<u8> {
        std::iter::repeat_n(self.delimiters.close, context.close_count).collect()
    }

    fn lexer_options(&self, context: &TagContext) -> LexerOptions {
        LexerOptions {
            close: Some(self.delimiters.close),
            close_count: context.close_count,
            open_index: Some(context.open),
        }
    }

    fn parse_tag(&mut self, context: TagContext) -> Result<usize, TemplateError> {
        let bytes = self.bytes();
        let sigil = sigil_after(bytes, context.open);
        let body_start = match sigil {
            None => context.open + 1,
            Some(sigil) => skip_horizontal_space(bytes, skip_horizontal_space(bytes, context.open + 1) + sigil.len()),
        };
        let is_directive = sigil == Some("%");
        let first_tag = !self.saw_tag;
        self.saw_tag = true;
        self.tag_marks.clear();
        self.tag_expressions.clear();
        let mut echo = false;
        let end = match sigil {
            Some("*") => self.parse_comment(&context, body_start)?,
            Some("=") => {
                echo = true;
                let mut parser = ExpressionParser::new(self.source, body_start, self.lexer_options(&context));
                let expr = parser.parse_expression()?;
                let end = self.finish_tag(&context, parser.expect_close()?)?;
                self.collect(&parser);
                self.push_item(Item::Node(Node::Echo {
                    expr,
                    span: [context.start, end],
                }));
                end
            }
            Some("@") => self.parse_loop(&context, body_start)?,
            Some("?") => {
                let mut parser = ExpressionParser::new(self.source, body_start, self.lexer_options(&context));
                let test = parser.parse_expression()?;
                let end = self.finish_tag(&context, parser.expect_close()?)?;
                self.collect(&parser);
                let span = [context.start, end];
                let node = Node::If {
                    branches: vec![IfBranch {
                        test,
                        body: Vec::new(),
                        span,
                    }],
                    r#else: None,
                    span,
                };
                self.open_frame(node, context.start);
                end
            }
            Some("?#") => {
                let mut parser = ExpressionParser::new(self.source, body_start, self.lexer_options(&context));
                let id = parser.expect(TokenType::Ident)?;
                let end = self.finish_tag(&context, parser.expect_close()?)?;
                self.collect(&parser);
                let node = Node::IfBlock {
                    id: id.value,
                    body: Vec::new(),
                    r#else: None,
                    span: [context.start, end],
                };
                self.open_frame(node, context.start);
                end
            }
            Some(":?") => {
                let Some(frame) = self.frames.last() else {
                    return Err(self.fail(
                        ErrorCode::E_PARSE_ELSE_OUTSIDE_BLOCK,
                        context.start,
                        context.start + 1,
                        "\"{:?}\" outside of a block",
                    ));
                };
                if !matches!(frame.node, Node::If { .. }) {
                    return Err(self.fail(
                        ErrorCode::E_PARSE_ELSEIF_NOT_IN_IF,
                        context.start,
                        context.start + 1,
                        "\"{:?}\" inside a loop or if-block",
                    ));
                }
                if frame.has_else {
                    return Err(self.fail(
                        ErrorCode::E_PARSE_ELSEIF_AFTER_ELSE,
                        context.start,
                        context.start + 1,
                        "\"{:?}\" after \"{:}\"",
                    ));
                }
                let mut parser = ExpressionParser::new(self.source, body_start, self.lexer_options(&context));
                let test = parser.parse_expression()?;
                let end = self.finish_tag(&context, parser.expect_close()?)?;
                self.collect(&parser);
                let frame = self.frames.last_mut().expect("frame");
                if let Node::If { branches, .. } = &mut frame.node {
                    branches.push(IfBranch {
                        test,
                        body: Vec::new(),
                        span: [context.start, end],
                    });
                }
                frame.bodies.push(Vec::new());
                frame.current = frame.bodies.len() - 1;
                end
            }
            Some(":") if crate::parser::scanner::assignment_form(bytes, body_start) => self.parse_assignment(&context, body_start)?,
            Some(":") => {
                let Some(frame) = self.frames.last() else {
                    return Err(self.fail(
                        ErrorCode::E_PARSE_ELSE_OUTSIDE_BLOCK,
                        context.start,
                        context.start + 1,
                        "\"{:}\" outside of a block",
                    ));
                };
                if frame.has_else {
                    return Err(self.fail(
                        ErrorCode::E_PARSE_DUPLICATE_ELSE,
                        context.start,
                        context.start + 1,
                        "second \"{:}\" in the same block",
                    ));
                }
                let end = self.finish_tag(&context, self.expect_close_raw(&context, body_start)?)?;
                let frame = self.frames.last_mut().expect("frame");
                frame.has_else = true;
                frame.bodies.push(Vec::new());
                frame.current = frame.bodies.len() - 1;
                end
            }
            Some("/") => {
                let Some(frame) = self.frames.pop() else {
                    return Err(self.fail(
                        ErrorCode::E_PARSE_UNEXPECTED_CLOSE,
                        context.start,
                        context.start + 1,
                        "\"{/}\" without an open block",
                    ));
                };
                let end = self.finish_tag(&context, self.expect_close_raw(&context, body_start)?)?;
                let node = close_frame(frame, end);
                self.push_item(Item::Node(node));
                end
            }
            Some("+") => {
                let reader = RawTagReader::new(self.source, self.delimiters.close, context.close_count);
                let path = reader.read_include_path(body_start)?;
                self.mark(path.start, path.end, if path.quoted { TokenKind::String } else { TokenKind::Path });
                let end = self.finish_tag(&context, self.expect_close_raw(&context, path.end)?)?;
                self.push_item(Item::Node(Node::Include {
                    path: path.path,
                    span: [context.start, end],
                }));
                end
            }
            Some("#") => {
                let reader = RawTagReader::new(self.source, self.delimiters.close, context.close_count);
                let body = reader.read_block_body(body_start)?;
                for word in &body.words {
                    self.mark(word.start, word.end, if word.quoted { TokenKind::String } else { TokenKind::Path });
                }
                let end = self.finish_tag(&context, self.expect_close_raw(&context, body.end)?)?;
                self.push_item(Item::Node(Node::Block {
                    id: body.id,
                    path: body.path,
                    scope: body.scope,
                    span: [context.start, end],
                }));
                end
            }
            Some("%") => self.parse_directive(&context, body_start, first_tag)?,
            None => return Err(self.fail(ErrorCode::E_PARSE_UNEXPECTED_TOKEN, body_start, body_start + 1, "unknown tag")),
            Some(_) => return Err(self.fail(ErrorCode::E_PARSE_UNEXPECTED_TOKEN, body_start, body_start + 1, "unknown tag")),
        };
        if is_directive && !first_tag {
            return Err(self.fail(
                ErrorCode::E_PARSE_INVALID_DIRECTIVE,
                context.start,
                context.start + 1,
                "delimiter directive is not the first tag",
            ));
        }
        let sigil = sigil.expect("accepted tag sigil");
        let kind = syntax_kind(sigil, sigil == ":" && crate::parser::scanner::assignment_form(bytes, body_start));
        let tag_body_start = context.open + 1;
        let tag_body_end = self.close_start(&context, end);
        self.tags.push(SyntaxTag {
            start: context.start,
            end,
            echo,
            kind,
            body_start: tag_body_start,
            body_end: tag_body_end,
        });
        if kind == TagKind::Comment {
            self.tokens.push(SyntaxToken {
                start: context.start,
                end,
                kind: TokenKind::Comment,
            });
            return Ok(end);
        }
        self.tokens.push(SyntaxToken {
            start: context.start,
            end: tag_body_start,
            kind: TokenKind::Delimiter,
        });
        let sigil_start = skip_horizontal_space(bytes, tag_body_start);
        self.tokens.push(SyntaxToken {
            start: sigil_start,
            end: sigil_start + sigil.len(),
            kind: TokenKind::Keyword,
        });
        self.tokens.append(&mut self.tag_marks);
        self.tokens.append(&mut self.tag_expressions);
        self.tokens.push(SyntaxToken {
            start: tag_body_end,
            end,
            kind: TokenKind::Delimiter,
        });
        Ok(end)
    }

    // The byte offset of the close delimiters of the tag that ends at `end`: before the wrapper closer and the
    // horizontal whitespace in front of it (LEX-19).
    fn close_start(&self, context: &TagContext, end: usize) -> usize {
        let bytes = self.bytes();
        let mut tail = end;
        if let Some(wrapper) = context.wrapper {
            tail -= wrapper.closer.len();
            while is_horizontal_space(bytes[tail - 1]) {
                tail -= 1;
            }
        }
        tail - context.close_count
    }

    fn expect_close_raw(&self, context: &TagContext, index: usize) -> Result<usize, TemplateError> {
        let bytes = self.bytes();
        let at = skip_horizontal_space(bytes, index);
        let sequence = self.close_sequence(context);
        if bytes[at.min(bytes.len())..].starts_with(&sequence) {
            return Ok(at + sequence.len());
        }
        if !bytes[at.min(bytes.len())..].contains(&self.delimiters.close) {
            return Err(self.fail(
                ErrorCode::E_PARSE_UNTERMINATED_TAG,
                context.open,
                context.open + 1,
                "tag is not terminated",
            ));
        }
        Err(self.fail(
            ErrorCode::E_PARSE_UNEXPECTED_TOKEN,
            at,
            at + 1,
            "unexpected character before the end of the tag",
        ))
    }

    fn finish_tag(&self, context: &TagContext, after_close: usize) -> Result<usize, TemplateError> {
        let Some(wrapper) = context.wrapper else { return Ok(after_close) };
        let bytes = self.bytes();
        let at = skip_horizontal_space(bytes, after_close);
        if !bytes[at.min(bytes.len())..].starts_with(wrapper.closer.as_bytes()) {
            return Err(self.fail(
                ErrorCode::E_PARSE_INVALID_WRAPPER,
                context.start,
                context.start + wrapper.opener.len(),
                format!("wrapped tag is not followed by {:?}", wrapper.closer),
            ));
        }
        Ok(at + wrapper.closer.len())
    }

    fn parse_comment(&mut self, context: &TagContext, body_start: usize) -> Result<usize, TemplateError> {
        let mut terminator = vec![b'*'];
        terminator.extend(self.close_sequence(context));
        let bytes = self.bytes();
        let found = bytes[body_start..]
            .windows(terminator.len())
            .position(|window| window == terminator.as_slice());
        let Some(offset) = found else {
            return Err(self.fail(
                ErrorCode::E_PARSE_UNTERMINATED_COMMENT,
                context.open,
                context.open + 1,
                "comment is not terminated",
            ));
        };
        let end = self.finish_tag(context, body_start + offset + terminator.len())?;
        // The value starts after the sigil `*` (AST-9).
        let value_start = skip_horizontal_space(bytes, context.open + 1) + 1;
        let value = self.source.text[value_start..body_start + offset].to_string();
        self.comments.push(Comment {
            value,
            span: [context.start, end],
        });
        Ok(end)
    }

    fn parse_loop(&mut self, context: &TagContext, body_start: usize) -> Result<usize, TemplateError> {
        let bytes = self.bytes();
        let name_start = skip_horizontal_space(bytes, body_start);
        let name_length = ident_length(bytes, name_start);
        let after_name = skip_horizontal_space(bytes, name_start + name_length);
        if name_length == 0 || bytes.get(after_name) != Some(&b'=') {
            return Err(self.fail(
                ErrorCode::E_PARSE_UNEXPECTED_TOKEN,
                name_start,
                name_start + 1,
                "loop requires \"name = expression\"",
            ));
        }
        let name = self.source.text[name_start..name_start + name_length].to_string();
        if RESERVED.contains(&name.as_str()) {
            return Err(self.fail(
                ErrorCode::E_PARSE_RESERVED_NAME,
                name_start,
                name_start + name_length,
                format!("{name} is a reserved word"),
            ));
        }
        self.mark(name_start, name_start + name_length, TokenKind::Variable);
        self.mark(after_name, after_name + 1, TokenKind::Operator);
        let mut parser = ExpressionParser::new(self.source, after_name + 1, self.lexer_options(context));
        let iter = parser.parse_expression()?;
        let end = self.finish_tag(context, parser.expect_close()?)?;
        self.collect(&parser);
        let node = Node::For {
            name,
            iter,
            body: Vec::new(),
            empty: None,
            span: [context.start, end],
        };
        self.open_frame(node, context.start);
        Ok(end)
    }

    /// Opens a block: its tag node, with an empty body and no else yet.
    fn open_frame(&mut self, node: Node, open_start: usize) {
        self.frames.push(Frame {
            node,
            bodies: vec![Vec::new()],
            current: 0,
            has_else: false,
            open_start,
        });
    }

    fn parse_assignment(&mut self, context: &TagContext, body_start: usize) -> Result<usize, TemplateError> {
        let bytes = self.bytes();
        let name_length = ident_length(bytes, body_start);
        let operator_start = skip_horizontal_space(bytes, body_start + name_length);
        let operator_length = assign_operator_length(bytes, operator_start);
        if name_length == 0 || operator_length == 0 {
            return Err(self.fail(ErrorCode::E_PARSE_UNEXPECTED_TOKEN, body_start, body_start + 1, "unknown tag"));
        }
        let name = self.source.text[body_start..body_start + name_length].to_string();
        let operator = self.source.text[operator_start..operator_start + operator_length].to_string();
        if RESERVED.contains(&name.as_str()) {
            return Err(self.fail(
                ErrorCode::E_PARSE_RESERVED_NAME,
                body_start,
                body_start + name_length,
                format!("{name} is a reserved word"),
            ));
        }
        let variable = Expr::Var {
            name: name.clone(),
            span: [body_start, body_start + name_length],
        };
        let after_operator = operator_start + operator_length;
        self.mark(body_start, body_start + name_length, TokenKind::Variable);
        self.mark(operator_start, after_operator, TokenKind::Operator);
        let (expr, end) = if operator == "++" || operator == "--" {
            let end = self.finish_tag(context, self.expect_close_raw(context, after_operator)?)?;
            let one = Expr::Literal {
                kind: "number".to_string(),
                value: LiteralValue::Number(1.0),
                span: [operator_start, after_operator],
            };
            let op = if operator == "++" { BinaryOp::Add } else { BinaryOp::Subtract };
            (
                Expr::Binary {
                    op,
                    left: Box::new(variable),
                    right: Box::new(one),
                    span: [body_start, after_operator],
                },
                end,
            )
        } else {
            let mut parser = ExpressionParser::new(self.source, after_operator, self.lexer_options(context));
            let value = parser.parse_expression()?;
            let end = self.finish_tag(context, parser.expect_close()?)?;
            self.collect(&parser);
            if operator == "=" {
                (value, end)
            } else {
                let Some(op) = BinaryOp::from_text(&operator[..1]) else {
                    return Err(self.fail(
                        ErrorCode::E_PARSE_UNEXPECTED_TOKEN,
                        body_start,
                        body_start + 1,
                        "unknown assignment operator",
                    ));
                };
                (
                    Expr::Binary {
                        op,
                        left: Box::new(variable),
                        right: Box::new(value),
                        span: [body_start, parser.end()],
                    },
                    end,
                )
            }
        };
        self.push_item(Item::Node(Node::Set {
            name,
            expr,
            span: [context.start, end],
        }));
        Ok(end)
    }

    fn parse_directive(&mut self, context: &TagContext, body_start: usize, first_tag: bool) -> Result<usize, TemplateError> {
        let invalid =
            |parser: &Self, message: &str| parser.fail(ErrorCode::E_PARSE_INVALID_DIRECTIVE, context.start, context.start + 1, message);
        if !first_tag || !self.text_before_first_tag_is_whitespace {
            return Err(invalid(self, "delimiter directive is not the first tag"));
        }
        let bytes = self.bytes();
        let mut index = skip_horizontal_space(bytes, body_start);
        if !bytes[index.min(bytes.len())..].starts_with(b"delimiter") {
            return Err(invalid(self, "directive is not \"delimiter\""));
        }
        self.mark(index, index + "delimiter".len(), TokenKind::Keyword);
        index = skip_horizontal_space(bytes, index + "delimiter".len());
        let value_start = index;
        let sequence = self.close_sequence(context);
        let mut value = Vec::new();
        while index < bytes.len() && !is_horizontal_space(bytes[index]) && !bytes[index..].starts_with(&sequence) {
            value.push(bytes[index]);
            index += 1;
            if value.len() > 2 {
                break;
            }
        }
        let text = String::from_utf8_lossy(&value).to_string();
        let Some(delimiters) = parse_delimiters(&text) else {
            return Err(invalid(self, &format!("{text:?} is not a delimiter pair")));
        };
        self.mark(value_start, index, TokenKind::String);
        let end = self.finish_tag(context, self.expect_close_raw(context, index)?)?;
        self.delimiters = delimiters;
        Ok(end)
    }
}

/// Moves the bodies of a closed frame into its node.
fn close_frame(frame: Frame, end: usize) -> Node {
    let mut bodies = frame.bodies.into_iter();
    match frame.node {
        Node::If { mut branches, span, .. } => {
            for branch in branches.iter_mut() {
                branch.body = items_to_placeholder(bodies.next().unwrap_or_default());
            }
            let r#else = if frame.has_else {
                Some(items_to_placeholder(bodies.next().unwrap_or_default()))
            } else {
                None
            };
            Node::If {
                branches,
                r#else,
                span: [span[0], end],
            }
        }
        Node::For { name, iter, span, .. } => {
            let body = items_to_placeholder(bodies.next().unwrap_or_default());
            let empty = if frame.has_else {
                Some(items_to_placeholder(bodies.next().unwrap_or_default()))
            } else {
                None
            };
            Node::For {
                name,
                iter,
                body,
                empty,
                span: [span[0], end],
            }
        }
        Node::IfBlock { id, span, .. } => {
            let body = items_to_placeholder(bodies.next().unwrap_or_default());
            let r#else = if frame.has_else {
                Some(items_to_placeholder(bodies.next().unwrap_or_default()))
            } else {
                None
            };
            Node::IfBlock {
                id,
                body,
                r#else,
                span: [span[0], end],
            }
        }
        other => other,
    }
}

// Text pieces are carried inside Node bodies as Text nodes whose span marks them for later merging;
// the merge happens in `finalize` after standalone removal. Pieces that were escapes keep their
// value in the node and their source span.
fn items_to_placeholder(items: Vec<Item>) -> Vec<Node> {
    items
        .into_iter()
        .map(|item| match item {
            Item::Text(piece) => Node::Text {
                value: piece.value,
                span: [piece.start, piece.end],
            },
            Item::Node(node) => node,
        })
        .collect()
}

/// Applies standalone removal to text pieces and merges them into Text nodes (AST-6).
fn finalize(items: Vec<Item>, removed: &[Range]) -> Vec<Node> {
    finalize_nodes(items_to_placeholder(items), removed)
}

fn finalize_nodes(nodes: Vec<Node>, removed: &[Range]) -> Vec<Node> {
    let mut result: Vec<Node> = Vec::new();
    let mut pending: Vec<TextPiece> = Vec::new();
    let flush = |pending: &mut Vec<TextPiece>, result: &mut Vec<Node>| {
        if pending.is_empty() {
            return;
        }
        let value: String = pending.iter().map(|piece| piece.value.as_str()).collect();
        if !value.is_empty() {
            let span = [pending[0].start, pending[pending.len() - 1].end];
            result.push(Node::Text { value, span });
        }
        pending.clear();
    };
    for node in nodes {
        match node {
            Node::Text { value, span } => {
                for piece in cut_piece(
                    TextPiece {
                        start: span[0],
                        end: span[1],
                        value,
                    },
                    removed,
                ) {
                    pending.push(piece);
                }
            }
            other => {
                flush(&mut pending, &mut result);
                result.push(finalize_node(other, removed));
            }
        }
    }
    flush(&mut pending, &mut result);
    result
}

fn finalize_node(node: Node, removed: &[Range]) -> Node {
    match node {
        Node::If { branches, r#else, span } => Node::If {
            branches: branches
                .into_iter()
                .map(|branch| IfBranch {
                    test: branch.test,
                    body: finalize_nodes(branch.body, removed),
                    span: branch.span,
                })
                .collect(),
            r#else: r#else.map(|body| finalize_nodes(body, removed)),
            span,
        },
        Node::For {
            name,
            iter,
            body,
            empty,
            span,
        } => Node::For {
            name,
            iter,
            body: finalize_nodes(body, removed),
            empty: empty.map(|body| finalize_nodes(body, removed)),
            span,
        },
        Node::IfBlock { id, body, r#else, span } => Node::IfBlock {
            id,
            body: finalize_nodes(body, removed),
            r#else: r#else.map(|body| finalize_nodes(body, removed)),
            span,
        },
        other => other,
    }
}

// Removes the parts of a text piece that fall inside removed ranges.
fn cut_piece(piece: TextPiece, removed: &[Range]) -> Vec<TextPiece> {
    let mut result = Vec::new();
    let mut cursor = piece.start;
    let exact = piece.end - piece.start == piece.value.len();
    let push = |result: &mut Vec<TextPiece>, start: usize, end: usize| {
        if end <= start {
            return;
        }
        let value = if exact {
            piece.value[start - piece.start..end - piece.start].to_string()
        } else {
            piece.value.clone()
        };
        result.push(TextPiece { start, end, value });
    };
    for range in removed {
        if range.end <= cursor {
            continue;
        }
        if range.start >= piece.end {
            break;
        }
        push(&mut result, cursor, range.start.min(piece.end));
        cursor = cursor.max(range.end);
    }
    push(&mut result, cursor, piece.end);
    result
}
