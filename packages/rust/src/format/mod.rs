//! Formatter (docs/operations/editor-tools.md): formats the whitespace inside every tag and the indentation of every
//! line, and refuses a result whose AST differs from the source AST.

mod body;
mod expression;
mod indent;
mod invariant;

use crate::error::{ErrorCode, LineIndex, Span, TemplateError};
use crate::parser::{SyntaxTag, TagKind};
use crate::{ParseOptions, analyze};
use body::{BodyInput, format_body};
use indent::indent_edits;
use invariant::same_tree;

/// An indent unit: a run of spaces or one tab (FMT-17).
struct IndentUnit(String);

impl IndentUnit {
    /// Validates an indent unit.
    fn new(unit: &str) -> Result<IndentUnit, TemplateError> {
        if unit == "\t" || (!unit.is_empty() && unit.bytes().all(|byte| byte == b' ')) {
            Ok(IndentUnit(unit.to_string()))
        } else {
            Err(TemplateError::argument(
                ErrorCode::ArgumentIndent,
                "",
                "indent must be a run of spaces or one tab",
            ))
        }
    }

    /// The text of one level.
    fn as_str(&self) -> &str {
        &self.0
    }
}

/// How template blocks indent their content.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TemplateBlocks {
    /// Template blocks add an indentation level like HTML elements.
    Indent,
    /// Template blocks add no level.
    Flat,
}

/// Options of [`format()`].
#[derive(Debug, Clone, Default)]
pub struct FormatOptions {
    /// Template name used in error results. `None` is [`DEFAULT_FORMAT_NAME`].
    pub name: Option<String>,
    /// Engine delimiter option as two characters (LEX-22). The default is `{}`.
    pub delimiters: Option<String>,
    /// Byte range `[start, end)` of the source; only tags that lie completely inside it and lines that start inside it
    /// are formatted.
    pub range: Option<Span>,
    /// Indent unit, a run of spaces or one tab, which `format` checks (FMT-17). `None` is [`DEFAULT_INDENT`].
    pub indent: Option<String>,
    /// Whether every line keeps its indentation, so that only the whitespace inside tags changes (FMT-18). `None` is
    /// [`DEFAULT_KEEP_INDENTATION`].
    pub keep_indentation: Option<bool>,
    /// How template blocks indent their content. `None` is [`DEFAULT_TEMPLATE_BLOCKS`].
    pub template_blocks: Option<TemplateBlocks>,
}

/// How template blocks indent when the options name no policy (`format_options.template_blocks` of the interface
/// contract).
pub const DEFAULT_TEMPLATE_BLOCKS: TemplateBlocks = TemplateBlocks::Indent;

impl Default for TemplateBlocks {
    fn default() -> TemplateBlocks {
        DEFAULT_TEMPLATE_BLOCKS
    }
}

/// The indent unit of a format whose options name none (`format_options.indent` of the interface contract, FMT-17).
pub const DEFAULT_INDENT: &str = "  ";

/// Whether a format whose options do not say so keeps the indentation of every line
/// (`format_options.keep_indentation` of the interface contract, FMT-18).
pub const DEFAULT_KEEP_INDENTATION: bool = false;

/// The template name of a format whose options name none (`format_options.name` of the interface contract).
pub const DEFAULT_FORMAT_NAME: &str = "template.tpl";

impl FormatOptions {
    /// The template name of the error results: the given name, or [`DEFAULT_FORMAT_NAME`].
    pub fn name(&self) -> &str {
        match &self.name {
            Some(name) => name,
            None => DEFAULT_FORMAT_NAME,
        }
    }

    /// How template blocks indent: the given policy, or [`DEFAULT_TEMPLATE_BLOCKS`].
    pub fn template_blocks(&self) -> TemplateBlocks {
        match self.template_blocks {
            Some(policy) => policy,
            None => DEFAULT_TEMPLATE_BLOCKS,
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
/// A source that cannot be formatted keeps its text, and the error says why (ERR-15): the parse error of the source,
/// `argument_delimiters`, `format_html` at the tag that does not nest or `format_invariant` at the first changed byte.
pub fn format(source: &str, options: &FormatOptions) -> Result<Formatted, TemplateError> {
    let name = options.name();
    // FMT-17: the indent unit of the options is checked whether or not the lines are indented.
    let unit = match &options.indent {
        Some(unit) => IndentUnit::new(unit)?,
        None => IndentUnit(DEFAULT_INDENT.to_string()),
    };
    let keep = match options.keep_indentation {
        Some(keep) => keep,
        None => DEFAULT_KEEP_INDENTATION,
    };
    let bom = if source.starts_with(BOM) { BOM } else { "" };
    let text = &source[bom.len()..];
    let parse_options = ParseOptions {
        delimiters: options.delimiters.clone(),
    };
    let analysis = analyze(text.as_bytes(), name, &parse_options)?;

    let range = options
        .range
        .map(|[start, end]| start.saturating_sub(bom.len())..end.saturating_sub(bom.len()));
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
    if !keep {
        let indentation =
            indent_edits(text, &analysis.tags, unit.as_str(), options.template_blocks(), range.as_ref()).map_err(|error| {
                TemplateError::at(
                    ErrorCode::FormatHtml,
                    name,
                    Some(&LineIndex::of(text.as_bytes())),
                    [error.index, error.index + 1],
                    error.message,
                )
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
        TemplateError::at(
            ErrorCode::FormatInvariant,
            name,
            Some(&LineIndex::of(text.as_bytes())),
            [first, first],
            message,
        )
    };
    let after = analyze(formatted.as_bytes(), name, &parse_options)
        .map_err(|error| invariant(format!("formatted text does not parse: {error}")))?
        .ast;
    // FMT-1: the fault injection point template.format_invariant imitates a formatted text that parses to another AST,
    // which no input reaches.
    if binding_core::fault::point!(crate::fault::FORMAT_INVARIANT).is_some() || !same_tree(&analysis.ast, &after, !keep) {
        return Err(invariant("formatted text parses to a different AST".to_string()));
    }
    Ok(Formatted {
        text: format!("{bom}{formatted}"),
        changed: true,
    })
}

/// Formats a source given as bytes: UTF-8 bytes format as [`format()`] does, and other bytes keep the source with the
/// parse error that the parser reports for them (LEX-1).
pub fn format_bytes(source: &[u8], options: &FormatOptions) -> Result<Formatted, TemplateError> {
    match std::str::from_utf8(source) {
        Ok(text) => format(text, options),
        Err(_) => {
            let parse_options = ParseOptions {
                delimiters: options.delimiters.clone(),
            };
            analyze(source, options.name(), &parse_options)?;
            Err(TemplateError::without_position(
                ErrorCode::Internal,
                options.name(),
                "internal failure: the parser accepted a source that is not UTF-8 (LEX-1)",
            ))
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
