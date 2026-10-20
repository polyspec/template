//! RT-72: the public entry points of the API resolve through the public items of the crate.

// A use declaration resolves a public item; it fails to compile for a name the crate does not export.
use polyspec_template::ParseOptions;
#[allow(unused_imports, reason = "the use declarations check the public items")]
use polyspec_template::{
    AstProgram, BoundMap, Engine, Loader, PreparedRender, Program, RuntimeEnvironment, TemplateError, bind, decode_template, merge, parse,
    parse_json,
};

#[test]
fn the_entry_points_of_the_api_are_public_items() {
    parse(b"{= a}", "a.tpl", &ParseOptions::default()).expect("the template parses");
    let bound = bind(&serde_json::json!({ "a": 1 })).expect("a JSON map binds to a bound map");
    let _merged: BoundMap = merge(&bound, &bound);
    assert!(parse_json("{}").is_ok());
}

// RT-74: the modules of the crate share one runtime. The functions and types of the root are those of the modules that
// define them, so a bound map that one path creates is the bound map of the other, and a program renders it.
#[test]
fn the_entry_points_share_one_runtime() {
    use polyspec_template::{AstProgram, EngineOptions, MapLoader, RenderOptions, RenderTarget};
    let from_module: BoundMap = polyspec_template::value::bound::bind(&serde_json::json!({ "a": "x", "list": [1, 2] })).expect("bind");
    let from_root: polyspec_template::value::bound::BoundMap = bind(&serde_json::json!({ "b": 1 })).expect("bind");
    let mut loader = MapLoader::new();
    loader.set("page.tpl", "{= a}{@ x = list}{= x}{/}");
    let program = AstProgram::new(EngineOptions {
        loader: Some(Box::new(loader)),
        ..Default::default()
    })
    .expect("valid engine options");
    let render = |assign: &BoundMap| {
        program
            .render_bound(RenderTarget::Name("page.tpl"), assign, &RenderOptions::default())
            .expect("render")
    };
    assert_eq!(render(&from_module), "x12", "value::bound::bind");
    assert_eq!(render(&merge(&from_module, &from_root)), "x12", "merged by merge");
    assert_eq!(
        render(&polyspec_template::value::bound::merge(&from_root, &from_module)),
        "x12",
        "merged by value::bound::merge"
    );
}
