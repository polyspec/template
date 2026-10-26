//! RT-72: the public entry points of the API resolve through the public items of the crate.

// A use declaration resolves a public item; it fails to compile for a name the crate does not export.
use polyspec_template::ParseOptions;
#[allow(unused_imports, reason = "the use declarations check the public items")]
use polyspec_template::{
    AstProgram, BoundMap, Engine, Loader, PreparedRender, Program, RuntimeEnvironment, TemplateError, bind, decode_template, merge, parse,
    parse_json,
};

/// RT-1: the entry points of the API, which the implementation declares, are public items.
#[test]
fn the_entry_points_of_the_api_are_public_items() {
    parse(b"{= a}", "a.tpl", &ParseOptions::default()).expect("the template parses");
    let bound = bind(&serde_json::json!({ "a": 1 })).expect("a JSON map binds to a bound map");
    let _merged: BoundMap = merge(&bound, &bound);
    assert!(parse_json("{}").is_ok());
}

// RT-74: loaders created through a public module and values bound through the SDK root
// share one runtime with the root program.
#[test]
fn the_entry_points_share_one_runtime() {
    use polyspec_template::{AstProgram, EngineOptions, MapLoader, RenderOptions, RenderTarget};
    let first: BoundMap = bind(&serde_json::json!({ "a": "x", "list": [1, 2] })).expect("bind");
    let second: BoundMap = bind(&serde_json::json!({ "b": 1 })).expect("bind");
    let mut loader: MapLoader = polyspec_template::loader::MapLoader::new();
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
    assert_eq!(render(&first), "x12", "bound map with module loader");
    assert_eq!(render(&merge(&first, &second)), "x12", "merged by merge");
    assert_eq!(render(&merge(&second, &first)), "x12", "module loader accepts merged bound data");
}
