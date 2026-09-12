//! Shared test helpers: repository paths and structural JSON comparison.
#![allow(dead_code)]

use std::path::{Path, PathBuf};

/// Repository root (two levels above the crate).
pub fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .canonicalize()
        .expect("repository root")
}

/// Structural JSON equality: key order is ignored, numbers compare by value.
pub fn json_equal(a: &serde_json::Value, b: &serde_json::Value) -> bool {
    match (a, b) {
        (serde_json::Value::Number(x), serde_json::Value::Number(y)) => x.as_f64() == y.as_f64(),
        (serde_json::Value::Array(x), serde_json::Value::Array(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| json_equal(p, q)),
        (serde_json::Value::Object(x), serde_json::Value::Object(y)) => {
            x.len() == y.len()
                && x.iter()
                    .all(|(key, value)| y.get(key).is_some_and(|other| json_equal(value, other)))
        }
        _ => a == b,
    }
}
