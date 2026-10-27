//! The map loader and the resolution of template paths: a map loader returns the source of a name that it holds with a
//! version (RT-10), and a path resolves against the directory of the current template and fails when it leaves the root
//! (RT-8).

use polyspec_template::{AstProgram, EngineOptions, ErrorCode, Loaded, Loader, MapLoader, RenderOptions, RenderTarget, ParseOptions, parse, resolve_path};

/// RT-9, RT-10: a map loader returns a held source with its version, and nothing for another name.
#[test]
fn a_map_loader_returns_a_held_source_with_a_version_and_nothing_for_another_name() {
    let mut loader = MapLoader::new();
    loader.set("a.tpl", "x");
    match loader.load("a.tpl") {
        Ok(Some(Loaded::Source { bytes, version })) => {
            assert_eq!(bytes, b"x".to_vec());
            assert!(!version.is_empty());
        }
        other => panic!("a.tpl: {other:?}"),
    }
    assert!(matches!(loader.load("b.tpl"), Ok(None)));
}

/// RT-8: a path resolves against the directory of the current template, a leading / against the root, and a path that
/// leaves the root fails with E_LOAD_OUTSIDE_ROOT.
#[test]
fn a_path_resolves_against_the_current_directory_and_fails_outside_the_root() {
    for (current, path, expected) in [
        ("a/b.tpl", "c.tpl", "a/c.tpl"),
        ("a/b.tpl", "../c.tpl", "c.tpl"),
        ("a/b.tpl", "/x/y.tpl", "x/y.tpl"),
        ("b.tpl", "./c.tpl", "c.tpl"),
    ] {
        assert_eq!(resolve_path(current, path).expect("resolved"), expected, "{current} {path}");
    }
    assert!(resolve_path("a.tpl", "../x.tpl").is_err());
    let mut loader = MapLoader::new();
    loader.set("o.tpl", "{+ ../z.tpl}");
    let program = AstProgram::new(EngineOptions {
        loader: Some(Box::new(loader)),
        ..Default::default()
    })
    .expect("valid engine options");
    let error = program
        .render(RenderTarget::Name("o.tpl"), &serde_json::json!({}), &RenderOptions::default())
        .unwrap_err();
    assert_eq!(error.code, ErrorCode::E_LOAD_OUTSIDE_ROOT);
}

/// RT-10, RT-40: native result variants retain payloads and version content changes.
#[test]
fn map_loader_versions_source_and_ast_replacements_by_content() {
    let mut loader: polyspec_template::loader::MapLoader = MapLoader::new();
    let _: &dyn polyspec_template::loader::Loader = &loader;
    for ast in [false, true] {
        let mut versions = Vec::new();
        for text in ["first", "second", "second"] {
            let tree = parse(text.as_bytes(), "a.tpl", &ParseOptions::default()).unwrap();
            if ast { loader.set_ast("a.tpl", tree.clone()); }
            else { loader.set("a.tpl", text); }
            let result: polyspec_template::loader::Loaded = loader.load("a.tpl").unwrap().unwrap();
            assert!(!result.version().is_empty());
            versions.push(result.version().to_string());
            match result {
                Loaded::Ast { ast: value, .. } if ast => assert_eq!(value, tree),
                Loaded::Source { bytes, .. } if !ast => assert_eq!(bytes, text.as_bytes()),
                other => panic!("wrong payload: {other:?}"),
            }
        }
        assert_ne!(versions[0], versions[1]);
        assert_eq!(versions[1], versions[2]);
    }
}
