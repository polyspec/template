//! Formatter (docs/operations/editor-tools.md): formats the whitespace inside every tag and the indentation of every
//! line, and refuses a result whose AST differs from the source AST.

mod body;
mod expression;
mod indent;
pub mod invariant;

use crate::error::{ArgumentError, LineIndex, RequestError};
use crate::parser::{SyntaxTag, TagKind};
use crate::{ParseOptions, analyze};
use body::{BodyInput, format_body};
use indent::indent_edits;
use invariant::{same_tree, without_line_indentation};
use std::fmt;
use std::ops::Range;

/// An indent unit: a run of spaces or one tab.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndentUnit(String);

impl IndentUnit {
    /// Validates an indent unit.
    pub fn new(unit: &str) -> Result<IndentUnit, ArgumentError> {
        if unit == "\t" || (!unit.is_empty() && unit.bytes().all(|byte| byte == b' ')) {
            Ok(IndentUnit(unit.to_string()))
        } else {
            Err(ArgumentError {
                message: "indent must be a run of spaces or one tab".to_string(),
            })
        }
    }

    /// The text of one level.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// How template blocks indent their content.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum TemplateBlocks {
    /// Template blocks add an indentation level like HTML elements.
    #[default]
    Indent,
    /// Template blocks add no level.
    Flat,
}

/// Options of [`format`].
#[derive(Debug, Clone)]
pub struct FormatOptions {
    /// Template name used in error results. The default is `template.tpl`.
    pub name: String,
    /// Engine delimiter option as two characters (LEX-22). The default is `{}`.
    pub delimiters: Option<String>,
    /// Byte range of the source; only tags that lie completely inside it and lines that start inside it are formatted.
    pub range: Option<Range<usize>>,
    /// Indent unit; the default is two spaces. `None` keeps the indentation of every line.
    pub indent: Option<IndentUnit>,
    /// How template blocks indent their content.
    pub template_blocks: TemplateBlocks,
}

impl Default for FormatOptions {
    fn default() -> FormatOptions {
        FormatOptions {
            name: "template.tpl".to_string(),
            delimiters: None,
            range: None,
            indent: Some(IndentUnit("  ".to_string())),
            template_blocks: TemplateBlocks::Indent,
        }
    }
}

/// The formatted text, and whether it differs from the source.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Formatted {
    /// The formatted text; the source itself when nothing changes.
    pub text: String,
    /// Whether the text differs from the source.
    pub changed: bool,
}

/// Why [`format`] returned no text.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FormatErrorReason {
    /// The source does not parse.
    Parse,
    /// The formatted text does not parse to the same AST.
    Invariant,
    /// The HTML structure is not balanced, so the lines cannot be indented.
    Html,
}

/// The reason why [`format`] keeps the source.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct FormatError {
    /// Why the source is kept.
    pub reason: FormatErrorReason,
    /// Error code of the parser, or None for an AST difference or an HTML structure.
    pub code: Option<String>,
    /// 1-based line of the error position.
    pub line: usize,
    /// 1-based byte column of the error position, as in parser errors (ERR-1).
    pub col: usize,
    /// Free text.
    pub message: String,
}

impl fmt::Display for FormatError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for FormatError {}

/// A replacement of a byte range of the source.
#[derive(Debug, Clone)]
struct Edit {
    start: usize,
    end: usize,
    text: String,
}

const BOM: &str = "\u{feff}";

/// Formats the whitespace inside the tags of a template and the indentation of its lines. Other text outside tags,
/// comments and directives are never changed. The source and the result are parsed, and the result is returned only
/// when both ASTs are equal without their `span` fields and, when lines are indented, without the spaces and tabs at
/// the start of lines of text.
pub fn format(source: &str, options: &FormatOptions) -> Result<Formatted, FormatError> {
    let name = options.name.as_str();
    let bom = if source.starts_with(BOM) { BOM } else { "" };
    let text = &source[bom.len()..];
    let parse_options = ParseOptions {
        delimiters: options.delimiters.clone(),
    };
    let analysis = analyze(text.as_bytes(), name, &parse_options).map_err(parse_error)?;

    let range = options
        .range
        .as_ref()
        .map(|range| range.start.saturating_sub(bom.len())..range.end.saturating_sub(bom.len()));
    let mut edits: Vec<Edit> = Vec::new();
    for tag in &analysis.tags {
        if tag.kind == TagKind::Directive {
            continue;
        }
        if range.as_ref().is_some_and(|range| tag.start < range.start || tag.end > range.end) {
            continue;
        }
        if let Some(edit) = tag_edit(text, tag, &analysis.tokens) {
            edits.push(edit);
        }
    }
    if let Some(unit) = &options.indent {
        let indentation = indent_edits(text, &analysis.tags, unit.as_str(), options.template_blocks, range.as_ref()).map_err(|error| {
            let (line, col) = position_of(text, error.index);
            FormatError {
                reason: FormatErrorReason::Html,
                code: None,
                line,
                col,
                message: error.message,
            }
        })?;
        edits.extend(indentation);
        edits.sort_by_key(|edit| edit.start);
    }
    let Some(first) = edits.first().map(|edit| edit.start) else {
        return Ok(Formatted {
            text: source.to_string(),
            changed: false,
        });
    };

    let formatted = apply(text, &edits);
    let invariant = |message: String| {
        let (line, col) = position_of(text, first);
        FormatError {
            reason: FormatErrorReason::Invariant,
            code: None,
            line,
            col,
            message,
        }
    };
    let after = analyze(formatted.as_bytes(), name, &parse_options)
        .map_err(|error| invariant(format!("formatted text does not parse: {error}")))?
        .ast;
    let before = serde_json::to_value(&analysis.ast).expect("AST JSON");
    let after = serde_json::to_value(&after).expect("AST JSON");
    let same = if options.indent.is_none() {
        same_tree(&before, &after)
    } else {
        same_tree(&without_line_indentation(&before), &without_line_indentation(&after))
    };
    if !same {
        return Err(invariant("formatted text parses to a different AST".to_string()));
    }
    Ok(Formatted {
        text: format!("{bom}{formatted}"),
        changed: true,
    })
}

/// Formats a source given as bytes: UTF-8 bytes format as [`format`] does, and other bytes keep the source with the
/// parse error that the parser reports for them (LEX-1).
pub fn format_bytes(source: &[u8], options: &FormatOptions) -> Result<Formatted, FormatError> {
    match std::str::from_utf8(source) {
        Ok(text) => format(text, options),
        Err(_) => {
            let parse_options = ParseOptions {
                delimiters: options.delimiters.clone(),
            };
            analyze(source, &options.name, &parse_options).map_err(parse_error)?;
            unreachable!("the parser rejects a source that is not UTF-8 (LEX-1)")
        }
    }
}

fn tag_edit(text: &str, tag: &SyntaxTag, tokens: &[crate::parser::SyntaxToken]) -> Option<Edit> {
    let inside: Vec<_> = tokens
        .iter()
        .filter(|token| token.start >= tag.body_start && token.end <= tag.body_end)
        .copied()
        .collect();
    let body = format_body(&BodyInput {
        kind: tag.kind,
        source: text,
        body_start: tag.body_start,
        body_end: tag.body_end,
        tokens: &inside,
    })?;
    (body != text[tag.body_start..tag.body_end]).then_some(Edit {
        start: tag.body_start,
        end: tag.body_end,
        text: body,
    })
}

fn apply(text: &str, edits: &[Edit]) -> String {
    let mut output = String::with_capacity(text.len());
    let mut cursor = 0;
    for edit in edits {
        output.push_str(&text[cursor..edit.start]);
        output.push_str(&edit.text);
        cursor = edit.end;
    }
    output.push_str(&text[cursor..]);
    output
}

fn parse_error(error: RequestError) -> FormatError {
    match error {
        RequestError::Template(error) => FormatError {
            reason: FormatErrorReason::Parse,
            code: Some(error.code.as_str().to_string()),
            line: error.line,
            col: error.col,
            message: error.to_string(),
        },
        RequestError::Argument(error) => FormatError {
            reason: FormatErrorReason::Parse,
            code: None,
            line: 0,
            col: 0,
            message: error.message,
        },
    }
}

// The 1-based line and byte column of a byte offset, counted as the parser counts them.
fn position_of(text: &str, index: usize) -> (usize, usize) {
    LineIndex::of(text.as_bytes()).position(index)
}
