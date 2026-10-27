//! FMT-16: formatter options, success and error data are public SDK values.
mod common;

use polyspec_template::{FormatError, FormatErrorReason, FormatOptions, IndentUnit, TemplateBlocks, format};

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
            name: item.options.name.unwrap_or_else(|| "template.tpl".into()),
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
                serde_json::json!({"ok":false,"error":{"reason":error.reason,"code":error.code,"line":error.line,"col":error.col}})
            }
        };
        assert_eq!(actual, item.expected, "{}", item.id);
    }
}

#[test]
fn public_formatter_constructs_shared_error_data() {
    let data = fixture();
    assert_eq!(data.errors.len(), 3);
    for value in data.errors {
        let error = FormatError {
            reason: match value.reason.as_str() {
                "parse" => FormatErrorReason::Parse,
                "invariant" => FormatErrorReason::Invariant,
                "html" => FormatErrorReason::Html,
                _ => panic!("invalid error reason"),
            },
            code: value.code.clone(),
            line: value.line,
            col: value.col,
            message: value.message.clone(),
        };
        assert_eq!(
            serde_json::to_value(&error).expect("native error"),
            serde_json::to_value(&value).expect("expected error")
        );
        assert!(error.to_string().contains(&value.message));
    }
}
