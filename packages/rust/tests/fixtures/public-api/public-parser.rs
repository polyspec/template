pub fn public_parser() -> Result<polyspec_template::Template, polyspec_template::RequestError> {
    let options = polyspec_template::ParseOptions::default();
    let analysis: polyspec_template::TemplateAnalysis = polyspec_template::analyze(b"hello", "page.tpl", &options)?;
    let _: Vec<polyspec_template::SyntaxTag> = analysis.tags;
    polyspec_template::parse(b"hello", "page.tpl", &options)
}
