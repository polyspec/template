//! LEX-24: the public source context preserves UTF-8 and native byte indexes.
mod common;

use polyspec_template::{ErrorCode, LineIndex, Source};

#[derive(serde::Deserialize)]
struct Valid {
    id: String,
    name: String,
    input: String,
    text: String,
    lines: Vec<usize>,
    offsets: Offsets,
    probe: Probe,
}
#[derive(serde::Deserialize)]
struct Offsets {
    byte: Vec<usize>,
}
#[derive(serde::Deserialize)]
struct Probe {
    offset: usize,
    end: usize,
    line: usize,
    col: usize,
}
#[derive(serde::Deserialize)]
struct Invalid {
    id: String,
    hex: String,
    offset: usize,
    line: usize,
    col: usize,
}
#[derive(serde::Deserialize)]
struct Fixture {
    valid: Vec<Valid>,
    invalid: Vec<Invalid>,
}
fn fixture() -> Fixture {
    let text = std::fs::read_to_string(common::repo_root().join("tests/fixtures/source-context.json")).expect("source fixture");
    serde_json::from_str(&text).expect("source fixture JSON")
}
fn bytes(hex: &str) -> Vec<u8> {
    hex.as_bytes()
        .as_chunks::<2>()
        .0
        .iter()
        .map(|pair| u8::from_str_radix(std::str::from_utf8(pair).expect("hex UTF-8"), 16).expect("hex byte"))
        .collect()
}

#[test]
fn public_source_contexts_preserve_the_shared_fixtures() {
    let fixtures = fixture();
    assert!(!fixtures.valid.is_empty());
    for item in fixtures.valid {
        let mut input = item.input.as_bytes().to_vec();
        let from_bytes = Source::from_bytes(&item.name, &input).expect(&item.id);
        let from_text = Source::from_text(&item.name, &item.input).expect(&item.id);
        input.fill(0);
        for source in [from_bytes, from_text] {
            assert_eq!(
                (source.name(), source.text(), source.bytes()),
                (item.name.as_str(), item.text.as_str(), item.text.as_bytes()),
                "{}",
                item.id
            );
            assert_eq!(source.lines(), &LineIndex::from_starts(item.lines.clone()));
            assert_eq!(source.length(), item.offsets.byte.len() - 1);
            for (start, offset) in item.offsets.byte.iter().enumerate() {
                assert_eq!(source.byte_at(start).expect("native index"), *offset);
                for end in start..item.offsets.byte.len() {
                    assert_eq!(source.span(start, end).expect("native range"), [*offset, item.offsets.byte[end]]);
                }
            }
            assert_eq!(LineIndex::of(source.bytes()), *source.lines());
            assert_eq!(source.lines().position(item.probe.offset), (item.probe.line, item.probe.col));
            let error = source.error(ErrorCode::E_PARSE_UNEXPECTED_TOKEN, item.probe.offset, item.probe.end, "message");
            assert_eq!(
                (
                    error.code,
                    error.template.as_str(),
                    error.line,
                    error.col,
                    error.offset,
                    error.end,
                    error.message.as_str()
                ),
                (
                    ErrorCode::E_PARSE_UNEXPECTED_TOKEN,
                    item.name.as_str(),
                    item.probe.line,
                    item.probe.col,
                    item.probe.offset,
                    item.probe.end,
                    "message"
                )
            );
            assert!(source.byte_at(source.length() + 1).is_err());
            assert!(source.span(1, 0).is_err());
        }
    }
}

#[test]
fn public_source_rejects_shared_invalid_utf8() {
    let fixtures = fixture();
    assert!(!fixtures.invalid.is_empty());
    for item in fixtures.invalid {
        let error = Source::from_bytes("invalid.tpl", &bytes(&item.hex)).expect_err(&item.id);
        assert_eq!(
            (error.code, error.offset, error.end, error.line, error.col),
            (ErrorCode::E_LEX_INVALID_UTF8, item.offset, item.offset + 1, item.line, item.col),
            "{}",
            item.id
        );
    }
}
