//! RT-70 and VAL-22: renders of one program may run at the same time, and each reads one bound map and produces the
//! bytes of the shared fixture. Eight threads render the same bound map through one program.

mod common;

use polyspec_template::{AstProgram, BoundMap, EngineOptions, MapLoader, RenderOptions, RenderTarget, bind};
use std::path::PathBuf;

fn fixture_dir() -> PathBuf {
    common::repo_root().join("tests").join("fixtures").join("bound-data")
}

fn program() -> AstProgram {
    let mut loader = MapLoader::new();
    for name in ["page.tpl", "define.tpl", "part.tpl", "empty.tpl", "result.tpl"] {
        loader.set(name, &std::fs::read_to_string(fixture_dir().join(name)).expect("fixture template"));
    }
    AstProgram::new(EngineOptions {
        loader: Some(Box::new(loader)),
        ..Default::default()
    })
    .expect("valid engine options")
}

#[test]
fn concurrent_renders_read_one_bound_map() {
    let cases: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(fixture_dir().join("cases.json")).expect("cases.json")).expect("JSON");
    let expected = cases["outputs"]["page"].as_str().expect("page output").to_string();
    let bound: BoundMap = bind(&cases["assign"]).expect("bind");
    let program = program();
    let options = RenderOptions::default();
    std::thread::scope(|scope| {
        let handles: Vec<_> = (0..8)
            .map(|_| scope.spawn(|| program.render_bound(RenderTarget::Name("page.tpl"), &bound, &options).expect("render")))
            .collect();
        for handle in handles {
            assert_eq!(handle.join().expect("thread"), expected);
        }
    });
}
