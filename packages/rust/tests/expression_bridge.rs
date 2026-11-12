//! Native harness bridge wiring; production consumers use the default SDK.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    reason = "a test states its expectation with unwrap and expect; a failure there is the failure of the test"
)]
#![cfg(feature = "__test_support")]

use polyspec_template::__test_support::{evaluate_expression, parse_expression, tokenize_expression};
use polyspec_template::{Expr, Value};

#[test]
fn the_native_vector_bridge_uses_the_runtime_types() {
    let expression: Expr = parse_expression("1 + 2").expect("the bridge parses");
    let value: Value = evaluate_expression(&expression, &ojson(serde_json::json!({}))).expect("the bridge evaluates");
    assert!(matches!(value, Value::Number(number) if number == 3.0));
    assert!(!tokenize_expression("1 + 2").expect("the bridge tokenizes").is_empty());
}

/// The ordered-json value of a JSON value that a test writes with `serde_json::json!`.
fn ojson(value: serde_json::Value) -> polyspec_template::polyspec_ordered_json::Value {
    use polyspec_template::polyspec_ordered_json::{ParseOptions, parse};
    parse(value.to_string().as_bytes(), &ParseOptions::default()).expect("JSON")
}
