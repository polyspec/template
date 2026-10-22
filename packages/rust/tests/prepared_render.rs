//! RT-62: a prepared render renders identical bytes on every call, and render is prepare(...).render().

mod common;

use polyspec_template::artifact::load_artifact;
use polyspec_template::{RenderOptions, RenderTarget};

#[test]
fn prepared_render_is_the_single_call_render() {
    let directory = common::repo_root().join("tests").join("fixtures").join("artifact-runtime").join("artifact");
    let program = load_artifact(&directory).expect("load the artifact");
    let assign = serde_json::json!({ "x": "a<b" });
    let options = RenderOptions::default();
    let prepared = program.prepare(RenderTarget::Name("page.tpl"), &assign, &options).expect("prepare");
    let first = prepared.render().expect("render");
    assert_eq!(prepared.render().expect("render"), first);
    assert_eq!(program.render(RenderTarget::Name("page.tpl"), &assign, &options).expect("render"), first);
}
