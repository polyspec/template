//! Conformance cases rendered in-process (CNF-6 to CNF-9).

mod common;

use common::{case_delimiters, cases, json_equal};
use libtest_mimic::{Arguments, Failed, Trial};
use polyspec_template::{
    AstProgram, Engine, EngineOptions, ErrorCode, FsLoader, ParseOptions, RenderOptions, RenderTarget, RequestError, TemplateError,
    defines_from_json, env_from_json, parse,
};
use std::fs;
use std::path::Path;

/// The bytes of an optional file of a case, or None when the case has no such file; any other read error fails the case.
fn read_optional(path: &Path) -> Result<Option<Vec<u8>>, Failed> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("{}: {error}", path.display()).into()),
    }
}

/// The JSON of an optional file of a case as the command line reads it: None when the case has no such file, or the
/// value, or the code of the data error of its text.
fn read_json(path: &Path) -> Result<Option<Result<serde_json::Value, ErrorCode>>, Failed> {
    let Some(bytes) = read_optional(path)? else {
        return Ok(None);
    };
    let Ok(text) = std::str::from_utf8(&bytes) else {
        return Ok(Some(Err(ErrorCode::E_DATA_INVALID_UTF8)));
    };
    Ok(Some(polyspec_template::read_json(text).map_err(|error| error.code)))
}

/// The text of an optional expected file of a case, or None when the case has no such file.
fn read_text(path: &Path) -> Result<Option<String>, Failed> {
    read_optional(path)?
        .map(|bytes| String::from_utf8(bytes).map_err(|error| format!("{}: {error}", path.display()).into()))
        .transpose()
}

enum Outcome {
    Html(String),
    Error(TemplateError),
}

fn render_case(dir: &Path) -> Result<Outcome, Failed> {
    let engine = Engine::new(
        AstProgram::new(EngineOptions {
            loader: Some(Box::new(FsLoader::new(dir))),
            functions: Default::default(),
            limits: None,
            delimiters: case_delimiters(dir),
            artifact_refresh: Default::default(),
        })
        .map_err(|error| format!("engine options: {error}"))?,
    );
    let assign = match read_json(&dir.join("data.json"))? {
        None => serde_json::Value::Object(Default::default()),
        Some(Ok(value)) => value,
        Some(Err(code)) => return Ok(Outcome::Error(TemplateError::without_position(code, "input.tpl", "data"))),
    };
    let mut options = RenderOptions::default();
    match read_json(&dir.join("define.json"))? {
        None => {}
        Some(Ok(define)) => options.define = defines_from_json(&define).map_err(|error| format!("define.json: {error:?}"))?,
        Some(Err(code)) => return Ok(Outcome::Error(TemplateError::without_position(code, "input.tpl", "define"))),
    }
    match read_json(&dir.join("env.json"))? {
        None => {}
        Some(Ok(env)) => options.env = Some(env_from_json(&env).map_err(|error| format!("env.json: {error:?}"))?),
        Some(Err(code)) => return Ok(Outcome::Error(TemplateError::without_position(code, "input.tpl", "env"))),
    }
    match engine.render(RenderTarget::Name("input.tpl"), &assign, &options) {
        Ok(html) => Ok(Outcome::Html(html)),
        Err(RequestError::Template(error)) => Ok(Outcome::Error(error)),
        Err(RequestError::Argument(error)) => Err(format!("an AST program reported an argument error: {error}").into()),
    }
}

/// One case: the AST of a case with expected.ast.json, then the output or the error of its render.
fn conformance(dir: &Path) -> Result<(), Failed> {
    if let Some(expected) = read_text(&dir.join("expected.ast.json"))? {
        let source = fs::read(dir.join("input.tpl")).map_err(|error| format!("input.tpl: {error}"))?;
        let ast = parse(
            &source,
            "input.tpl",
            &ParseOptions {
                delimiters: case_delimiters(dir),
            },
        )
        .map_err(|error| format!("parse failed: {error}"))?;
        let actual = serde_json::to_value(&ast).map_err(|error| format!("ast json: {error}"))?;
        let expected: serde_json::Value = serde_json::from_str(&expected).map_err(|error| format!("expected.ast.json: {error}"))?;
        if !json_equal(&actual, &expected) {
            return Err(format!(
                "ast differs
  actual {actual}
expected {expected}"
            )
            .into());
        }
    }
    let outcome = render_case(dir)?;
    if let Some(expected) = read_text(&dir.join("expected.error.json"))? {
        let expected: serde_json::Value = serde_json::from_str(&expected).map_err(|error| format!("expected.error.json: {error}"))?;
        return match outcome {
            Outcome::Error(error) => {
                let actual = serde_json::json!({ "code": error.code, "template": error.template, "line": error.line, "col": error.col });
                if json_equal(&actual, &expected) {
                    Ok(())
                } else {
                    Err(format!("error differs: {actual}").into())
                }
            }
            Outcome::Html(html) => Err(format!("expected an error, rendered {html:?}").into()),
        };
    }
    let expected = fs::read_to_string(dir.join("expected.html")).map_err(|error| format!("expected.html: {error}"))?;
    match outcome {
        Outcome::Html(html) if html == expected => Ok(()),
        Outcome::Html(html) => Err(format!(
            "html differs
  actual {html:?}
expected {expected:?}"
        )
        .into()),
        Outcome::Error(error) => Err(format!("render failed: {error}").into()),
    }
}

/// Each case is the trial `conformance::<case>`, as the suite unit conformance of config/parity.json reads the results.
/// libtest has no tests made at run time, so the target runs with libtest-mimic (`harness = false`).
fn main() {
    let arguments = Arguments::from_args();
    let all = cases();
    // The suite holds every case of tests/cases; an empty or short list is a broken lister, not a passing suite.
    assert!(
        all.len() >= 200,
        "expected the conformance cases of tests/cases, found {}",
        all.len()
    );
    let trials = all
        .into_iter()
        .map(|(id, dir)| Trial::test(format!("conformance::{id}"), move || conformance(&dir)))
        .collect();
    libtest_mimic::run(&arguments, trials).exit();
}
