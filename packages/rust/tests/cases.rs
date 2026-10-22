// EDT-9: the tags of a template are the accepted tags that the editors paint.
//! The tokens and the format results of every conformance case (CNF-17, CNF-18), one trial per case: `tokens::<case>`
//! and `formatting::<case>`, as the suite units tokens and formatting of config/parity.json read the results. libtest has
//! no tests made at run time, so the target runs with libtest-mimic (`harness = false`).

mod common;

use common::{case_delimiters, cases};
use libtest_mimic::{Arguments, Failed, Trial};
use polyspec_template::{FormatError, FormatOptions, Formatted, IndentUnit, ParseOptions, analyze, format};
use std::fs;
use std::path::Path;

/// The content of an expected file of a case whose input parses, or None after checking that a case without
/// expected.ast.json has no such file.
fn expected(dir: &Path, name: &str) -> Result<Option<serde_json::Value>, Failed> {
    let path = dir.join(name);
    if !dir.join("expected.ast.json").exists() {
        if path.exists() {
            return Err(format!("{name} exists although the case has no expected.ast.json").into());
        }
        return Ok(None);
    }
    let text = fs::read_to_string(&path).map_err(|error| format!("{name}: {error}"))?;
    Ok(Some(serde_json::from_str(&text).map_err(|error| format!("{name}: {error}"))?))
}

/// CNF-17: the EDT-8 tokens of analyze as `[start, end, type]` with byte offsets equal expected.tokens.json.
fn tokens(dir: &Path) -> Result<(), Failed> {
    let Some(expected) = expected(dir, "expected.tokens.json")? else {
        return Ok(());
    };
    let source = fs::read(dir.join("input.tpl")).map_err(|error| format!("input.tpl: {error}"))?;
    let analysis = analyze(
        &source,
        "input.tpl",
        &ParseOptions {
            delimiters: case_delimiters(dir),
        },
    )
    .map_err(|error| format!("{error:?}"))?;
    let actual: Vec<serde_json::Value> = analysis
        .tokens
        .iter()
        .map(|token| serde_json::json!([token.start, token.end, token.kind.as_str()]))
        .collect();
    let actual = serde_json::Value::Array(actual);
    if actual != expected {
        return Err(format!("tokens\n  actual {actual}\nexpected {expected}").into());
    }
    Ok(())
}

fn result_json(result: Result<Formatted, FormatError>) -> serde_json::Value {
    match result {
        Ok(formatted) => serde_json::json!({ "text": formatted.text }),
        Err(error) => serde_json::json!({
            "error": { "reason": error.reason, "code": error.code, "line": error.line, "col": error.col }
        }),
    }
}

/// CNF-18: the text or the error of format with the default options ("indent") and with indent None ("keep") equal
/// expected.format.json.
fn formatting(dir: &Path) -> Result<(), Failed> {
    let Some(expected) = expected(dir, "expected.format.json")? else {
        return Ok(());
    };
    let source = fs::read_to_string(dir.join("input.tpl")).map_err(|error| format!("input.tpl: {error}"))?;
    let delimiters = case_delimiters(dir);
    let run = |indent: Option<IndentUnit>| {
        result_json(format(
            &source,
            &FormatOptions {
                indent,
                delimiters: delimiters.clone(),
                name: "input.tpl".to_string(),
                ..FormatOptions::default()
            },
        ))
    };
    let actual = serde_json::json!({ "indent": run(Some(IndentUnit::new("  ").expect("indent unit"))), "keep": run(None) });
    if actual != expected {
        return Err(format!("format\n  actual {actual}\nexpected {expected}").into());
    }
    Ok(())
}

fn main() {
    let arguments = Arguments::from_args();
    let mut trials = Vec::new();
    for (id, dir) in cases() {
        let tokens_dir = dir.clone();
        trials.push(Trial::test(format!("tokens::{id}"), move || tokens(&tokens_dir)));
        trials.push(Trial::test(format!("formatting::{id}"), move || formatting(&dir)));
    }
    libtest_mimic::run(&arguments, trials).exit();
}
