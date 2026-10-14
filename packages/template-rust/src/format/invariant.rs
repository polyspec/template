//! Safety invariant: two templates are equivalent when their ASTs are equal after every `span` field is removed (AST-2,
//! AST-7), and, for indented lines, after the spaces and tabs at the start of every line of text are removed.

use serde_json::Value;

/// Returns a copy of an AST value without `span` fields.
pub fn without_spans(value: &Value) -> Value {
    match value {
        Value::Array(items) => Value::Array(items.iter().map(without_spans).collect()),
        Value::Object(map) => Value::Object(
            map.iter()
                .filter(|(key, _)| key.as_str() != "span")
                .map(|(key, field)| (key.clone(), without_spans(field)))
                .collect(),
        ),
        other => other.clone(),
    }
}

fn is_empty_text(value: &Value) -> bool {
    value.get("type").and_then(Value::as_str) == Some("Text") && value.get("value").and_then(Value::as_str) == Some("")
}

/// Returns a copy of an AST value whose `Text` nodes have no spaces or tabs at the start of a line. A `Text` node that
/// becomes empty is removed: indentation after a line that the renderer removes is a `Text` node of its own.
pub fn without_line_indentation(value: &Value) -> Value {
    match value {
        Value::Array(items) => Value::Array(
            items
                .iter()
                .map(without_line_indentation)
                .filter(|item| !is_empty_text(item))
                .collect(),
        ),
        Value::Object(map) => {
            let text = map.get("type").and_then(Value::as_str) == Some("Text");
            Value::Object(
                map.iter()
                    .map(|(key, field)| match field {
                        Value::String(value) if text && key == "value" => (key.clone(), Value::String(unindented(value))),
                        _ => (key.clone(), without_line_indentation(field)),
                    })
                    .collect(),
            )
        }
        other => other.clone(),
    }
}

fn unindented(value: &str) -> String {
    value
        .split('\n')
        .map(|line| line.trim_start_matches([' ', '\t']))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Compares two AST values structurally, ignoring object key order and every `span` field.
pub fn same_tree(left: &Value, right: &Value) -> bool {
    without_spans(left) == without_spans(right)
}
