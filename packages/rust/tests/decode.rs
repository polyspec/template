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

/// An invalid AST fails with the path of its first invalid value, which ends at the statement node that holds it, and
/// a message that names the field.
#[test]
fn decode_fails_naming_the_path_of_the_first_invalid_value() {
    for (json, path, reason) in [
        (r#"{"type":"Template","name":"x","body":[]}"#, ".", "comments"),
        (r#"{"type":"Text","name":"x","body":[],"comments":[]}"#, "type", "Template"),
        (
            r#"{"type":"Template","name":"x","body":[{"type":"Bogus","span":[0,1]}],"comments":[]}"#,
            "body[0].type",
            "Bogus",
        ),
        (
            r#"{"type":"Template","name":"x","body":[{"type":"Text","value":"a","span":[0,1],"extra":1}],"comments":[]}"#,
            "body[0]",
            "extra",
        ),
        (
            r#"{"type":"Template","name":"x","body":[{"type":"Echo","expr":{"type":"Var","name":"a"},"span":[0,1]}],"comments":[]}"#,
            "body[0]",
            "span",
        ),
        (
            r#"{"type":"Template","name":"x","body":[{"type":"If","branches":[{"body":[],"span":[0,1]}],"span":[0,1]}],"comments":[]}"#,
            "body[0]",
            "test",
        ),
        (
            r#"{"type":"Template","name":"x","body":[{"type":"If","branches":[],"span":[0,1]}],"comments":[]}"#,
            "body[0]",
            "else",
        ),
        (
            r#"{"type":"Template","name":"x","body":[{"type":"Text","value":"a","span":[-1,1]}],"comments":[]}"#,
            "body[0]",
            "-1",
        ),
    ] {
        let error = decode_template(json).expect_err(json);
        assert_eq!(error.path(), path, "{json}: {error}");
        let message = error.to_string();
        assert!(message.contains(path) && message.contains(reason), "{json}: {message}");
    }
}
