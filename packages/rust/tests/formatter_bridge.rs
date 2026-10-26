//! Native formatter harness wiring; the default SDK exposes only formatting contracts.
#![cfg(feature = "__test_support")]

use polyspec_template::__test_support::{without_line_indentation, without_spans};

#[test]
fn the_formatter_bridge_preserves_native_invariant_helpers() {
    let tree = serde_json::json!([{"type": "Text", "value": "  text", "span": [0, 6]}]);
    let normalized = without_line_indentation(&without_spans(&tree));
    assert_eq!(normalized, serde_json::json!([{"type": "Text", "value": "text"}]));
}
