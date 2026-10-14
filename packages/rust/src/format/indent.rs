//! Indentation: the spaces and tabs at the start of each line, set by the nesting of HTML elements and template blocks.

use crate::format::{Edit, TemplateBlocks};
use crate::parser::{SyntaxTag, TagKind};
use std::ops::Range;

/// Why the HTML structure cannot be indented. `index` is the byte offset of the tag where the structure fails.
#[derive(Debug, Clone)]
pub struct IndentError {
    /// Byte offset of the failing tag.
    pub index: usize,
    /// Free text.
    pub message: String,
}

const VOID: &[&str] = &[
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
];
// Elements whose content is not HTML markup: the indentation does not read tags inside them.
const RAW: &[&str] = &["script", "style", "textarea"];
// Elements whose lines keep their indentation.
const KEPT: &[&str] = &["pre", "script", "style", "textarea"];

// A change of depth at a byte offset; -1 is before the first line. `dedent` marks a tag that takes one level from its
// own line.
struct Step {
    index: isize,
    delta: isize,
    dedent: bool,
}

#[derive(Clone)]
struct Element {
    name: String,
    start: usize,
}

// A template block: the open HTML elements at its start, at the end of its first branch, and whether it has an else
// branch.
struct Block {
    start: Vec<Element>,
    branch_end: Option<Vec<String>>,
    has_else: bool,
}

struct Scan {
    steps: Vec<Step>,
    // Ranges in which a line start keeps its indentation.
    kept: Vec<Range<usize>>,
    // Ranges of HTML tags spanning lines, whose inner lines get one more level.
    inside: Vec<Range<usize>>,
}

/// Returns the edits that set the indentation of every line that starts inside `range`, or the reason why the HTML
/// structure cannot be indented.
pub fn indent_edits(
    text: &str,
    tags: &[SyntaxTag],
    unit: &str,
    template_blocks: TemplateBlocks,
    range: Option<&Range<usize>>,
) -> Result<Vec<Edit>, IndentError> {
    let scan = Scanner::new(text, tags, template_blocks).scan()?;
    let bytes = text.as_bytes();
    let dedents: Vec<isize> = scan.steps.iter().filter(|step| step.dedent).map(|step| step.index).collect();
    let mut edits = Vec::new();
    let mut step = 0;
    let mut depth: isize = 0;
    let mut line_start = 0;
    loop {
        while step < scan.steps.len() && scan.steps[step].index < line_start as isize {
            depth += scan.steps[step].delta;
            step += 1;
        }
        let mut first = line_start;
        while first < bytes.len() && matches!(bytes[first], b' ' | b'\t') {
            first += 1;
        }
        if !within(&scan.kept, line_start) {
            let blank = first == bytes.len() || bytes[first] == b'\n' || bytes[first] == b'\r';
            let mut level = depth + isize::from(within(&scan.inside, line_start));
            if dedents.contains(&(first as isize)) {
                level -= 1;
            }
            let indentation = if blank { String::new() } else { unit.repeat(level.max(0) as usize) };
            let selected = range.is_none_or(|range| line_start >= range.start && line_start < range.end);
            if selected && text[line_start..first] != indentation {
                edits.push(Edit {
                    start: line_start,
                    end: first,
                    text: indentation,
                });
            }
        }
        match text[line_start..].find('\n') {
            Some(offset) => line_start += offset + 1,
            None => break,
        }
    }
    Ok(edits)
}

fn within(ranges: &[Range<usize>], index: usize) -> bool {
    ranges.iter().any(|range| range.start < index && index < range.end)
}

fn names(elements: &[Element]) -> Vec<String> {
    elements.iter().map(|element| element.name.clone()).collect()
}

struct Scanner<'a> {
    text: &'a str,
    bytes: &'a [u8],
    tags: &'a [SyntaxTag],
    counted: bool,
    steps: Vec<Step>,
    kept: Vec<Range<usize>>,
    inside: Vec<Range<usize>>,
    elements: Vec<Element>,
    blocks: Vec<Block>,
    next: usize,
}

impl<'a> Scanner<'a> {
    fn new(text: &'a str, tags: &'a [SyntaxTag], template_blocks: TemplateBlocks) -> Scanner<'a> {
        Scanner {
            text,
            bytes: text.as_bytes(),
            tags,
            counted: template_blocks == TemplateBlocks::Indent,
            steps: Vec::new(),
            kept: Vec::new(),
            inside: Vec::new(),
            elements: Vec::new(),
            blocks: Vec::new(),
            next: 0,
        }
    }

    fn step(&mut self, index: isize, delta: isize, dedent: bool) {
        self.steps.push(Step { index, delta, dedent });
    }

    // The offset from which a change of depth applies to the line of a tag: before the line when the tag starts it.
    fn before_line(&self, index: usize) -> isize {
        let line_start = self.text[..index].rfind('\n').map_or(0, |at| at + 1);
        if self.bytes[line_start..index].iter().all(|byte| matches!(byte, b' ' | b'\t')) {
            line_start as isize - 1
        } else {
            index as isize
        }
    }

    // Template tags are opaque to the HTML scan; block tags open, branch and close template blocks. Every branch of a
    // block must end with the same open HTML elements, and a block without an else branch with those of its start.
    fn template_tag(&mut self, tag: SyntaxTag) -> Result<(), IndentError> {
        self.kept.push(tag.start..tag.end);
        if matches!(tag.kind, TagKind::If | TagKind::For | TagKind::Ifblock) {
            self.blocks.push(Block {
                start: self.elements.clone(),
                branch_end: None,
                has_else: false,
            });
            if self.counted {
                self.step(tag.end as isize, 1, false);
            }
            return Ok(());
        }
        if !matches!(tag.kind, TagKind::Elseif | TagKind::Else | TagKind::Close) {
            return Ok(());
        }
        let end = names(&self.elements);
        let Some(block) = self.blocks.last() else { return Ok(()) };
        if block.branch_end.as_ref().is_some_and(|branch_end| *branch_end != end) {
            return Err(IndentError {
                index: tag.start,
                message: "the HTML elements open at the end of this branch differ from those of the first branch".to_string(),
            });
        }
        if tag.kind == TagKind::Close {
            if !block.has_else && names(&block.start) != end {
                return Err(IndentError {
                    index: tag.start,
                    message: "a template block without an else branch must end with the HTML elements open at its start".to_string(),
                });
            }
            let block = self.blocks.pop().expect("block");
            // The close tag aligns with the start of its block; the elements that every branch opened apply after it.
            let opened = end.len() as isize - block.start.len() as isize;
            if opened != 0 {
                let before = self.before_line(tag.start);
                self.step(before, -opened, false);
                self.step(tag.end as isize, opened, false);
            }
            if self.counted {
                self.step(tag.start as isize, -1, true);
            }
            return Ok(());
        }
        let start = {
            let block = self.blocks.last_mut().expect("block");
            block.branch_end = Some(end);
            if tag.kind == TagKind::Else {
                block.has_else = true;
            }
            block.start.clone()
        };
        // The next branch starts from the elements open at the start of the block.
        let before = self.before_line(tag.start);
        self.step(before, start.len() as isize - self.elements.len() as isize, false);
        self.elements = start;
        if self.counted {
            self.step(tag.start as isize, 0, true);
        }
        Ok(())
    }

    // Moves past one HTML tag from `<` and returns its end, reading template tags inside it.
    fn html_tag_end(&mut self, start: usize) -> Result<usize, IndentError> {
        let mut quote: Option<u8> = None;
        let mut quote_start = 0;
        let mut index = start + 1;
        while index < self.bytes.len() {
            if let Some(&tag) = self.tags.get(self.next)
                && tag.start == index
            {
                self.template_tag(tag)?;
                self.next += 1;
                index = tag.end;
                continue;
            }
            let character = self.bytes[index];
            match quote {
                Some(open) => {
                    if character == open {
                        self.kept.push(quote_start..index);
                        quote = None;
                    }
                }
                None if character == b'"' || character == b'\'' => {
                    quote = Some(character);
                    quote_start = index;
                }
                None if character == b'>' => return Ok(index + 1),
                None => {}
            }
            index += 1;
        }
        Err(IndentError {
            index: start,
            message: "the HTML tag is not closed with \">\"".to_string(),
        })
    }

    // Template tags inside an HTML comment are still template tags; the comment keeps its lines.
    fn skip_template_tags(&mut self, end: usize) -> Result<usize, IndentError> {
        while self.next < self.tags.len() && self.tags[self.next].start < end {
            let tag = self.tags[self.next];
            self.next += 1;
            self.template_tag(tag)?;
        }
        Ok(end)
    }

    // The element name after `<` or `</` at `position`, read as the reference reads it from the next 64 characters.
    fn element_at(&self, position: usize) -> Option<(bool, String)> {
        let window = &self.bytes[position..(position + 64).min(self.bytes.len())];
        let closing = window.get(1) == Some(&b'/');
        let name_start = if closing { 2 } else { 1 };
        if !window.get(name_start).is_some_and(u8::is_ascii_alphabetic) {
            return None;
        }
        let mut name_end = name_start + 1;
        while name_end < window.len() && (window[name_end].is_ascii_alphanumeric() || window[name_end] == b'-') {
            name_end += 1;
        }
        Some((closing, String::from_utf8_lossy(&window[name_start..name_end]).to_ascii_lowercase()))
    }

    fn starts_with_end_tag(&self, index: usize, name: &str) -> bool {
        let candidate = &self.bytes[index..(index + name.len() + 2).min(self.bytes.len())];
        candidate.len() == name.len() + 2 && candidate[..2] == *b"</" && candidate[2..].eq_ignore_ascii_case(name.as_bytes())
    }

    fn scan(mut self) -> Result<Scan, IndentError> {
        let mut raw: Option<String> = None;
        let mut kept_start: Option<usize> = None;
        let mut position = 0;
        while position < self.bytes.len() {
            if let Some(&tag) = self.tags.get(self.next)
                && tag.start == position
            {
                self.template_tag(tag)?;
                self.next += 1;
                position = tag.end;
                continue;
            }
            if self.bytes[position] != b'<' {
                position += 1;
                continue;
            }
            if let Some(name) = &raw
                && !self.starts_with_end_tag(position, name)
            {
                position += 1;
                continue;
            }
            if self.bytes[position..].starts_with(b"<!--") {
                let end = self.text[position + 4..]
                    .find("-->")
                    .map_or(self.bytes.len(), |at| position + 4 + at + 3);
                self.kept.push(position..end);
                position = self.skip_template_tags(end)?;
                continue;
            }
            if matches!(self.bytes.get(position + 1), Some(b'!') | Some(b'?')) {
                position = self.html_tag_end(position)?;
                continue;
            }
            let Some((closing, name)) = self.element_at(position) else {
                position += 1;
                continue;
            };
            let end = self.html_tag_end(position)?;
            if self.bytes[position..end].contains(&b'\n') {
                self.inside.push(position..end);
            }
            if closing {
                if VOID.contains(&name.as_str()) {
                    position = end;
                    continue;
                }
                match self.elements.last() {
                    None => {
                        return Err(IndentError {
                            index: position,
                            message: format!("the end tag </{name}> has no open element"),
                        });
                    }
                    Some(open) if open.name != name => {
                        return Err(IndentError {
                            index: position,
                            message: format!("the end tag </{name}> does not match the open element <{}>", open.name),
                        });
                    }
                    Some(_) => {}
                }
                self.step(position as isize, -1, true);
                self.elements.pop();
                if KEPT.contains(&name.as_str())
                    && !self.elements.iter().any(|element| KEPT.contains(&element.name.as_str()))
                    && let Some(start) = kept_start.take()
                {
                    let line_end = self.text[position..].find('\n').map_or(self.bytes.len(), |at| position + at);
                    self.kept.push(start..line_end);
                }
                raw = None;
                position = end;
                continue;
            }
            let self_closing = self.bytes[end - 2] == b'/';
            if !VOID.contains(&name.as_str()) && !self_closing {
                self.elements.push(Element {
                    name: name.clone(),
                    start: position,
                });
                self.step(end as isize, 1, false);
                if KEPT.contains(&name.as_str()) && kept_start.is_none() {
                    kept_start = Some(end);
                }
                if RAW.contains(&name.as_str()) {
                    raw = Some(name);
                }
            }
            position = end;
        }
        if let Some(open) = self.elements.last() {
            return Err(IndentError {
                index: open.start,
                message: format!("the element <{}> is not closed", open.name),
            });
        }
        self.steps.sort_by_key(|step| step.index);
        Ok(Scan {
            steps: self.steps,
            kept: self.kept,
            inside: self.inside,
        })
    }
}
