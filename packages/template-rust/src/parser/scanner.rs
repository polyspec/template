//! Tag start detection (LEX-5, LEX-6, LEX-9, LEX-17, LEX-18) and delimiter validation (LEX-21).

/// Open and close delimiter characters.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Delimiters {
    /// Open delimiter.
    pub open: u8,
    /// Close delimiter.
    pub close: u8,
}

/// The default delimiters `{` and `}`.
pub const DEFAULT_DELIMITERS: Delimiters = Delimiters { open: b'{', close: b'}' };

/// Sigils in longest-match order.
pub const SIGILS: &[&str] = &["?#", ":?", "=", "@", "?", ":", "/", "+", "#", "*", "%"];

/// A wrapper pair of a wrapped tag.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Wrapper {
    /// Opener text.
    pub opener: &'static str,
    /// Closer text.
    pub closer: &'static str,
}

/// The wrapper pairs of LEX-17.
pub const WRAPPERS: &[Wrapper] = &[
    Wrapper {
        opener: "\"",
        closer: "\"",
    },
    Wrapper { opener: "'", closer: "'" },
    Wrapper {
        opener: "/*",
        closer: "*/",
    },
    Wrapper {
        opener: "<!--",
        closer: "-->",
    },
];

/// Whether a byte is a space or a tab.
pub fn is_horizontal_space(byte: u8) -> bool {
    byte == b' ' || byte == b'\t'
}

/// Index after the horizontal whitespace at `index`.
pub fn skip_horizontal_space(bytes: &[u8], mut index: usize) -> usize {
    while index < bytes.len() && is_horizontal_space(bytes[index]) {
        index += 1;
    }
    index
}

fn is_ident_start(byte: u8) -> bool {
    byte.is_ascii_alphabetic() || byte == b'_'
}

fn is_ident_part(byte: u8) -> bool {
    is_ident_start(byte) || byte.is_ascii_digit()
}

/// Length of the identifier at `index`, or 0.
pub fn ident_length(bytes: &[u8], index: usize) -> usize {
    if index >= bytes.len() || !is_ident_start(bytes[index]) {
        return 0;
    }
    let mut end = index + 1;
    while end < bytes.len() && is_ident_part(bytes[end]) {
        end += 1;
    }
    end - index
}

/// Length of the assignment operator at `index` (`++`, `--`, `+=` `-=` `*=` `/=` `%=`, or `=` not followed by `=` or `>`), or 0.
pub fn assign_operator_length(bytes: &[u8], index: usize) -> usize {
    let rest = &bytes[index.min(bytes.len())..];
    if rest.starts_with(b"++") || rest.starts_with(b"--") {
        return 2;
    }
    if rest.len() >= 2 && matches!(rest[0], b'+' | b'-' | b'*' | b'/' | b'%') && rest[1] == b'=' {
        return 2;
    }
    if rest.first() == Some(&b'=') && !matches!(rest.get(1), Some(b'=') | Some(b'>')) {
        return 1;
    }
    0
}

/// Whether the text at `index` (after the open delimiter) is the assignment form (LEX-6).
pub fn assignment_form(bytes: &[u8], index: usize) -> bool {
    let name = ident_length(bytes, index);
    if name == 0 {
        return false;
    }
    let after = skip_horizontal_space(bytes, index + name);
    assign_operator_length(bytes, after) > 0
}

/// Whether the text at `index` is `IDENT HWS =` (the loop form after `@`).
pub fn loop_form(bytes: &[u8], index: usize) -> bool {
    let start = skip_horizontal_space(bytes, index);
    let name = ident_length(bytes, start);
    if name == 0 {
        return false;
    }
    let after = skip_horizontal_space(bytes, start + name);
    bytes.get(after) == Some(&b'=')
}

/// The sigil that follows the open delimiter at `open`, or None (LEX-5).
pub fn sigil_after(bytes: &[u8], open: usize) -> Option<&'static str> {
    let index = skip_horizontal_space(bytes, open + 1);
    SIGILS
        .iter()
        .copied()
        .find(|sigil| bytes[index.min(bytes.len())..].starts_with(sigil.as_bytes()))
}

/// Whether the open delimiter at `open` starts a tag. The sigil `/` starts a tag only before the close
/// delimiter, and `@` only before `name =`.
pub fn starts_tag(bytes: &[u8], open: usize, delimiters: Delimiters) -> bool {
    let Some(sigil) = sigil_after(bytes, open) else {
        return assignment_form(bytes, open + 1);
    };
    let after = skip_horizontal_space(bytes, open + 1) + sigil.len();
    match sigil {
        "/" => bytes.get(skip_horizontal_space(bytes, after)) == Some(&delimiters.close),
        "@" => loop_form(bytes, after),
        _ => true,
    }
}

/// The wrapper whose opener starts at `index` and is followed by a wrapped tag start (LEX-18), or None.
pub fn wrapped_tag_at(bytes: &[u8], index: usize, delimiters: Delimiters) -> Option<Wrapper> {
    for wrapper in WRAPPERS {
        if !bytes[index..].starts_with(wrapper.opener.as_bytes()) {
            continue;
        }
        let after = skip_horizontal_space(bytes, index + wrapper.opener.len());
        if bytes.get(after) == Some(&delimiters.open)
            && bytes.get(after + 1) == Some(&delimiters.open)
            && starts_tag(bytes, after + 1, delimiters)
        {
            return Some(*wrapper);
        }
        return None;
    }
    None
}

/// Removes single-brace C-style and HTML comment wrappers.
pub fn normalize_legacy_wrappers(bytes: &[u8], delimiters: Delimiters) -> Vec<u8> {
    let legacy = [
        Wrapper {
            opener: "/*",
            closer: "*/",
        },
        Wrapper {
            opener: "<!--",
            closer: "-->",
        },
    ];
    let mut active: Vec<&str> = Vec::new();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if let Some(&closer) = active.last()
            && bytes[index..].starts_with(closer.as_bytes())
        {
            active.pop();
            index += closer.len();
            continue;
        }
        let mut opened = false;
        for wrapper in legacy {
            if !bytes[index..].starts_with(wrapper.opener.as_bytes()) {
                continue;
            }
            let after = skip_horizontal_space(bytes, index + wrapper.opener.len());
            if bytes.get(after) == Some(&delimiters.open) && starts_tag(bytes, after, delimiters) {
                active.push(wrapper.closer);
                index += wrapper.opener.len();
                opened = true;
                break;
            }
        }
        if opened {
            continue;
        }
        output.push(bytes[index]);
        index += 1;
    }
    output
}

/// LEX-21: one ASCII character that is not a letter, a digit, `_`, `\`, a space or a control character.
pub fn is_delimiter_char(byte: u8) -> bool {
    if byte <= 0x20 || byte >= 0x7f {
        return false;
    }
    if byte.is_ascii_alphanumeric() {
        return false;
    }
    byte != b'_' && byte != b'\\'
}

/// Parses a two-character delimiter string.
pub fn parse_delimiters(value: &str) -> Option<Delimiters> {
    let bytes = value.as_bytes();
    if bytes.len() != 2 || !is_delimiter_char(bytes[0]) || !is_delimiter_char(bytes[1]) {
        return None;
    }
    Some(Delimiters {
        open: bytes[0],
        close: bytes[1],
    })
}
