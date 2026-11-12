//! An invalid delimiter option is an argument error of the language, not an ERR-1 error and not a panic (ERR-13).

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    reason = "a test states its expectation with unwrap and expect; a failure there is the failure of the test"
)]

use polyspec_template::{AstProgram, EngineOptions, ErrorCode, ParseOptions, parse};

/// LEX-21, LEX-22: a delimiter option is a string of two delimiter characters.
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
        Err(error) if error.code == ErrorCode::E_ARGUMENT_DELIMITERS => assert_eq!(error.message, "\"x\" is not a delimiter pair"),
        other => panic!("expected an argument error, got {other:?}"),
    }
}
