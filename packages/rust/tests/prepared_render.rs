//! RT-62: a prepared render renders identical bytes on every call, and render is prepare(...).render().

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    reason = "a test states its expectation with unwrap and expect; a failure there is the failure of the test"
)]

mod common;

use binding_core::Io;
use polyspec_template::artifact::load_artifact;
use polyspec_template::{RenderOptions, RenderTarget};

#[test]
fn prepared_render_is_the_single_call_render() {
    let directory = common::repo_root()
        .join("tests")
        .join("fixtures")
        .join("artifact-runtime")
        .join("artifact");
    let program = load_artifact(&directory).expect("load the artifact");
    let assign = common::ojson(serde_json::json!({ "x": "a<b" }));
    let options = RenderOptions::default();
    let prepared = program
        .prepare(Io::for_generated_call(), RenderTarget::Name("page.tpl"), &assign, &options)
        .expect("prepare");
    let first = prepared.render().expect("render");
    assert_eq!(prepared.render().expect("render"), first);
    assert_eq!(
        program.render(RenderTarget::Name("page.tpl"), &assign, &options).expect("render"),
        first
    );
}
