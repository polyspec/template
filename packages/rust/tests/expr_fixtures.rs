//! Expression fixtures: tokens, AST and evaluation (CNF-12 to CNF-14). Each vector is the trial `expressions::<name>`, as
//! the suite unit expressions of config/parity.json reads the results; libtest has no tests made at run time, so the
//! target runs with libtest-mimic (`harness = false`).

mod common;

use common::{json_equal, repo_root};
use libtest_mimic::{Arguments, Failed, Trial};
use polyspec_template::expr::{evaluate_expression, parse_expression, tokenize_expression};
use polyspec_template::to_json_value;
use serde::Deserialize;

/// One vector of tests/fixtures/expr/cases.json: an error vector names the code of its parse error; any other vector has
/// its tokens, its AST and its evaluations.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Vector {
    name: String,
    expr: String,
    #[expect(
        dead_code,
        reason = "the parity check of kit reads the requirements that a vector tests; the test runs its expression"
    )]
    requirements: Vec<String>,
    error: Option<String>,
    tokens: Option<Vec<FixtureToken>>,
    ast: Option<serde_json::Value>,
    #[serde(default)]
    cases: Vec<Evaluation>,
}

/// A token of the expression lexer, as CNF-13 names its type.
#[derive(Deserialize, PartialEq, Debug)]
#[serde(deny_unknown_fields)]
struct FixtureToken {
    r#type: String,
    value: String,
}

/// The value of the expression for the data of one evaluation.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Evaluation {
    data: serde_json::Value,
    value: serde_json::Value,
}

fn vector(item: &Vector) -> Result<(), Failed> {
    if let Some(error) = &item.error {
        return match parse_expression(&item.expr) {
            Err(actual) if actual.code.as_str() == error => Ok(()),
            Err(actual) => Err(format!("expected {error}, got {}", actual.code.as_str()).into()),
            Ok(_) => Err(format!("expected {error}, parse succeeded").into()),
        };
    }
    let expected_tokens = item.tokens.as_ref().ok_or("the vector has neither error nor tokens")?;
    let tokens: Vec<FixtureToken> = tokenize_expression(&item.expr)
        .map_err(|error| format!("tokenize failed: {error}"))?
        .into_iter()
        .map(|token| FixtureToken {
            r#type: token.kind,
            value: token.value,
        })
        .collect();
    if &tokens != expected_tokens {
        return Err(format!("tokens differ: {tokens:?}").into());
    }
    let expected_ast = item.ast.as_ref().ok_or("the vector has neither error nor ast")?;
    let ast = parse_expression(&item.expr).map_err(|error| format!("parse failed: {error}"))?;
    let ast_json = serde_json::to_value(&ast).map_err(|error| format!("ast json: {error}"))?;
    if !json_equal(&ast_json, expected_ast) {
        return Err(format!("ast differs: {ast_json}").into());
    }
    for (index, evaluation) in item.cases.iter().enumerate() {
        let value = evaluate_expression(&ast, &evaluation.data).map_err(|error| format!("value {index}: {error}"))?;
        if !json_equal(&to_json_value(&value), &evaluation.value) {
            return Err(format!("value {index}: got {}", to_json_value(&value)).into());
        }
    }
    Ok(())
}

fn main() {
    let arguments = Arguments::from_args();
    let path = repo_root().join("tests").join("fixtures").join("expr").join("cases.json");
    let text = std::fs::read_to_string(&path)
        .map_err(|error| format!("{}: {error}", path.display()))
        .expect("the fixture file is readable");
    let vectors: Vec<Vector> = serde_json::from_str(&text)
        .map_err(|error| format!("{}: {error}", path.display()))
        .expect("the fixture file is valid JSON");
    assert!(!vectors.is_empty(), "{} holds no vector", path.display());
    let trials = vectors
        .into_iter()
        .map(|item| Trial::test(format!("expressions::{}", item.name), move || vector(&item)))
        .collect();
    libtest_mimic::run(&arguments, trials).exit();
}
