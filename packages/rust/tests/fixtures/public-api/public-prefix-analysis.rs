use polyspec_template::{ParseOptions, PrefixAnalysis, RequestError, SyntaxTag, SyntaxToken, TemplateError, analyze_prefix};

pub fn prefix_analysis() -> Result<PrefixAnalysis, RequestError> {
    let result = analyze_prefix(b"{? x}", "prefix.tpl", &ParseOptions::default())?;
    let _: &[SyntaxTag] = &result.tags;
    let _: &[SyntaxToken] = &result.tokens;
    let _: Option<&TemplateError> = result.error.as_ref();
    Ok(result)
}
