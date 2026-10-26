//! Native harness bridge wiring; production consumers use the default SDK.
#![cfg(feature = "__test_support")]

use polyspec_template::__test_support::{evaluate_expression, parse_expression, tokenize_expression};
use polyspec_template::{Expr, Value};

#[test]
fn the_native_vector_bridge_uses_the_runtime_types() {
    let expression: Expr = parse_expression("1 + 2").expect("the bridge parses");
    let value: Value = evaluate_expression(&expression, &serde_json::json!({})).expect("the bridge evaluates");
    assert!(matches!(value, Value::Number(number) if number == 3.0));
    assert!(!tokenize_expression("1 + 2").expect("the bridge tokenizes").is_empty());
}
