//! FMT-16: formatter options, success and error data are public SDK values.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    reason = "a test states its expectation with unwrap and expect; a failure there is the failure of the test"
)]
mod common;

use polyspec_template::{ErrorCode, FormatOptions, IndentUnit, TemplateBlocks, TemplateError, format};

fn default_indent() -> serde_json::Value {
    serde_json::json!("  ")
}
#[derive(serde::Deserialize)]
struct Range {
    start: usize,
    end: usize,
}
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct Options {
    name: Option<String>,
    delimiters: Option<String>,
    range: Option<Range>,
    template_blocks: Option<String>,
    #[serde(default = "default_indent")]
    indent: serde_json::Value,
}
#[derive(serde::Deserialize)]
struct Case {
    id: String,
    source: String,
    options: Options,
    expected: serde_json::Value,
}
#[derive(serde::Deserialize, serde::Serialize)]
struct ErrorData {
    reason: String,
    code: Option<String>,
    line: usize,
    col: usize,
    message: String,
}
#[derive(serde::Deserialize)]
struct Fixture {
    cases: Vec<Case>,
    errors: Vec<ErrorData>,
}
fn fixture() -> Fixture {
    let text = std::fs::read_to_string(common::repo_root().join("tests/fixtures/formatter-sdk.json")).expect("formatter fixture");
    serde_json::from_str(&text).expect("formatter JSON")
}

#[test]
fn public_formatter_preserves_shared_results() {
    let data = fixture();
    assert!(!data.cases.is_empty());
    for item in data.cases {
        let options = FormatOptions {
            // The fixture names a template only where the case depends on the name.
            name: item.options.name,
            delimiters: item.options.delimiters,
            range: item.options.range.map(|range| range.start..range.end),
            indent: match item.options.indent {
                serde_json::Value::Null => None,
                serde_json::Value::String(value) => Some(IndentUnit::new(&value).expect("valid indent")),
                _ => panic!("invalid fixture indent"),
            },
            template_blocks: match item.options.template_blocks.as_deref() {
                None | Some("indent") => TemplateBlocks::Indent,
                Some("flat") => TemplateBlocks::Flat,
                _ => panic!("invalid fixture mode"),
            },
        };
        let actual = match format(&item.source, &options) {
            Ok(result) => serde_json::json!({"ok":true,"text":result.text,"changed":result.changed}),
            Err(error) => {
                assert!(!error.message.is_empty());
                let (reason, code) = common::format_record(&error);
                serde_json::json!({"ok":false,"error":{"reason":reason,"code":code,"line":error.line,"col":error.col}})
            }
        };
        assert_eq!(actual, item.expected, "{}", item.id);
    }
}

/// ERR-15, FMT-14: the shared error records are format errors of the kind that their reason names, with their position.
#[test]
fn public_formatter_constructs_shared_error_data() {
    let data = fixture();
    assert_eq!(data.errors.len(), 3);
    for value in data.errors {
        let code = match (value.reason.as_str(), value.code.as_deref()) {
            ("invariant", None) => ErrorCode::FormatInvariant,
            ("html", None) => ErrorCode::FormatHtml,
            ("parse", Some("parse_unclosed_block")) => ErrorCode::ParseUnclosedBlock,
            other => panic!("invalid error record {other:?}"),
        };
        let mut error = TemplateError::without_position(code, "template.tpl", value.message.clone());
        error.line = value.line;
        error.col = value.col;
        let (reason, record_code) = common::format_record(&error);
        assert_eq!((reason, record_code.as_deref()), (value.reason.as_str(), value.code.as_deref()));
        assert!(error.to_string().contains(&value.message));
    }
}
