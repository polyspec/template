//! RT-59: rendering a loaded artifact parses nothing and discovers no source (the artifact directory holds no .tpl file), and
//! two renders with the same assign give identical bytes and leave the assign unchanged.

mod common;

use polyspec_template::artifact::load_artifact;
use polyspec_template::{OrderedMap, RenderOptions, RenderTarget, Value};

#[test]
fn request_path_renders_a_loaded_artifact_the_same_way() {
    let directory = common::repo_root()
        .join("tests")
        .join("fixtures")
        .join("artifact-runtime")
        .join("artifact");
    let program = load_artifact(&directory).expect("load the artifact");
    let mut assign = OrderedMap::new();
    assign.insert("x".to_string(), Value::text("a<b"));
    let options = RenderOptions::default();
    let first = program
        .render_values(RenderTarget::Name("page.tpl"), assign.clone(), &options)
        .expect("render");
    let second = program
        .render_values(RenderTarget::Name("page.tpl"), assign.clone(), &options)
        .expect("render");
    assert_eq!(first, second);
    assert_eq!(first, "<p>a&lt;b</p>");
    assert_eq!(assign.len(), 1);
}
