//! The code of a template error (ERR-1): `TemplateError::code` gives the code that the field `code` holds, the function
//! that the interface contract names in `errors.code`, by which a generated binding reads the kind of the error
//! (binding GN-7b).

use polyspec_template::{ErrorCode, TemplateError};

#[test]
fn a_template_error_gives_its_code() {
    for code in [ErrorCode::LexInvalidUtf8, ErrorCode::LoadNotLoaded, ErrorCode::Internal] {
        let error = TemplateError::without_position(code, "page", "a message");
        assert_eq!(error.code(), code);
        assert_eq!(error.code(), error.code);
        assert_eq!(binding_core::Kinds::kind(&error), error.code().as_str());
    }
}
