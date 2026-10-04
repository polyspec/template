//! Bound data (VAL-22, ERR-14, RT-61) with the shared fixture of tests/fixtures/bound-data/cases.json.
//!
//! A bound map is a type of its own that no `Value` and no `serde_json::Value` can hold (VAL-16), so
//! the rejected positions of the fixture cannot be written in Rust and have no test here. The key
//! order of a bound map is not observable through the public interface of the crate, so the merge
//! test checks the precedence of RT-26 through the output.

mod common;

use polyspec_template::{
    AstProgram, BoundMap, DefineData, DefineInput, EngineOptions, ErrorCode, MapLoader, OrderedMap, RenderOptions, RenderTarget,
    TemplateError, Value, bind, merge,
};
use std::collections::HashMap;
use std::path::PathBuf;

fn fixture_dir() -> PathBuf {
    common::repo_root().join("tests").join("fixtures").join("bound-data")
}

fn cases() -> serde_json::Value {
    serde_json::from_str(&std::fs::read_to_string(fixture_dir().join("cases.json")).expect("cases.json")).expect("cases.json is JSON")
}

fn output(cases: &serde_json::Value, name: &str) -> String {
    cases["outputs"][name].as_str().expect("output").to_string()
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
}

fn definition(data: DefineData) -> RenderOptions {
    RenderOptions {
        define: HashMap::from([(
            "part".to_string(),
            DefineInput {
                template: Some("part.tpl".to_string()),
                data: Some(data),
                html: None,
            },
        )]),
        env: None,
    }
}

fn bound(input: &serde_json::Value) -> BoundMap {
    bind(input).expect("bind")
}

fn expect_bind_failure(result: Result<BoundMap, TemplateError>, code: ErrorCode) {
    let error = result.err().expect("bind fails");
    assert_eq!(
        (error.code, error.template.as_str(), error.line, error.col, error.offset, error.end),
        (code, "", 0, 0, 0, 0),
        "{error:?}"
    );
}

#[test]
fn a_bound_map_renders_the_bytes_of_the_host_map() {
    let cases = cases();
    let program = program();
    let page = RenderTarget::Name("page.tpl");
    let options = RenderOptions::default();
    assert_eq!(
        program
            .render_bound(RenderTarget::Name("page.tpl"), &bound(&cases["assign"]), &options)
            .unwrap(),
        output(&cases, "page")
    );
    assert_eq!(program.render(page, &cases["assign"], &options).unwrap(), output(&cases, "page"));
    let assign = bound(&cases["assign"]);
    let prepared = program.prepare_bound(RenderTarget::Name("page.tpl"), &assign, &options).unwrap();
    assert_eq!(prepared.render().unwrap(), output(&cases, "page"));
    assert_eq!(prepared.render().unwrap(), output(&cases, "page"));
}

#[test]
fn bind_accepts_a_host_built_map_and_keeps_its_native_values() {
    let cases = cases();
    let mut root = OrderedMap::new();
    root.insert("a".to_string(), Value::text("1"));
    root.insert("b".to_string(), Value::safe_text("x"));
    root.insert("list".to_string(), Value::list(vec![Value::Number(1.0), Value::Number(2.0)]));
    root.insert(
        "m".to_string(),
        Value::map([("k".to_string(), Value::text("v"))].into_iter().collect()),
    );
    let program = program();
    let options = RenderOptions::default();
    assert_eq!(
        program
            .render_bound(RenderTarget::Name("page.tpl"), &bind(&root).unwrap(), &options)
            .unwrap(),
        output(&cases, "page")
    );
    assert_eq!(
        program.render_values(RenderTarget::Name("page.tpl"), root, &options).unwrap(),
        output(&cases, "page")
    );
}

#[test]
fn bind_of_a_bound_map_renders_the_same_map() {
    let cases = cases();
    let first = bound(&cases["assign"]);
    let again = bind(&first).unwrap();
    assert_eq!(
        program()
            .render_bound(RenderTarget::Name("page.tpl"), &again, &RenderOptions::default())
            .unwrap(),
        output(&cases, "page")
    );
}

#[test]
fn merge_follows_the_precedence_of_rt_26() {
    let cases = cases();
    let merged = merge(&bound(&cases["assign"]), &bound(&cases["second"]));
    assert_eq!(
        program()
            .render_bound(RenderTarget::Name("page.tpl"), &merged, &RenderOptions::default())
            .unwrap(),
        output(&cases, "merged")
    );
}

#[test]
fn a_bound_map_is_definition_data() {
    let cases = cases();
    let program = program();
    let bound_data = definition(DefineData::Bound(bound(&cases["definitionData"])));
    assert_eq!(
        program
            .render(RenderTarget::Name("define.tpl"), &cases["assign"], &bound_data)
            .unwrap(),
        output(&cases, "define")
    );
    let host_data = definition(DefineData::Value(polyspec_template::bind_json(&cases["definitionData"]).unwrap()));
    assert_eq!(
        program
            .render(RenderTarget::Name("define.tpl"), &cases["assign"], &host_data)
            .unwrap(),
        output(&cases, "define")
    );
}

#[test]
fn null_and_an_empty_map_give_an_empty_bound_map() {
    let cases = cases();
    for input in [serde_json::Value::Null, serde_json::json!({})] {
        assert_eq!(
            program()
                .render_bound(RenderTarget::Name("empty.tpl"), &bound(&input), &RenderOptions::default())
                .unwrap(),
            output(&cases, "empty")
        );
    }
}

#[test]
fn bind_reports_the_code_of_the_failed_check_without_a_position() {
    for input in [serde_json::json!(5), serde_json::json!([1]), serde_json::json!("{\"a\":1}")] {
        expect_bind_failure(bind(&input), ErrorCode::E_DATA_UNSUPPORTED_TYPE);
    }
    expect_bind_failure(
        bind(&serde_json::json!({ "n": 9007199254740992u64 })),
        ErrorCode::E_DATA_NUMBER_RANGE,
    );
    let mut deep = serde_json::json!(1);
    for _ in 0..65 {
        deep = serde_json::json!([deep]);
    }
    expect_bind_failure(bind(&serde_json::json!({ "deep": deep })), ErrorCode::E_DATA_DEPTH);
    let mut host = OrderedMap::new();
    host.insert("n".to_string(), Value::Number(f64::NAN));
    expect_bind_failure(bind(&host), ErrorCode::E_DATA_NUMBER_NOT_FINITE);
}
