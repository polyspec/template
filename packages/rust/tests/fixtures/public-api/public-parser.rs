pub fn public_parser() -> Result<polyspec_template::Template, polyspec_template::RequestError> {
    let options = polyspec_template::ParseOptions { delimiters: Some("[]".into()) };
    let analysis: polyspec_template::TemplateAnalysis = polyspec_template::analyze(b"hello", "page.tpl", &options)?;
    let _: Vec<polyspec_template::SyntaxTag> = analysis.tags;
    polyspec_template::parse(b"hello", "page.tpl", &options)
}

pub fn argument_error() -> polyspec_template::RequestError {
    let error = polyspec_template::ArgumentError { message: "invalid option".into() };
    let _: &str = &error.message;
    polyspec_template::RequestError::Argument(error)
}

pub fn template_error(error: polyspec_template::TemplateError) -> polyspec_template::RequestError {
    polyspec_template::RequestError::Template(error)
}
