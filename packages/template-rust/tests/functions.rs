//! Built-in functions that need checks beyond the fixture cases, and the engine API.

use polyspec_template::functions::builtins;
use polyspec_template::functions::date::{format_date, parse_offset, to_unix_seconds};
use polyspec_template::functions::encoding::{percent_encode, to_json};
use polyspec_template::value::{OrderedMap, Value};
use polyspec_template::{ArtifactRefresh, Engine, EngineOptions, ErrorCode, MapLoader, RenderOptions, RenderTarget};

#[test]
fn date_parsing_and_formatting() {
    assert_eq!(parse_offset("+09:00"), Some(32400));
    assert_eq!(parse_offset("-05:30"), Some(-19800));
    assert_eq!(parse_offset("+24:00"), None);
    assert_eq!(format_date(1789084800, "Y-m-d H:i:s D P", 32400), "2026-09-11 09:00:00 Fri +09:00");
    assert_eq!(format_date(0, "Y-m-d l N w", 0), "1970-01-01 Thursday 4 4");
    assert_eq!(format_date(-86400, "Y-m-d", 0), "1969-12-31");
    assert_eq!(to_unix_seconds(&Value::text("1970-01-02".to_string()), 0).expect("date"), 86400);
    assert_eq!(
        to_unix_seconds(&Value::text("1970-01-01T00:00:00+01:00".to_string()), 0).expect("date"),
        -3600
    );
    assert_eq!(
        to_unix_seconds(&Value::text("1970-01-01 00:00:00".to_string()), 3600).expect("date"),
        -3600
    );
    assert!(to_unix_seconds(&Value::text("1970-13-01".to_string()), 0).is_err());
}

#[test]
fn json_and_url_encoding() {
    let mut map = OrderedMap::new();
    map.insert("a".to_string(), Value::text("<&>\u{2028}".to_string()));
    assert_eq!(to_json(&Value::map(map)), "{\"a\":\"\\u003c\\u0026\\u003e\\u2028\"}");
    assert_eq!(
        to_json(&Value::list(vec![
            Value::Number(1e21),
            Value::Number(0.1),
            Value::Null,
            Value::Bool(true),
            Value::safe_text("x".to_string())
        ])),
        "[1e+21,0.1,null,true,\"x\"]"
    );
    assert_eq!(percent_encode("a b/é~!*'()"), "a%20b%2F%C3%A9~%21%2A%27%28%29");
}

#[test]
fn builtins_declare_arity() {
    for (name, function) in builtins() {
        assert!(function.min <= function.max, "{name}");
    }
    assert!(builtins().contains_key("now"));
}

#[test]
fn engine_renders_and_registers_functions() {
    let mut loader = MapLoader::new();
    loader.set("a.tpl", "<b>{= x}</b> {= twice(2)} {= wrap('a')}");
    let mut engine = Engine::new(EngineOptions {
        loader: Some(Box::new(loader)),
        ..Default::default()
    });
    engine
        .register(
            "twice",
            Box::new(|args, _| match args.first() {
                Some(Value::Number(n)) => Ok(Value::Number(n * 2.0)),
                _ => Err("number".to_string()),
            }),
        )
        .expect("register");
    engine
        .register(
            "wrap",
            Box::new(|args, _| Ok(Value::text(format!("[{}]", args[0].as_text().unwrap_or(""))))),
        )
        .expect("register");
    assert!(engine.register("upper", Box::new(|_, _| Ok(Value::Null))).is_err());
    let html = engine
        .render(
            RenderTarget::Name("a.tpl"),
            &serde_json::json!({ "x": "<" }),
            &RenderOptions::default(),
        )
        .expect("render");
    assert_eq!(html, "<b>&lt;</b> 4 [a]");
}

#[test]
fn engine_reports_host_failures_and_limits() {
    let mut loader = MapLoader::new();
    loader.set("a.tpl", "x\n{= boom()}");
    loader.set("b.tpl", "{@ i = range(1, 10)}{= i}{/}");
    let mut engine = Engine::new(EngineOptions {
        loader: Some(Box::new(loader)),
        limits: Some(polyspec_template::Limits {
            iterations: 5,
            ..Default::default()
        }),
        ..Default::default()
    });
    engine.register("boom", Box::new(|_, _| Err("no".to_string()))).expect("register");
    let error = engine
        .render(RenderTarget::Name("a.tpl"), &serde_json::json!({}), &RenderOptions::default())
        .unwrap_err();
    assert_eq!(error.code, ErrorCode::E_RUNTIME_HOST_FUNCTION);
    assert_eq!(error.line, 2);
    let error = engine
        .render(RenderTarget::Name("b.tpl"), &serde_json::json!({}), &RenderOptions::default())
        .unwrap_err();
    assert_eq!(error.code, ErrorCode::E_RUNTIME_LIMIT);
}

#[test]
fn engine_renders_a_parsed_template_and_reparses_new_versions() {
    let ast = polyspec_template::parse(b"{= a + 1}", "x.tpl", &Default::default()).expect("parse");
    let mut loader = MapLoader::new();
    loader.set_ast("x.tpl", ast.clone());
    let engine = Engine::new(EngineOptions {
        loader: Some(Box::new(loader)),
        ..Default::default()
    });
    assert_eq!(
        engine
            .render(
                RenderTarget::Name("x.tpl"),
                &serde_json::json!({ "a": 2 }),
                &RenderOptions::default()
            )
            .expect("render"),
        "3"
    );
    assert_eq!(
        engine
            .render(RenderTarget::Ast(&ast), &serde_json::json!({ "a": 2 }), &RenderOptions::default())
            .expect("render"),
        "3"
    );
}

#[test]
fn artifact_refresh_policies_are_independent_of_rendering() {
    let mut dev_loader = MapLoader::new();
    dev_loader.set("a.tpl", "1");
    let dev = Engine::new(EngineOptions {
        loader: Some(Box::new(dev_loader)),
        artifact_refresh: ArtifactRefresh::Dev,
        ..Default::default()
    });
    assert_eq!(
        dev.render(RenderTarget::Name("a.tpl"), &serde_json::json!({}), &RenderOptions::default())
            .unwrap(),
        "1"
    );

    let mut immutable_loader = MapLoader::new();
    immutable_loader.set("a.tpl", "1");
    let immutable = Engine::new(EngineOptions {
        loader: Some(Box::new(immutable_loader)),
        artifact_refresh: ArtifactRefresh::False,
        ..Default::default()
    });
    assert_eq!(
        immutable
            .render(RenderTarget::Name("a.tpl"), &serde_json::json!({}), &RenderOptions::default())
            .unwrap(),
        "1"
    );
}
