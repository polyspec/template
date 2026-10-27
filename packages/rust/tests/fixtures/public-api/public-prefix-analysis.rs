use polyspec_template::{ParseOptions, PrefixAnalysis, RequestError, SyntaxTag, SyntaxToken, Template, TemplateError, analyze_prefix};

pub fn prefix_analysis() -> Result<PrefixAnalysis, RequestError> {
    let result = analyze_prefix(b"{? x}", "prefix.tpl", &ParseOptions::default())?;
    let PrefixAnalysis { ast, tags, tokens, error } = result;
    let _: Option<&Template> = ast.as_ref();
    let _: &[SyntaxTag] = &tags;
    let _: &[SyntaxToken] = &tokens;
    let _: Option<&TemplateError> = error.as_ref();
    Ok(PrefixAnalysis { ast, tags, tokens, error })
}
