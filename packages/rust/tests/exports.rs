//! RT-72: the public entry points of the API resolve through the public items of the crate.

// A use declaration resolves a public item; it fails to compile for a name the crate does not export.
use polyspec_template::ParseOptions;
#[allow(unused_imports)]
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
