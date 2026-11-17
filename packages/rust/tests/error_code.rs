//! The code of a template error (ERR-1): `TemplateError::code` gives the code that the field `code` holds, the function
//! that the interface contract names in `errors.code`, by which a generated binding reads the kind of the error
//! (binding GN-7b).

use binding_core::{Handle, HostText, HostValue, HostValues, Raised};
use polyspec_template::{
    ErrorCode, ParseOptions, RenderError, TemplateError, TemplateErrorObject, Value, analyze_prefix, bind_value, value_in,
};

/// A binding that describes scalars only: the walk of `value_in` asks it nothing.
struct Scalars;

impl HostValues for Scalars {
    fn item(&mut self, _list: Handle, _index: u64) -> Result<HostValue, Raised> {
        Ok(HostValue::Null)
    }

    fn entry(&mut self, _map: Handle, _index: u64) -> Result<(HostValue, HostValue), Raised> {
        Ok((HostValue::Null, HostValue::Null))
    }

    fn read(&mut self, _value: Handle) -> Result<HostValue, Raised> {
        Ok(HostValue::Null)
    }
}

/// The error with which `value_in` refuses a value.
fn refused(value: HostValue) -> TemplateError {
    match value_in(&mut Scalars, value) {
        Err(RenderError::Kind(error)) => error,
        other => panic!("expected a kind, got {other:?}"),
    }
}

/// ERR-1: an error without a template and without a position has the text `kind: message`, the same text in the
/// conversion of a value of a binding and in the bind check of the core.
#[test]
fn an_error_without_a_template_and_a_position_has_one_text() {
    let converted = refused(HostValue::Float(9_007_199_254_740_992.0));
    assert_eq!((converted.template.as_str(), converted.line, converted.col), ("", 0, 0));
    assert_eq!(
        converted.to_string(),
        "data_number_range: number 9007199254740992 is outside the safe range"
    );
    let checked = match bind_value(&Value::Number(9_007_199_254_740_992.0)) {
        Err(error) => error,
        Ok(value) => panic!("the bind check accepted {value:?}"),
    };
    assert_eq!(converted.to_string(), checked.to_string());

    let surrogate = refused(HostValue::Text(HostText::Utf16(vec![0xD800]))).to_string();
    assert!(
        surrogate.starts_with("data_invalid_utf8: a string is not valid Unicode text: "),
        "{surrogate}"
    );
    assert_eq!(
        refused(HostValue::Bytes(Vec::new())).to_string(),
        "data_unsupported_type: a byte string is not a template value"
    );
}

/// ERR-1, ERR-5, ERR-6: an error with a template name keeps the name and the position in its text, also the position
/// 0:0 of an error without a position.
#[test]
fn an_error_with_a_template_has_its_name_and_position_in_the_text() {
    assert_eq!(
        TemplateError::without_position(ErrorCode::LoadNotFound, "page.tpl", "missing").to_string(),
        "load_not_found in page.tpl at 0:0: missing"
    );
    let Err(error) = polyspec_template::parse("a\n{? x}".as_bytes(), "x.tpl", &ParseOptions::default()) else {
        panic!("the parse did not fail with a template error");
    };
    assert_eq!(
        error.to_string(),
        format!("parse_unclosed_block in x.tpl at 2:1: {}", error.message)
    );
}

#[test]
fn a_template_error_gives_its_code() {
    for code in [ErrorCode::LexInvalidUtf8, ErrorCode::LoadNotLoaded, ErrorCode::Internal] {
        let error = TemplateError::without_position(code, "page", "a message");
        assert_eq!(error.code(), code);
        assert_eq!(error.code(), error.code);
        assert_eq!(binding_core::Kinds::kind(&error), error.code().as_str());
    }
}

/// ERR-1, EDT-11: the error object as data, the record `template_error_object` of the interface contract, holds the
/// code as its text and the other fields of the error as they are.
#[test]
fn an_error_object_holds_the_text_of_the_code() {
    let error = TemplateError {
        code: ErrorCode::ParseUnexpectedToken,
        template: "page".to_string(),
        line: 2,
        col: 3,
        offset: 7,
        end: 9,
        message: "a message".to_string(),
    };
    let object = TemplateErrorObject::from(error);
    assert_eq!(
        object,
        TemplateErrorObject {
            code: "parse_unexpected_token".to_string(),
            template: "page".to_string(),
            line: 2,
            col: 3,
            offset: 7,
            end: 9,
            message: "a message".to_string(),
        }
    );
}

/// EDT-11: the first parser error of a prefix analysis is the error object, whose code is the text of the code.
#[test]
fn a_prefix_analysis_gives_its_error_as_the_error_object() {
    let analysis = match analyze_prefix(b"{? x}", "prefix.tpl", &ParseOptions::default()) {
        Ok(analysis) => analysis,
        Err(error) => panic!("analyze_prefix failed: {error:?}"),
    };
    let object: Option<TemplateErrorObject> = analysis.error;
    assert_eq!(
        object.map(|error| (error.code, error.template)),
        Some(("parse_unclosed_block".to_string(), "prefix.tpl".to_string()))
    );
}
