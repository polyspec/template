//! Shared test helpers: repository paths and structural JSON comparison.
#![allow(dead_code, reason = "each test crate uses only some of the shared helpers")]

use std::path::{Path, PathBuf};

/// Repository root (two levels above the crate). It comes from the `CARGO_MANIFEST_DIR` that cargo sets when it runs
/// the test, not from the path compiled into the binary, which names the checkout that built it.
pub fn repo_root() -> PathBuf {
    let manifest = std::env::var_os("CARGO_MANIFEST_DIR")
        .expect("CARGO_MANIFEST_DIR: run the tests with cargo test, which sets the directory of the crate");
    Path::new(&manifest).join("..").join("..").canonicalize().expect("repository root")
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

/// The id `<group>/<name>` and the directory of every case under tests/cases, sorted by id. An unreadable directory
/// fails the test.
pub fn cases() -> Vec<(String, PathBuf)> {
    let mut cases = Vec::new();
    for group in directories(&repo_root().join("tests").join("cases")) {
        for dir in directories(&group) {
            let id = format!("{}/{}", file_name(&group), file_name(&dir));
            cases.push((id, dir));
        }
    }
    cases.sort();
    cases
}

/// Every .tpl file under tests/cases, sorted.
pub fn templates() -> Vec<PathBuf> {
    fn walk(dir: &Path, found: &mut Vec<PathBuf>) {
        for path in entries(dir) {
            if path.is_dir() {
                walk(&path, found);
            } else if path.extension().is_some_and(|extension| extension == "tpl") {
                found.push(path);
            }
        }
    }
    let mut found = Vec::new();
    walk(&repo_root().join("tests").join("cases"), &mut found);
    found.sort();
    found
}

/// The delimiters option of the options.json of a case directory, or None when the case has no options.json. A file
/// that cannot be read or is not JSON fails the test.
pub fn case_delimiters(dir: &Path) -> Option<String> {
    let path = dir.join("options.json");
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return None,
        Err(error) => panic!("{}: {error}", path.display()),
    };
    let options: serde_json::Value = serde_json::from_str(&text).unwrap_or_else(|error| panic!("{}: {error}", path.display()));
    options.get("delimiters").and_then(|value| value.as_str()).map(str::to_string)
}

fn entries(dir: &Path) -> Vec<PathBuf> {
    std::fs::read_dir(dir)
        .unwrap_or_else(|error| panic!("{}: {error}", dir.display()))
        .map(|entry| entry.unwrap_or_else(|error| panic!("{}: {error}", dir.display())).path())
        .collect()
}

fn directories(dir: &Path) -> Vec<PathBuf> {
    entries(dir).into_iter().filter(|path| path.is_dir()).collect()
}

fn file_name(path: &Path) -> String {
    path.file_name().expect("file name").to_string_lossy().to_string()
}
