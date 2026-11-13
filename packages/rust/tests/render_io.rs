//! RT-77: a render reads no file. The filesystem loader is called by prepare and load, which load the target and the
//! templates that its include and block tags name; a render takes them from the cache of the program.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    reason = "a test states its expectation with unwrap and expect; a failure there is the failure of the test"
)]

mod common;

use polyspec_template::polyspec_json::Value as Json;
use polyspec_template::{AstProgram, EngineOptions, ErrorCode, FsLoader, RenderOptions, RenderTarget};
use std::path::PathBuf;

/// A new directory of the system temporary directory with the files `files`.
fn directory(test: &str, files: &[(&str, &str)]) -> PathBuf {
    let root = std::env::temp_dir().join(format!("template-render-io-{test}-{}", std::process::id()));
    let _removed: std::io::Result<()> = std::fs::remove_dir_all(&root);
    for (name, text) in files {
        let path = root.join(name);
        std::fs::create_dir_all(path.parent().expect("parent")).expect("directory");
        std::fs::write(path, text).expect("file");
    }
    root
}

fn program(root: &PathBuf) -> AstProgram {
    AstProgram::new(EngineOptions {
        loader: Some(Box::new(FsLoader::new(root))),
        ..Default::default()
    })
    .expect("valid engine options")
}

/// A render of a template that prepare or load did not load is load_not_loaded: the render calls no file loader.
#[test]
fn a_render_without_load_reads_no_file() {
    let root = directory("unloaded", &[("page.tpl", "x")]);
    let error = common::kind(
        program(&root)
            .render(RenderTarget::Name("page.tpl"), &Json::null(), &RenderOptions::default())
            .unwrap_err(),
    );
    std::fs::remove_dir_all(&root).expect("cleanup");
    assert_eq!(
        (error.code, error.template.as_str(), error.line),
        (ErrorCode::LoadNotLoaded, "page.tpl", 0)
    );
}

/// prepare loads the target and the templates of its include and block tags, so the prepared render and later renders
/// need no file, even when the files are gone.
#[test]
fn prepare_loads_the_templates_that_the_render_needs() {
    let root = directory(
        "prepare",
        &[
            ("page.tpl", "<{+ part.tpl}|{# parts/b.tpl}>"),
            ("part.tpl", "a"),
            ("parts/b.tpl", "b{+ c.tpl}"),
            ("parts/c.tpl", "c"),
        ],
    );
    let program = program(&root);
    let prepared = program
        .prepare(RenderTarget::Name("page.tpl"), &Json::null(), &RenderOptions::default())
        .expect("prepare");
    std::fs::remove_dir_all(&root).expect("cleanup");
    assert_eq!(prepared.render().expect("prepared render"), "<a|bc>");
    assert_eq!(
        program
            .render(RenderTarget::Name("page.tpl"), &Json::null(), &RenderOptions::default())
            .expect("render"),
        "<a|bc>"
    );
}

/// A template that an include names and that does not load fails only the render that reaches its tag, with the error
/// of its load at the tag.
#[test]
fn a_missing_include_fails_the_render_that_reaches_it() {
    let root = directory("missing", &[("page.tpl", "{? flag}{+ missing.tpl}{/}ok")]);
    let program = program(&root);
    let prepared = program
        .prepare(RenderTarget::Name("page.tpl"), &Json::null(), &RenderOptions::default())
        .expect("prepare");
    assert_eq!(prepared.render().expect("the include is not reached"), "ok");
    let assign = polyspec_template::polyspec_json::parse(br#"{"flag": true}"#, &Default::default()).expect("JSON");
    let error = common::kind(
        program
            .render(RenderTarget::Name("page.tpl"), &assign, &RenderOptions::default())
            .unwrap_err(),
    );
    std::fs::remove_dir_all(&root).expect("cleanup");
    assert_eq!(
        (error.code, error.template.as_str(), error.line, error.col),
        (ErrorCode::LoadNotFound, "page.tpl", 1, 9)
    );
}
