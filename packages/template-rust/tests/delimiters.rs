//! An invalid delimiter option is an argument error of the language, not an ERR-1 error and not a panic (ERR-13).

use polyspec_template::{AstProgram, EngineOptions, ParseOptions, RequestError, parse};

#[test]
fn an_engine_with_an_invalid_delimiter_option_returns_an_argument_error() {
    let result = std::panic::catch_unwind(|| {
        AstProgram::new(EngineOptions {
            delimiters: Some("x".to_string()),
            ..Default::default()
        })
        .map(|_| ())
    });
    let error = result.expect("no panic").expect_err("an argument error");
    assert_eq!(error.message, "\"x\" is not a delimiter pair");
}

#[test]
fn a_parse_with_an_invalid_delimiter_option_returns_an_argument_error() {
    let options = ParseOptions {
        delimiters: Some("x".to_string()),
    };
    match parse(b"text", "t.tpl", &options) {
        Err(RequestError::Argument(error)) => assert_eq!(error.message, "\"x\" is not a delimiter pair"),
        other => panic!("expected an argument error, got {other:?}"),
    }
}
