//! Conformance cases rendered in-process (CNF-6 to CNF-9).

mod common;

use common::{json_equal, repo_root};
use polyspec_template::{
    AstProgram, Engine, EngineOptions, ErrorCode, FsLoader, ParseOptions, RenderOptions, RenderTarget, TemplateError, defines_from_json,
    env_from_json, parse,
};
use std::fs;
use std::path::{Path, PathBuf};

fn cases() -> Vec<(String, PathBuf)> {
    let root = repo_root().join("tests").join("cases");
    let mut cases = Vec::new();
    for group in fs::read_dir(&root).expect("cases directory").flatten() {
        if !group.path().is_dir() {
            continue;
        }
        for entry in fs::read_dir(group.path()).expect("group").flatten() {
            if entry.path().is_dir() {
                cases.push((
                    format!("{}/{}", group.file_name().to_string_lossy(), entry.file_name().to_string_lossy()),
                    entry.path(),
                ));
            }
        }
    }
    cases.sort();
    cases
}

fn read_json(path: &Path) -> Option<Result<serde_json::Value, ErrorCode>> {
    let bytes = fs::read(path).ok()?;
    if std::str::from_utf8(&bytes).is_err() {
        return Some(Err(ErrorCode::E_DATA_INVALID_UTF8));
    }
    Some(serde_json::from_slice(&bytes).map_err(|_| ErrorCode::E_DATA_UNSUPPORTED_TYPE))
}

fn delimiters_of(dir: &Path) -> Option<String> {
    let options = read_json(&dir.join("options.json"))?.ok()?;
    options.get("delimiters").and_then(|v| v.as_str()).map(str::to_string)
}

enum Outcome {
    Html(String),
    Error(TemplateError),
}

fn render_case(dir: &Path) -> Outcome {
    let engine = Engine::new(AstProgram::new(EngineOptions {
        loader: Some(Box::new(FsLoader::new(dir))),
        functions: Default::default(),
        limits: None,
        delimiters: delimiters_of(dir),
        artifact_refresh: Default::default(),
    }));
    let assign = match read_json(&dir.join("data.json")) {
        None => serde_json::Value::Object(Default::default()),
        Some(Ok(value)) => value,
        Some(Err(code)) => return Outcome::Error(TemplateError::without_position(code, "input.tpl", "data")),
    };
    let mut options = RenderOptions::default();
    if let Some(Ok(define)) = read_json(&dir.join("define.json")) {
        options.define = defines_from_json(&define).expect("define");
    }
    if let Some(Ok(env)) = read_json(&dir.join("env.json")) {
        options.env = Some(env_from_json(&env).expect("env"));
    }
    match engine.render(RenderTarget::Name("input.tpl"), &assign, &options) {
        Ok(html) => Outcome::Html(html),
        Err(error) => Outcome::Error(error),
    }
}

#[test]
fn every_case_matches_its_expected_files() {
    let mut failures = Vec::new();
    let all = cases();
    assert!(all.len() >= 200, "expected the fixture cases, found {}", all.len());
    for (id, dir) in &all {
        if let Ok(expected) = fs::read_to_string(dir.join("expected.ast.json")) {
            let source = fs::read(dir.join("input.tpl")).expect("input");
            match parse(
                &source,
                "input.tpl",
                &ParseOptions {
                    delimiters: delimiters_of(dir),
                },
            ) {
                Ok(ast) => {
                    let actual = serde_json::to_value(&ast).expect("ast json");
                    let expected: serde_json::Value = serde_json::from_str(&expected).expect("expected ast");
                    if !json_equal(&actual, &expected) {
                        failures.push(format!("{id}: ast differs"));
                    }
                }
                Err(error) => failures.push(format!("{id}: parse failed: {error}")),
            }
        }
        let outcome = render_case(dir);
        if let Ok(expected) = fs::read_to_string(dir.join("expected.error.json")) {
            let expected: serde_json::Value = serde_json::from_str(&expected).expect("expected error");
            match outcome {
                Outcome::Error(error) => {
                    let actual =
                        serde_json::json!({ "code": error.code, "template": error.template, "line": error.line, "col": error.col });
                    if !json_equal(&actual, &expected) {
                        failures.push(format!("{id}: error differs: {actual}"));
                    }
                }
                Outcome::Html(_) => failures.push(format!("{id}: expected an error")),
            }
        } else {
            let expected = fs::read_to_string(dir.join("expected.html")).expect("expected html");
            match outcome {
                Outcome::Html(html) => {
                    if html != expected {
                        failures.push(format!("{id}: html differs"));
                    }
                }
                Outcome::Error(error) => failures.push(format!("{id}: render failed: {error}")),
            }
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
