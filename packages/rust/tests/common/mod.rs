//! Shared test helpers: repository paths and structural JSON comparison.
#![expect(dead_code, reason = "each test crate uses only some of the shared helpers")]

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
    let options: serde_json::Value = serde_json::from_str(&text)
        .map_err(|error| format!("{}: {error}", path.display()))
        .expect("the options file is valid JSON");
    options.get("delimiters").and_then(|value| value.as_str()).map(str::to_string)
}

fn entries(dir: &Path) -> Vec<PathBuf> {
    std::fs::read_dir(dir)
        .map_err(|error| format!("{}: {error}", dir.display()))
        .expect("the directory is readable")
        .map(|entry| {
            entry
                .map_err(|error| format!("{}: {error}", dir.display()))
                .expect("a directory entry is readable")
                .path()
        })
        .collect()
}

fn directories(dir: &Path) -> Vec<PathBuf> {
    entries(dir).into_iter().filter(|path| path.is_dir()).collect()
}

fn file_name(path: &Path) -> String {
    path.file_name().expect("file name").to_string_lossy().to_string()
}

/// The ordered-json value of a JSON value that a test writes with `serde_json::json!` or reads from a fixture.
pub fn ojson(value: serde_json::Value) -> polyspec_template::polyspec_ordered_json::Value {
    use polyspec_template::polyspec_ordered_json::{ParseOptions, parse};
    parse(value.to_string().as_bytes(), &ParseOptions::default()).expect("JSON")
}

/// The JSON Pointer that the message of an ast_invalid error names (ERR-15, AST-10): empty for the root, None when the
/// text is not JSON.
pub fn ast_pointer(error: &polyspec_template::TemplateError) -> Option<&str> {
    if error.message.contains("at the root:") {
        return Some("");
    }
    let rest = error.message.strip_prefix("invalid template AST at ")?;
    rest.split_once(": ").map(|(pointer, _)| pointer)
}

/// The record of FMT-14 that the shared fixtures write for a format error: the reason that its kind names and the
/// parser code, which only the reason `parse` has (ERR-15).
pub fn format_record(error: &polyspec_template::TemplateError) -> (&'static str, Option<String>) {
    match error.code {
        polyspec_template::ErrorCode::E_FORMAT_INVARIANT => ("invariant", None),
        polyspec_template::ErrorCode::E_FORMAT_HTML => ("html", None),
        code if code.as_str().starts_with("argument_") => ("parse", None),
        code => ("parse", Some(code.as_str().to_string())),
    }
}

/// The category of a kind in the error table of the interface contract, packages/rust/interface.json (design E-1).
pub fn kind_category(kind: &str) -> String {
    let path = repo_root().join("packages").join("rust").join("interface.json");
    let contract: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&path).expect("interface.json")).expect("JSON");
    let variant = format!("polyspec_template::ErrorCode::E_{}", kind.to_uppercase());
    contract["errors"]["kinds"]
        .as_array()
        .expect("errors.kinds")
        .iter()
        .find(|row| row["variant"] == variant.as_str())
        .and_then(|row| row["category"].as_str())
        .map(str::to_string)
        .expect("the kind is in the error table")
}
