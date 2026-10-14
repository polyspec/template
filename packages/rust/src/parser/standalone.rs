//! Standalone line groups (LEX-14, LEX-15).

/// Byte range of a tag including any wrapper, and whether the tag is an echo.
#[derive(Debug, Clone, Copy)]
pub struct TagRange {
    /// Start byte offset.
    pub start: usize,
    /// End byte offset.
    pub end: usize,
    /// Whether the tag is an echo tag.
    pub echo: bool,
}

/// A byte range removed from the output.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Range {
    /// Start byte offset.
    pub start: usize,
    /// End byte offset.
    pub end: usize,
}

/// Returns the byte ranges that standalone line groups remove from the output.
pub fn standalone_ranges(bytes: &[u8], tags: &[TagRange]) -> Vec<Range> {
    let mut line_starts = vec![0usize];
    for (i, byte) in bytes.iter().enumerate() {
        if *byte == b'\n' {
            line_starts.push(i + 1);
        }
    }
    let line_count = line_starts.len();
    let line_of = |index: usize| -> usize {
        let mut low = 0;
        let mut high = line_count - 1;
        while low < high {
            let mid = (low + high).div_ceil(2);
            if line_starts[mid] <= index {
                low = mid;
            } else {
                high = mid - 1;
            }
        }
        low
    };
    let line_end = |line: usize| -> usize {
        if line + 1 < line_count {
            line_starts[line + 1]
        } else {
            bytes.len()
        }
    };

    let mut tags_by_line: Vec<Vec<TagRange>> = vec![Vec::new(); line_count];
    let mut sorted: Vec<TagRange> = tags.to_vec();
    sorted.sort_by_key(|tag| tag.start);
    for tag in sorted {
        tags_by_line[line_of(tag.start)].push(tag);
    }

    let mut ranges = Vec::new();
    let mut line = 0;
    while line < line_count {
        let mut group_end = line;
        let mut has_tag = false;
        let mut has_echo = false;
        let mut group_tags: Vec<TagRange> = Vec::new();
        let mut cursor = line;
        while cursor <= group_end {
            for tag in &tags_by_line[cursor] {
                has_tag = true;
                if tag.echo {
                    has_echo = true;
                }
                group_tags.push(*tag);
                let end_line = line_of(tag.start.max(tag.end.saturating_sub(1)));
                if end_line > group_end {
                    group_end = end_line;
                }
            }
            cursor += 1;
        }
        if has_tag && !has_echo {
            let start = line_starts[line];
            let end = line_end(group_end);
            if only_whitespace_outside(bytes, start, end, &group_tags) {
                ranges.push(Range { start, end });
            }
        }
        line = group_end + 1;
    }
    ranges
}

fn only_whitespace_outside(bytes: &[u8], start: usize, end: usize, tags: &[TagRange]) -> bool {
    let mut index = start;
    for tag in tags {
        if !whitespace_only(bytes, index, tag.start) {
            return false;
        }
        index = tag.end;
    }
    whitespace_only(bytes, index, end)
}

fn whitespace_only(bytes: &[u8], start: usize, end: usize) -> bool {
    bytes[start.min(bytes.len())..end.min(bytes.len())]
        .iter()
        .all(|b| matches!(b, b' ' | b'\t' | b'\r' | b'\n'))
}
