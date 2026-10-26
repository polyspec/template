use polyspec_template::{FormatError, FormatErrorReason, FormatOptions, Formatted, IndentUnit, TemplateBlocks, format};

pub fn public_formatter() -> Result<Formatted, FormatError> {
    let _: FormatErrorReason = FormatErrorReason::Parse;
    let options = FormatOptions {
        indent: Some(IndentUnit::new("  ").expect("valid indent")),
        template_blocks: TemplateBlocks::Indent,
        ..FormatOptions::default()
    };
    format("text", &options)
}
