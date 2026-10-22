//! RT-56: the artifact that the build compiler wrote loads through load_artifact and renders with the bytes of its source.
//! The fixture is the output of compileAst of tests/fixtures/artifact-runtime.

mod common;

use polyspec_template::{OrderedMap, RenderOptions, RenderTarget, Value, artifact::load_artifact};

#[test]
fn load_artifact_renders_the_source_bytes() {
    let directory = common::repo_root().join("tests").join("fixtures").join("artifact-runtime").join("artifact");
    let program = load_artifact(&directory).expect("load the artifact");
    let mut root = OrderedMap::new();
    root.insert("x".to_string(), Value::text("a<b"));
    assert_eq!(
        program
            .render_values(RenderTarget::Name("page.tpl"), root, &RenderOptions::default())
            .expect("render"),
        "<p>a&lt;b</p>"
    );
}
