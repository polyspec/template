//! EDT-11: prefix analysis preserves accepted ranges and the first parser error.
mod common;

use polyspec_template::{ErrorCode, ParseOptions, RequestError, analyze_prefix};

#[derive(Debug, PartialEq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct Tag {
    start: usize,
    end: usize,
    echo: bool,
    kind: String,
    body_start: usize,
    body_end: usize,
}
#[derive(Debug, PartialEq, serde::Deserialize)]
struct Token {
    start: usize,
    end: usize,
    kind: String,
}
#[derive(serde::Deserialize)]
struct Expected {
    tags: Vec<Tag>,
    tokens: Vec<Token>,
    error: serde_json::Value,
}
#[derive(serde::Deserialize)]
struct Case {
    id: String,
    name: String,
    source: String,
    delimiters: Option<String>,
    expected: Expected,
}
#[derive(serde::Deserialize)]
struct Fixture {
    cases: Vec<Case>,
}

#[test]
fn public_prefix_analysis_preserves_shared_contexts() {
    let text = std::fs::read_to_string(common::repo_root().join("tests/fixtures/prefix-analysis.json")).expect("prefix fixture");
    let fixture: Fixture = serde_json::from_str(&text).expect("prefix JSON");
    assert!(!fixture.cases.is_empty());
    for item in fixture.cases {
        let result = analyze_prefix(
            item.source.as_bytes(),
            &item.name,
            &ParseOptions {
                delimiters: item.delimiters,
            },
        )
        .expect(&item.id);
        let tags: Vec<_> = result
            .tags
            .iter()
            .map(|t| Tag {
                start: t.start,
                end: t.end,
                echo: t.echo,
                kind: t.kind.as_str().into(),
                body_start: t.body_start,
                body_end: t.body_end,
            })
            .collect();
        let tokens: Vec<_> = result
            .tokens
            .iter()
            .map(|t| Token {
                start: t.start,
                end: t.end,
                kind: t.kind.as_str().into(),
            })
            .collect();
        assert_eq!(tags, item.expected.tags, "{}", item.id);
        assert_eq!(tokens, item.expected.tokens, "{}", item.id);
        let error=result.error.map_or(serde_json::Value::Null,|error|{
            assert!(!error.message.is_empty());
            serde_json::json!({"code":error.code,"template":error.template,"line":error.line,"col":error.col,"offset":error.offset,"end":error.end})
        });
        assert_eq!(error, item.expected.error, "{}", item.id);
    }
}

#[test]
fn public_prefix_analysis_rejects_invalid_inputs() {
    let error = analyze_prefix(&[255], "invalid.tpl", &ParseOptions::default()).expect_err("invalid UTF-8");
    assert!(matches!(error,RequestError::Template(error) if error.code==ErrorCode::E_LEX_INVALID_UTF8));
    assert!(matches!(
        analyze_prefix(
            b"x",
            "invalid.tpl",
            &ParseOptions {
                delimiters: Some("[".into())
            }
        ),
        Err(RequestError::Argument(_))
    ));
}
