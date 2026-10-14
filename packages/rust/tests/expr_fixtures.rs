//! Expression fixtures: tokens, AST and evaluation (CNF-12 to CNF-14). Each vector is the trial `expressions::<name>`, as
//! the suite unit expressions of config/parity.json reads the results; libtest has no tests made at run time, so the
//! target runs with libtest-mimic (`harness = false`).

mod common;

use common::{json_equal, repo_root};
use libtest_mimic::{Arguments, Failed, Trial};
use polyspec_template::expr::{evaluate_expression, parse_expression, tokenize_expression};
use polyspec_template::to_json_value;

/// One vector: an error vector fails the parse with its code; any other vector has its tokens, its AST and the value of
/// each evaluation.
fn vector(item: &serde_json::Value) -> Result<(), Failed> {
    let expr = item["expr"].as_str().ok_or("the vector has no expr")?;
    if let Some(error) = item.get("error").and_then(|v| v.as_str()) {
        return match parse_expression(expr) {
            Err(actual) if actual.code.as_str() == error => Ok(()),
            Err(actual) => Err(format!("expected {error}, got {}", actual.code.as_str()).into()),
            Ok(_) => Err(format!("expected {error}, parse succeeded").into()),
        };
    }
    let tokens = tokenize_expression(expr).map_err(|error| format!("tokenize failed: {error}"))?;
    let actual: Vec<serde_json::Value> = tokens
        .iter()
        .map(|t| serde_json::json!({ "type": t.kind, "value": t.value }))
        .collect();
    if !json_equal(&serde_json::Value::Array(actual), &item["tokens"]) {
        return Err("tokens differ".into());
    }
    let ast = parse_expression(expr).map_err(|error| format!("parse failed: {error}"))?;
    let ast_json = serde_json::to_value(&ast).map_err(|error| format!("ast json: {error}"))?;
    if !json_equal(&ast_json, &item["ast"]) {
        return Err(format!("ast differs: {ast_json}").into());
    }
    for (index, evaluation) in item["cases"].as_array().map(|v| v.as_slice()).unwrap_or(&[]).iter().enumerate() {
        let value = evaluate_expression(&ast, &evaluation["data"]).map_err(|error| format!("value {index}: {error}"))?;
        if !json_equal(&to_json_value(&value), &evaluation["value"]) {
            return Err(format!("value {index}: got {}", to_json_value(&value)).into());
        }
    }
    Ok(())
}

fn main() {
    let arguments = Arguments::from_args();
    let path = repo_root().join("tests").join("fixtures").join("expr").join("cases.json");
    let text = std::fs::read_to_string(&path).unwrap_or_else(|error| panic!("{}: {error}", path.display()));
    let cases: Vec<serde_json::Value> = serde_json::from_str(&text).unwrap_or_else(|error| panic!("{}: {error}", path.display()));
    let trials = cases
        .into_iter()
        .map(|item| {
            let name = item["name"].as_str().unwrap_or_default().to_string();
            Trial::test(format!("expressions::{name}"), move || vector(&item))
        })
        .collect();
    libtest_mimic::run(&arguments, trials).exit();
}
