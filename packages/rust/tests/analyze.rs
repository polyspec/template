// EDT-9: the tags of the analysis are the accepted tags that the editors paint.
//! Tag analysis (EDT-8): the accepted tags with their kind and body ranges, and the token class of every part of them.

use polyspec_template::{ParseOptions, TagKind, analyze};

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

/// FMT-1, GRM-2: every part of every form of a tag body is classified.
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
