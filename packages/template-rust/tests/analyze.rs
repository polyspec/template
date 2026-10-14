//! Tag analysis (EDT-8): the accepted tags with their kind and body ranges, and the token class of every part of them.

mod common;

use common::repo_root;
use polyspec_template::{ParseOptions, TagKind, analyze};
use std::fs;
use std::path::{Path, PathBuf};

fn tokens(source: &str, delimiters: Option<&str>) -> Vec<String> {
    let options = ParseOptions {
        delimiters: delimiters.map(str::to_string),
    };
    let analysis = analyze(source.as_bytes(), "t.tpl", &options).expect("analyze");
    analysis
        .tokens
        .iter()
        .map(|token| format!("{} {}", token.kind.as_str(), &source[token.start..token.end]))
        .collect()
}

#[test]
fn classifies_every_part_of_every_tag_kind() {
    let cases: &[(&str, &[&str])] = &[
        ("{* note *}", &["comment {* note *}"]),
        (
            "{= (user.name ?? null) | upper(1, \"x\")}",
            &[
                "delimiter {",
                "keyword =",
                "operator (",
                "variable user",
                "property .name",
                "operator ??",
                "keyword null",
                "operator )",
                "operator |",
                "function upper",
                "operator (",
                "number 1",
                "operator ,",
                "string \"x\"",
                "operator )",
                "delimiter }",
            ],
        ),
        (
            "{@ item = items}{/}",
            &[
                "delimiter {",
                "keyword @",
                "variable item",
                "operator =",
                "variable items",
                "delimiter }",
                "delimiter {",
                "keyword /",
                "delimiter }",
            ],
        ),
        (
            "{: count += 1}",
            &[
                "delimiter {",
                "keyword :",
                "variable count",
                "operator +=",
                "number 1",
                "delimiter }",
            ],
        ),
        (
            "{: count++}",
            &["delimiter {", "keyword :", "variable count", "operator ++", "delimiter }"],
        ),
        (
            "{? a in b}{:? !c}{:}{/}",
            &[
                "delimiter {",
                "keyword ?",
                "variable a",
                "keyword in",
                "variable b",
                "delimiter }",
                "delimiter {",
                "keyword :?",
                "operator !",
                "variable c",
                "delimiter }",
                "delimiter {",
                "keyword :",
                "delimiter }",
                "delimiter {",
                "keyword /",
                "delimiter }",
            ],
        ),
        (
            "{?# side}{/}",
            &[
                "delimiter {",
                "keyword ?#",
                "variable side",
                "delimiter }",
                "delimiter {",
                "keyword /",
                "delimiter }",
            ],
        ),
        (
            "{+ parts/head.tpl}{+ \"quoted.tpl\"}",
            &[
                "delimiter {",
                "keyword +",
                "path parts/head.tpl",
                "delimiter }",
                "delimiter {",
                "keyword +",
                "string \"quoted.tpl\"",
                "delimiter }",
            ],
        ),
        (
            "{# card cards/card.tpl title:page.title x}",
            &[
                "delimiter {",
                "keyword #",
                "path card",
                "path cards/card.tpl",
                "path title:page.title",
                "path x",
                "delimiter }",
            ],
        ),
        (
            "{% delimiter []}[= a]",
            &[
                "delimiter {",
                "keyword %",
                "keyword delimiter",
                "string []",
                "delimiter }",
                "delimiter [",
                "keyword =",
                "variable a",
                "delimiter ]",
            ],
        ),
        (
            "<a href=\"{{= url }}\">",
            &["delimiter \"{{", "keyword =", "variable url", "delimiter }}\""],
        ),
        (
            "{= 1.5 + a.b() + f(x)}",
            &[
                "delimiter {",
                "keyword =",
                "number 1.5",
                "operator +",
                "variable a",
                "function .b",
                "operator (",
                "operator )",
                "operator +",
                "function f",
                "operator (",
                "variable x",
                "operator )",
                "delimiter }",
            ],
        ),
    ];
    for (source, expected) in cases {
        assert_eq!(tokens(source, None), *expected, "{source}");
    }
}

#[test]
fn uses_the_delimiter_option() {
    assert_eq!(
        tokens("[= a]", Some("[]")),
        ["delimiter [", "keyword =", "variable a", "delimiter ]"]
    );
}

#[test]
fn gives_each_tag_its_kind_and_the_range_of_its_body() {
    let source = "<a href=\"{{= url }}\">{* c *}{: x = 1}{? a}{:? b}{:}{/}";
    let analysis = analyze(source.as_bytes(), "t.tpl", &ParseOptions::default()).expect("analyze");
    let tags: Vec<(TagKind, &str)> = analysis
        .tags
        .iter()
        .map(|tag| (tag.kind, &source[tag.body_start..tag.body_end]))
        .collect();
    assert_eq!(
        tags,
        [
            (TagKind::Echo, "= url "),
            (TagKind::Comment, "* c *"),
            (TagKind::Assignment, ": x = 1"),
            (TagKind::If, "? a"),
            (TagKind::Elseif, ":? b"),
            (TagKind::Else, ":"),
            (TagKind::Close, "/"),
        ]
    );
    assert_eq!(analysis.tags[0].start, 8);
    assert_eq!(analysis.tags[0].end, 20);
}

#[test]
fn offsets_are_bytes_after_the_bom() {
    let source = "\u{feff}é{= a}";
    let analysis = analyze(source.as_bytes(), "t.tpl", &ParseOptions::default()).expect("analyze");
    let spans: Vec<(usize, usize)> = analysis.tokens.iter().map(|token| (token.start, token.end)).collect();
    assert_eq!(spans, [(2, 3), (3, 4), (5, 6), (6, 7)]);
}

#[test]
fn a_source_that_does_not_parse_is_an_error() {
    let error = analyze(b"{= a +}", "t.tpl", &ParseOptions::default());
    assert!(error.is_err());
}

fn case_dirs(dir: &Path, found: &mut Vec<PathBuf>) {
    for entry in fs::read_dir(dir).expect("cases directory").flatten() {
        let path = entry.path();
        if path.is_dir() {
            case_dirs(&path, found);
        } else if entry.file_name() == "input.tpl" {
            found.push(dir.to_path_buf());
        }
    }
}

/// Every case under tests/cases with options.json delimiters.
fn cases() -> Vec<PathBuf> {
    let mut found = Vec::new();
    case_dirs(&repo_root().join("tests").join("cases"), &mut found);
    found.sort();
    found
}

fn delimiters(dir: &Path) -> Option<String> {
    let text = fs::read_to_string(dir.join("options.json")).ok()?;
    let options: serde_json::Value = serde_json::from_str(&text).expect("options.json");
    options.get("delimiters").and_then(|value| value.as_str()).map(str::to_string)
}

/// CNF-2: the tokens of every case that parses equal its expected.tokens.json, `[start, end, type]` with byte offsets.
#[test]
fn tokens_of_every_case_equal_the_expected_tokens() {
    let mut compared = 0;
    for dir in cases() {
        let source = fs::read(dir.join("input.tpl")).expect("input.tpl");
        let options = ParseOptions {
            delimiters: delimiters(&dir),
        };
        let expected_path = dir.join("expected.tokens.json");
        let Ok(analysis) = analyze(&source, "input.tpl", &options) else {
            assert!(!expected_path.exists(), "{}: does not parse but has expected tokens", dir.display());
            continue;
        };
        let actual: Vec<serde_json::Value> = analysis
            .tokens
            .iter()
            .map(|token| serde_json::json!([token.start, token.end, token.kind.as_str()]))
            .collect();
        let expected: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&expected_path).unwrap_or_else(|_| panic!("{}: expected.tokens.json", dir.display())))
                .expect("expected.tokens.json");
        assert_eq!(serde_json::Value::Array(actual), expected, "{}", dir.display());
        compared += 1;
    }
    assert!(compared > 0);
}
