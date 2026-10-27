use polyspec_template::{ErrorCode, LineIndex, Span, TemplateError};

pub fn public_errors() -> Box<dyn std::error::Error> {
    let lines = LineIndex::from_starts(vec![0, 6]);
    let _: &str = ErrorCode::E_PARSE_UNEXPECTED_TOKEN.as_str();
    let span: Span = [6, 12];
    Box::new(TemplateError::at(ErrorCode::E_PARSE_UNEXPECTED_TOKEN, "page.tpl", Some(&lines), span, "invalid tag"))
}
