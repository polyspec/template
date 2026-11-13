//! The code of a template error (ERR-1): `TemplateError::code` gives the code that the field `code` holds, the function
//! that the interface contract names in `errors.code`, by which a generated binding reads the kind of the error
//! (binding GN-7b).

use polyspec_template::{ErrorCode, ParseOptions, TemplateError, TemplateErrorObject, analyze_prefix};

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
