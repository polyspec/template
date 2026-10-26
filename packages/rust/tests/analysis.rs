//! EDT-10: public analysis preserves AST, tags and classified byte ranges.
mod common;

use polyspec_template::{ErrorCode, ParseOptions, RequestError, TemplateAnalysis, analyze, parse};

#[derive(serde::Deserialize)]
struct Case {
    id: String,
    name: String,
    source: String,
    expected: serde_json::Value,
}
#[derive(serde::Deserialize)]
struct Fixture {
    cases: Vec<Case>,
}

#[test]
fn public_analysis_preserves_shared_contexts() {
    let text = std::fs::read_to_string(common::repo_root().join("tests/fixtures/analysis-context.json")).expect("analysis fixture");
    let fixture: Fixture = serde_json::from_str(&text).expect("analysis fixture JSON");
    assert!(!fixture.cases.is_empty());
    for item in fixture.cases {
        let result: TemplateAnalysis = analyze(item.source.as_bytes(), &item.name, &ParseOptions::default()).expect(&item.id);
        let tags: Vec<_> = result
            .tags
            .iter()
            .map(|tag| {
                serde_json::json!({
                    "kind":tag.kind.as_str(), "echo":tag.echo, "start":tag.start, "end":tag.end,
                    "bodyStart":tag.body_start, "bodyEnd":tag.body_end,
                })
            })
            .collect();
        let tokens: Vec<_> = result
            .tokens
            .iter()
            .map(|token| {
                serde_json::json!({
                    "kind":token.kind.as_str(), "start":token.start, "end":token.end,
                })
            })
            .collect();
        let actual = serde_json::json!({"ast": result.ast, "tags":tags,"tokens":tokens});
        assert_eq!(actual, item.expected, "{}", item.id);
        assert_eq!(
            result.ast,
            parse(item.source.as_bytes(), &item.name, &ParseOptions::default()).expect("parse")
        );
    }
}

#[test]
fn public_analysis_rejects_incomplete_source() {
    let error = analyze(b"{? x}", "invalid.tpl", &ParseOptions::default()).expect_err("incomplete source");
    assert!(matches!(error, RequestError::Template(error) if error.code == ErrorCode::E_PARSE_UNCLOSED_BLOCK));
}
