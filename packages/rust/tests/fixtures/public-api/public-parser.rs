use polyspec_template::{ErrorCode, ParseOptions, SyntaxTag, Template, TemplateAnalysis, TemplateError, analyze, parse};

pub fn public_parser() -> Result<Template, TemplateError> {
    let options = ParseOptions { delimiters: Some("[]".into()) };
    let analysis: TemplateAnalysis = analyze(b"hello", "page.tpl", &options)?;
    let _: Vec<SyntaxTag> = analysis.tags;
    parse(b"hello", "page.tpl", &options)
}

pub fn argument_error() -> TemplateError {
    let error = TemplateError::without_position(ErrorCode::ArgumentDelimiters, "page.tpl", "invalid option");
    let _: &str = &error.message;
    error
}
