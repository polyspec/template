//! Parser behavior that the fixtures do not cover directly.

use polyspec_template::{ErrorCode, Node, ParseOptions, parse};

fn code_of(source: &str, options: &ParseOptions) -> Option<ErrorCode> {
    parse(source.as_bytes(), "t.tpl", options).err().map(|error| error.code)
}

fn kinds(source: &str) -> Vec<&'static str> {
    parse(source.as_bytes(), "t.tpl", &ParseOptions::default())
        .expect("parse")
        .body
        .iter()
        .map(|node| match node {
            Node::Text { .. } => "Text",
            Node::Echo { .. } => "Echo",
            Node::If { .. } => "If",
            Node::For { .. } => "For",
            Node::Set { .. } => "Set",
            Node::Include { .. } => "Include",
            Node::Block { .. } => "Block",
            Node::IfBlock { .. } => "IfBlock",
        })
        .collect()
}

#[test]
fn javascript_and_css_braces_stay_text() {
    assert_eq!(kinds("{/* c */}{/re/.test(s)}.a { @media x { } }{ x = 1 }"), vec!["Text"]);
    assert_eq!(kinds("{= a}{@ i = xs}{/}{? a}{:}{/}"), vec!["Echo", "For", "If"]);
}

#[test]
fn delimiters_come_from_the_option_and_the_directive() {
    let options = ParseOptions {
        delimiters: Some(";;".to_string()),
        legacy_wrappers: false,
    };
    assert_eq!(parse(b";= a;", "t.tpl", &options).expect("parse").body.len(), 1);
    assert_eq!(kinds("{% delimiter [] }\n[= a[0]]\n"), vec!["Echo", "Text"]);
    assert_eq!(
        code_of("{= a}{% delimiter ;;}", &ParseOptions::default()),
        Some(ErrorCode::E_PARSE_INVALID_DIRECTIVE)
    );
    assert_eq!(
        code_of("{% delimiter ab}", &ParseOptions::default()),
        Some(ErrorCode::E_PARSE_INVALID_DIRECTIVE)
    );
}

#[test]
fn block_structure_errors() {
    let options = ParseOptions::default();
    assert_eq!(code_of("{/}", &options), Some(ErrorCode::E_PARSE_UNEXPECTED_CLOSE));
    assert_eq!(code_of("{? a}", &options), Some(ErrorCode::E_PARSE_UNCLOSED_BLOCK));
    assert_eq!(code_of("{:}", &options), Some(ErrorCode::E_PARSE_ELSE_OUTSIDE_BLOCK));
    assert_eq!(code_of("{? a}{:}{:}{/}", &options), Some(ErrorCode::E_PARSE_DUPLICATE_ELSE));
    assert_eq!(code_of("{? a}{:}{:? b}{/}", &options), Some(ErrorCode::E_PARSE_ELSEIF_AFTER_ELSE));
    assert_eq!(code_of("{?# a}{:? b}{/}", &options), Some(ErrorCode::E_PARSE_ELSEIF_NOT_IN_IF));
}

#[test]
fn spans_count_bytes() {
    let ast = parse("é{= a}".as_bytes(), "t.tpl", &ParseOptions::default()).expect("parse");
    assert_eq!(ast.body[1].span(), [2, 7]);
}

#[test]
fn number_literals_serialize_as_json_numbers() {
    let ast = parse(b"{= 1e3}{= 1.50}", "t.tpl", &ParseOptions::default()).expect("parse");
    let text = serde_json::to_string(&ast).expect("json");
    assert!(text.contains("\"value\":1000,"), "{text}");
    assert!(text.contains("\"value\":1.5,"), "{text}");
    assert!(!text.contains("1000.0"), "{text}");
}
