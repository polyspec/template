//! decode_template reads the canonical AST JSON into the AST of the crate (AST-10).

mod common;

use polyspec_template::{AstProgram, EngineOptions, MapLoader, RenderOptions, RenderTarget, decode_template};

const ECHO: &str = r#"{"type":"Template","name":"x.tpl","body":[{"type":"Echo","expr":{"type":"Binary","op":"+","left":{"type":"Var","name":"a","span":[3,4]},"right":{"type":"Literal","kind":"number","value":1,"span":[7,8]},"span":[3,8]},"span":[0,9]}],"comments":[]}"#;

/// The expected.ast.json of every conformance case decodes into the AST that parse returns, whose JSON is that file
/// again.
#[test]
fn decode_reads_the_ast_of_every_conformance_case() {
    let mut count = 0;
    for (id, dir) in common::cases() {
        let Ok(text) = std::fs::read_to_string(dir.join("expected.ast.json")) else {
            continue;
        };
        let decoded = decode_template(&text).unwrap_or_else(|error| panic!("{id}: {error}"));
        let expected: serde_json::Value = serde_json::from_str(&text).expect("expected.ast.json");
        let actual = serde_json::to_value(&decoded).expect("encode");
        assert!(common::json_equal(&actual, &expected), "{id}: the decoded AST encodes as {actual}");
        count += 1;
    }
    assert!(count > 0, "no case has an expected.ast.json");
}

/// A program renders a decoded AST without its source (RT-41).
#[test]
fn a_decoded_template_renders_without_its_source() {
    let ast = decode_template(ECHO).expect("decode");
    assert_eq!(
        ast,
        polyspec_template::parse(b"{= a + 1}", "x.tpl", &Default::default()).expect("parse")
    );
    let mut loader = MapLoader::new();
    loader.set_ast("x.tpl", ast);
    let engine = AstProgram::new(EngineOptions {
        loader: Some(Box::new(loader)),
        ..Default::default()
    })
    .expect("engine");
    let output = engine
        .render(
            RenderTarget::Name("x.tpl"),
            &serde_json::json!({ "a": 2 }),
            &RenderOptions::default(),
        )
        .expect("render");
    assert_eq!(output, "3");
}

/// Every invalid AST of the shared fixture fails with the JSON Pointer of its invalid node (AST-10), which the message
/// names.
#[test]
fn decode_fails_naming_the_json_pointer_of_the_invalid_node() {
    let path = common::repo_root().join("tests/fixtures/ast-decode/invalid.json");
    let fixture: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&path).expect("invalid.json")).expect("invalid.json is JSON");
    let cases = fixture["cases"].as_array().expect("cases");
    assert!(!cases.is_empty(), "invalid.json has no case");
    for case in cases {
        let name = case["name"].as_str().expect("name");
        let pointer = case["path"].as_str().expect("path");
        let json = serde_json::to_string(&case["ast"]).expect("encode");
        let error = decode_template(&json).expect_err(name);
        assert_eq!(error.path(), Some(pointer), "{name}: {error}");
        let shown = if pointer.is_empty() { "the root" } else { pointer };
        assert!(error.to_string().contains(shown), "{name}: {error}");
    }
}

/// The schema that the crate embeds, src/ast.schema.json, is contracts/schema/ast.schema.json byte for byte.
#[test]
fn the_embedded_schema_is_the_contract_schema() {
    let root = common::repo_root();
    let read = |path: &str| std::fs::read(root.join(path)).unwrap_or_else(|error| panic!("{path}: {error}"));
    assert!(
        read("packages/rust/src/ast.schema.json") == read("contracts/schema/ast.schema.json"),
        "packages/rust/src/ast.schema.json differs from contracts/schema/ast.schema.json: copy the contract schema to it"
    );
}

/// Text that is not JSON fails with the error of serde_json and no path.
#[test]
fn decode_fails_on_text_that_is_not_json() {
    let error = decode_template("{").expect_err("{");
    assert!(error.path().is_none(), "{error}");
    assert!(matches!(error, polyspec_template::AstDecodeError::Json(_)), "{error}");
}
