use polyspec_template::{ErrorCode, FormatOptions, Formatted, TemplateBlocks, TemplateError, format};

pub fn public_formatter() -> Result<Formatted, TemplateError> {
    let _: ErrorCode = ErrorCode::FormatInvariant;
    let options = FormatOptions {
        indent: Some("  ".to_string()),
        keep_indentation: Some(false),
        template_blocks: Some(TemplateBlocks::Indent),
        ..FormatOptions::default()
    };
    format("text", &options)
}
