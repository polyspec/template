//! Parser behavior that the fixtures do not cover directly.

use polyspec_template::{ErrorCode, Node, ParseOptions, RequestError, TemplateError, parse};

fn code_of(source: &str, options: &ParseOptions) -> Option<ErrorCode> {
    match parse(source.as_bytes(), "t.tpl", options) {
        Ok(_) => None,
        Err(RequestError::Template(error)) => Some(error.code),
        Err(RequestError::Argument(error)) => panic!("unexpected argument error: {error}"),
    }
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

/// LEX-22: the option selects the delimiters; LEX-23: a directive selects them for the rest of the file and is valid only first.
#[test]
fn delimiters_come_from_the_option_and_the_directive() {
    let options = ParseOptions {
        delimiters: Some(";;".to_string()),
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

/// AST-2, LEX-16: a span counts UTF-8 bytes.
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

/// ERR-1: a parse error is a TemplateError with the fields code, template, line, col, offset, end and message, which its
/// JSON writes in that order.
#[test]
fn a_parse_error_is_the_error_object() {
    let Err(RequestError::Template(error)) = parse("a\n{? x}".as_bytes(), "x.tpl", &ParseOptions::default()) else {
        panic!("the parse did not fail with a template error");
    };
    assert_eq!(
        (error.code, error.template.as_str(), error.line, error.col, error.offset, error.end),
        (ErrorCode::E_PARSE_UNCLOSED_BLOCK, "x.tpl", 2, 1, 2, 3)
    );
    assert!(!error.message.is_empty());
    let unpositioned = TemplateError::without_position(ErrorCode::E_LOAD_NOT_FOUND, "missing.tpl", "missing");
    assert_eq!(
        serde_json::to_value(unpositioned).expect("the error serializes"),
        serde_json::json!({"code": "E_LOAD_NOT_FOUND", "template": "missing.tpl", "line": 0,
            "col": 0, "offset": 0, "end": 0, "message": "missing"})
    );
    let json = serde_json::to_string(&error).expect("the error serializes");
    assert!(
        json.starts_with(r#"{"code":"E_PARSE_UNCLOSED_BLOCK","template":"x.tpl","line":2,"col":1,"offset":2,"end":3,"message":"#),
        "{json}"
    );
}
