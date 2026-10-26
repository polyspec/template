use polyspec_template::{ErrorCode, LineIndex, Source, Span, TemplateError};

pub fn source_context() -> Result<TemplateError, TemplateError> {
    let source = Source::from_bytes("example.tpl", b"a\nb")?;
    let text_source = Source::from_text(source.name(), source.text())?;
    let _: &[u8] = source.bytes();
    let _: &LineIndex = source.lines();
    let _: usize = source.length();
    let _: usize = source.byte_at(1).expect("source index");
    let _: Span = source.span(0, 1).expect("source range");
    Ok(text_source.error(ErrorCode::E_PARSE_UNEXPECTED_TOKEN, 0, 1, "example"))
}
