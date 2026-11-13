use polyspec_template::{ErrorCode, FormatOptions, Formatted, IndentUnit, TemplateBlocks, TemplateError, format};

pub fn public_formatter() -> Result<Formatted, TemplateError> {
    let _: ErrorCode = ErrorCode::FormatInvariant;
    let options = FormatOptions {
        indent: Some(IndentUnit::new("  ").expect("valid indent")),
        template_blocks: TemplateBlocks::Indent,
        ..FormatOptions::default()
    };
    format("text", &options)
}
