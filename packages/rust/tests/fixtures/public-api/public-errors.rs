use polyspec_template::{ErrorCode, LineIndex, Span, TemplateError};

pub fn public_errors() -> Box<dyn std::error::Error> {
    let lines = LineIndex::of(b"first\nsecond");
    let span: Span = [6, 12];
    Box::new(TemplateError::at(ErrorCode::E_PARSE_UNEXPECTED_TOKEN, "page.tpl", Some(&lines), span, "invalid tag"))
}
