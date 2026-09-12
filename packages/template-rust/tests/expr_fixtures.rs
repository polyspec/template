//! Expression fixtures: tokens, AST and evaluation (CNF-12 to CNF-14).

mod common;

use common::{json_equal, repo_root};
use polyspec_template::expr::{evaluate_expression, parse_expression, tokenize_expression};
use polyspec_template::to_json_value;

#[test]
fn expression_fixtures_pass_the_three_checks() {
    let path = repo_root().join("tests").join("fixtures").join("expr").join("cases.json");
    let cases: Vec<serde_json::Value> = serde_json::from_str(&std::fs::read_to_string(path).expect("fixture")).expect("fixture json");
    assert!(cases.len() >= 50);
    let mut failures = Vec::new();
    for item in &cases {
        let name = item["name"].as_str().expect("name");
        let expr = item["expr"].as_str().expect("expr");
        if let Some(error) = item.get("error").and_then(|v| v.as_str()) {
            match parse_expression(expr) {
                Err(actual) if actual.code.as_str() == error => {}
                Err(actual) => failures.push(format!("{name}: expected {error}, got {}", actual.code.as_str())),
                Ok(_) => failures.push(format!("{name}: expected {error}, parse succeeded")),
            }
            continue;
        }
        match tokenize_expression(expr) {
            Ok(tokens) => {
                let actual: Vec<serde_json::Value> = tokens
                    .iter()
                    .map(|t| serde_json::json!({ "type": t.kind, "value": t.value }))
                    .collect();
                if !json_equal(&serde_json::Value::Array(actual), &item["tokens"]) {
                    failures.push(format!("{name}: tokens differ"));
                }
            }
            Err(error) => failures.push(format!("{name}: tokenize failed: {error}")),
        }
        let ast = match parse_expression(expr) {
            Ok(ast) => ast,
            Err(error) => {
                failures.push(format!("{name}: parse failed: {error}"));
                continue;
            }
        };
        if !json_equal(&serde_json::to_value(&ast).expect("ast"), &item["ast"]) {
            failures.push(format!("{name}: ast differs"));
        }
        for (index, evaluation) in item["cases"].as_array().map(|v| v.as_slice()).unwrap_or(&[]).iter().enumerate() {
            match evaluate_expression(&ast, &evaluation["data"]) {
                Ok(value) => {
                    if !json_equal(&to_json_value(&value), &evaluation["value"]) {
                        failures.push(format!("{name} value {index}: got {}", to_json_value(&value)));
                    }
                }
                Err(error) => failures.push(format!("{name} value {index}: {error}")),
            }
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
