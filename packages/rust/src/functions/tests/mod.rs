//! Built-in functions that need checks beyond the fixture cases, and the engine API.

use crate::functions::builtins;
use crate::functions::date::{format_date, parse_offset, to_unix_seconds};
use crate::functions::encoding::{percent_encode, to_json};
use crate::value::{OrderedMap, Value};
use crate::{
    ArtifactRefresh, AstProgram, EngineOptions, ErrorCode, Functions, HostFunction, Limits, Loaded, Loader, MapLoader, RenderOptions,
    RenderTarget, RuntimeEnvironment,
};
use std::sync::{Arc, Mutex};

/// FUN-39: the output is computed in the fixed offset of the time zone; FUN-40: the format tokens.
#[test]
fn date_parsing_and_formatting() {
    assert_eq!(parse_offset("+09:00"), Some(32400));
    assert_eq!(parse_offset("-05:30"), Some(-19800));
    assert_eq!(parse_offset("+24:00"), None);
    assert_eq!(
        format_date(1789084800, "Y-m-d H:i:s D P", 32400).expect("format"),
        "2026-09-11 09:00:00 Fri +09:00"
    );
    assert_eq!(format_date(0, "Y-m-d l N w", 0).expect("format"), "1970-01-01 Thursday 4 4");
    assert_eq!(format_date(-86400, "Y-m-d", 0).expect("format"), "1969-12-31");
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

/// FUN-37: a day beyond the days of its month is no date; February 29 exists only in a leap year.
#[test]
fn date_text_names_a_day_of_its_month() {
    assert!(to_unix_seconds(&Value::text("2025-02-29"), 0).is_err());
    assert!(to_unix_seconds(&Value::text("1900-02-29"), 0).is_err());
    assert!(to_unix_seconds(&Value::text("2024-04-31"), 0).is_err());
    assert!(to_unix_seconds(&Value::text("2024-02-29"), 0).is_ok());
    assert!(to_unix_seconds(&Value::text("2000-02-29"), 0).is_ok());
}

/// FUN-50: an integer argument has no fraction and a magnitude of at most 2^53 − 1; a count is not negative.
#[test]
fn integer_arguments_are_never_truncated_or_clamped() {
    use crate::functions::helpers::{arg_count, arg_integer};
    assert_eq!(arg_integer(&Value::Number(-3.0)).expect("integer"), -3);
    assert_eq!(arg_integer(&Value::text("7")).expect("integer"), 7);
    assert_eq!(arg_integer(&Value::Number(1.5)).unwrap_err().code, ErrorCode::RuntimeType);
    assert_eq!(
        arg_integer(&Value::Number(9007199254740992.0)).unwrap_err().code,
        ErrorCode::RuntimeLimit
    );
    assert_eq!(arg_integer(&Value::Number(-1e300)).unwrap_err().code, ErrorCode::RuntimeLimit);
    assert_eq!(arg_count(&Value::Number(-1.0)).unwrap_err().code, ErrorCode::RuntimeType);
    assert_eq!(arg_count(&Value::Number(2.0)).expect("count"), 2);
    assert_eq!(to_unix_seconds(&Value::Number(1.5), 0).unwrap_err().code, ErrorCode::RuntimeType);
}

#[test]
fn date_text_with_an_offset_out_of_range_is_not_a_date() {
    assert!(to_unix_seconds(&Value::text("2024-01-01T12:00:00+25:00".to_string()), 0).is_err());
    assert!(to_unix_seconds(&Value::text("2024-01-01T12:00:00+05:60".to_string()), 0).is_err());
}

#[test]
fn json_and_url_encoding() {
    let mut map = OrderedMap::new();
    map.insert("a".to_string(), Value::text("<&>\u{2028}".to_string()));
    assert_eq!(to_json(&Value::map(map)).unwrap(), "{\"a\":\"\\u003c\\u0026\\u003e\\u2028\"}");
    assert_eq!(
        to_json(&Value::list(vec![
            Value::Number(1e21),
            Value::Number(0.1),
            Value::Null,
            Value::Bool(true),
            Value::safe_text("x".to_string())
        ]))
        .unwrap(),
        "[1e+21,0.1,null,true,\"x\"]"
    );
    assert_eq!(percent_encode("a b/é~!*'()"), "a%20b%2F%C3%A9~%21%2A%27%28%29");
}

/// FUN-3: the number of arguments is checked at evaluation time against the declared minimum and maximum.
#[test]
fn builtins_declare_arity() {
    for (name, function) in builtins() {
        assert!(function.min <= function.max, "{name}");
    }
    assert!(builtins().contains_key("now"));
    for source in ["{= upper()}", "{= upper('a', 'b')}"] {
        let mut loader = MapLoader::new();
        loader.set("a.tpl", source);
        let program = AstProgram::new(EngineOptions {
            loader: Some(Box::new(loader)),
            ..Default::default()
        })
        .expect("engine");
        let error = program
            .render(
                RenderTarget::Name("a.tpl"),
                &ojson(serde_json::json!({})),
                &RenderOptions::default(),
            )
            .map_err(kind)
            .expect_err(source);
        assert_eq!(error.code, ErrorCode::RuntimeArity, "{source}");
    }
}

#[test]
fn engine_renders_and_registers_functions() {
    let mut loader = MapLoader::new();
    loader.set("a.tpl", "<b>{= x}</b> {= twice(2)} {= wrap('a')}");
    let mut engine = AstProgram::new(EngineOptions {
        loader: Some(Box::new(loader)),
        ..Default::default()
    })
    .expect("valid engine options");
    engine
        .register(
            "twice",
            Box::new(|args, _| match args.first() {
                Some(Value::Number(n)) => Ok(Value::Number(n * 2.0)),
                _ => Err("number".into()),
            }),
        )
        .expect("register");
    engine
        .register(
            "wrap",
            Box::new(|args, _| Ok(Value::text(format!("[{}]", args[0].as_text().expect("wrap receives a string"))))),
        )
        .expect("register");
    assert!(engine.register("upper", Box::new(|_, _| Ok(Value::Null))).is_err());
    let html = engine
        .render(
            RenderTarget::Name("a.tpl"),
            &ojson(serde_json::json!({ "x": "<" })),
            &RenderOptions::default(),
        )
        .expect("render");
    assert_eq!(html, "<b>&lt;</b> 4 [a]");
}

/// FUN-46: an error that a host function reports fails the render with runtime_host_function at the position of its call.
/// RT-20: exceeding the iteration limit fails with runtime_limit.
#[test]
fn engine_reports_host_failures_and_limits() {
    let mut loader = MapLoader::new();
    loader.set("a.tpl", "x\n{= boom()}");
    loader.set("b.tpl", "{@ i = range(1, 10)}{= i}{/}");
    let mut engine = AstProgram::new(EngineOptions {
        loader: Some(Box::new(loader)),
        limits: Some(crate::Limits {
            iterations: 5,
            ..Default::default()
        }),
        ..Default::default()
    })
    .expect("valid engine options");
    engine.register("boom", Box::new(|_, _| Err("no".into()))).expect("register");
    let error = engine
        .render(
            RenderTarget::Name("a.tpl"),
            &ojson(serde_json::json!({})),
            &RenderOptions::default(),
        )
        .unwrap_err();
    // FUN-46: the error of the host function reaches the caller unchanged.
    match error {
        crate::RenderError::Callback(error) => assert_eq!(error.to_string(), "no"),
        other => panic!("expected the error of the host function, got {other:?}"),
    }
    let error = engine
        .render(
            RenderTarget::Name("b.tpl"),
            &ojson(serde_json::json!({})),
            &RenderOptions::default(),
        )
        .map_err(kind)
        .unwrap_err();
    assert_eq!(error.code, ErrorCode::RuntimeLimit);
}

// RT-33: the default limits; RT-35: the output size is checked as the output is written, and exceeding it fails;
// RT-36: a failed render aborts and returns no partial output.
#[test]
fn render_limits_default_output_and_abort() {
    for index in 0..4 {
        let mut configured = Limits::default();
        match index {
            0 => configured.iterations = 7,
            1 => configured.depth = 7,
            2 => configured.output_bytes = 7,
            _ => configured.expression_depth = 7,
        }
        let environment = RuntimeEnvironment::new(Some(configured), Default::default()).expect("valid limits");
        assert_eq!(environment.limits, configured);
    }
    let Limits {
        iterations,
        depth,
        output_bytes,
        expression_depth,
    } = Limits::default();
    assert_eq!(
        (iterations, depth, output_bytes, expression_depth),
        (1_000_000, 32, 16 * 1024 * 1024, 64)
    );
    let program = |output_bytes: usize| {
        let mut loader = MapLoader::new();
        loader.set("a.tpl", "ab{= 'cd'}");
        AstProgram::new(EngineOptions {
            loader: Some(Box::new(loader)),
            limits: Some(Limits {
                output_bytes,
                ..Limits::default()
            }),
            ..Default::default()
        })
        .expect("valid engine options")
    };
    let html = program(4)
        .render(
            RenderTarget::Name("a.tpl"),
            &ojson(serde_json::json!({})),
            &RenderOptions::default(),
        )
        .expect("render");
    assert_eq!(html, "abcd");
    let error = program(3)
        .render(
            RenderTarget::Name("a.tpl"),
            &ojson(serde_json::json!({})),
            &RenderOptions::default(),
        )
        .map_err(kind)
        .unwrap_err();
    assert_eq!((error.code, error.line, error.col), (ErrorCode::RuntimeLimit, 1, 3));
}

fn templates(sources: &[(&str, &str)]) -> MapLoader {
    let mut loader = MapLoader::new();
    for (name, source) in sources {
        loader.set(name, source);
    }
    loader
}

/// FUN-43, FUN-44, FUN-45, FUN-47, FUN-48, VAL-7: registration, a refused built-in name, a replaced function, the binding of a result, the same names in every host and a plain string result.
#[test]
fn host_function_rules() {
    let sources = [("a.tpl", "{= tag()}"), ("b.tpl", "{= two()}"), ("c.tpl", "{= big()}")];
    let mut engine = AstProgram::new(EngineOptions {
        loader: Some(Box::new(templates(&sources))),
        ..Default::default()
    })
    .expect("valid engine options");
    engine
        .register("tag", Box::new(|_, _| Ok(Value::text("<b>".to_string()))))
        .expect("register");
    let html = engine
        .render(
            RenderTarget::Name("a.tpl"),
            &ojson(serde_json::json!({})),
            &RenderOptions::default(),
        )
        .expect("render");
    assert_eq!(html, "&lt;b&gt;");
    assert!(engine.register("upper", Box::new(|_, _| Ok(Value::Null))).is_err());
    engine
        .register("two", Box::new(|_, _| Ok(Value::text("first".to_string()))))
        .expect("register");
    engine
        .register("two", Box::new(|_, _| Ok(Value::text("second".to_string()))))
        .expect("register");
    let html = engine
        .render(
            RenderTarget::Name("b.tpl"),
            &ojson(serde_json::json!({})),
            &RenderOptions::default(),
        )
        .expect("render");
    assert_eq!(html, "second");
    engine
        .register("big", Box::new(|_, _| Ok(Value::list(vec![Value::Number(1e19)]))))
        .expect("register");
    let error = engine
        .render(
            RenderTarget::Name("c.tpl"),
            &ojson(serde_json::json!({})),
            &RenderOptions::default(),
        )
        .map_err(kind)
        .unwrap_err();
    assert_eq!(error.code, ErrorCode::DataNumberRange);
    let other = AstProgram::new(EngineOptions {
        loader: Some(Box::new(templates(&sources))),
        ..Default::default()
    })
    .expect("valid engine options");
    let error = other
        .render(
            RenderTarget::Name("a.tpl"),
            &ojson(serde_json::json!({})),
            &RenderOptions::default(),
        )
        .map_err(kind)
        .unwrap_err();
    assert_eq!(error.code, ErrorCode::RuntimeUnknownFunction);
}

/// RT-5, FUN-43, FUN-44: the functions of the options are registered as `register` registers them, so a name that is no
/// identifier or a built-in fails the creation of the program and of the runtime, as in the other languages.
#[test]
fn the_functions_of_the_options_are_registered_as_register_registers_them() {
    fn no_op() -> HostFunction {
        Box::new(|_, _| Ok(Value::Null))
    }
    let functions = |name: &str| std::collections::HashMap::from([(name.to_string(), no_op())]);
    let options = |name: &str| {
        let mut functions = Functions::new();
        functions.insert(name.to_string(), Box::new(|_, _| Ok(Value::Null)));
        EngineOptions {
            functions: Some(functions),
            ..Default::default()
        }
    };
    let error = AstProgram::new(options("not a name")).err().expect("a name that is no identifier");
    assert_eq!(error.message, "\"not a name\" is not an identifier");
    let error = AstProgram::new(options("length")).err().expect("a built-in name");
    assert_eq!(error.message, "length is a built-in function");
    let error = RuntimeEnvironment::new(None, functions("not a name"))
        .err()
        .expect("a name that is no identifier");
    assert_eq!(error.message, "\"not a name\" is not an identifier");
    let error = RuntimeEnvironment::new(None, functions("length")).err().expect("a built-in name");
    assert_eq!(error.message, "length is a built-in function");
    assert!(RuntimeEnvironment::new(None, functions("f")).is_ok());
    assert!(AstProgram::new(options("f")).is_ok());
}

/// RT-5, RT-6: the options of a program hold the four limits of RT-33 and the functions that RT-5 lists, so a field that the
/// spec does not list fails to compile, and a function name that is a built-in fails the creation of the program.
#[test]
fn the_options_of_a_program_hold_only_the_limits_and_functions_of_the_spec() {
    let Limits {
        iterations,
        depth,
        output_bytes,
        expression_depth,
    } = Limits::default();
    assert_eq!(
        (iterations, depth, output_bytes, expression_depth),
        (1_000_000, 32, 16 * 1024 * 1024, 64)
    );
    let mut functions = Functions::new();
    functions.insert("length".to_string(), Box::new(|_, _| Ok(Value::Null)));
    let error = AstProgram::new(EngineOptions {
        functions: Some(functions),
        ..Default::default()
    })
    .err()
    .expect("a built-in name");
    assert_eq!(error.message, "length is a built-in function");
}

/// RT-4: a define or an env of the request that is no object fails with data_unsupported_type, named by its message.
#[test]
fn the_request_options_that_are_no_object_fail() {
    let Err(error) = crate::defines_from_json(&ojson(serde_json::json!("b.tpl"))) else {
        panic!("a define that is no object");
    };
    assert_eq!(error.code, ErrorCode::DataUnsupportedType);
    assert_eq!(error.message, "define is not an object");
    let Err(error) = crate::env_from_json(&ojson(serde_json::json!(0))) else {
        panic!("an env that is no object");
    };
    assert_eq!(error.code, ErrorCode::DataUnsupportedType);
    assert_eq!(error.message, "env is not an object");
}

/// FUN-9: a safe string compares, concatenates and stringifies as its text.
#[test]
fn a_safe_string_is_its_text() {
    let program = AstProgram::new(EngineOptions {
        loader: Some(Box::new(templates(&[(
            "a.tpl",
            "{= raw('<b>') == '<b>'}|{= raw('<b>') + '!'}|{= str(raw('<i>'))}",
        )]))),
        ..Default::default()
    })
    .expect("valid engine options");
    assert_eq!(
        program
            .render(
                RenderTarget::Name("a.tpl"),
                &ojson(serde_json::json!({})),
                &RenderOptions::default()
            )
            .expect("render"),
        "true|&lt;b&gt;!|&lt;i&gt;"
    );
}

#[test]
fn engine_renders_a_parsed_template_and_reparses_new_versions() {
    let ast = crate::parse(b"{= a + 1}", "x.tpl", &Default::default()).expect("parse");
    let mut loader = MapLoader::new();
    loader.set_ast("x.tpl", ast.clone()).expect("set_ast");
    let engine = AstProgram::new(EngineOptions {
        loader: Some(Box::new(loader)),
        ..Default::default()
    })
    .expect("valid engine options");
    assert_eq!(
        engine
            .render(
                RenderTarget::Name("x.tpl"),
                &ojson(serde_json::json!({ "a": 2 })),
                &RenderOptions::default()
            )
            .expect("render"),
        "3"
    );
    assert_eq!(
        engine
            .render(
                RenderTarget::Ast(&ast),
                &ojson(serde_json::json!({ "a": 2 })),
                &RenderOptions::default()
            )
            .expect("render"),
        "3"
    );
}

/// RT-3: render takes a template name, loaded through the loader, or a parsed template,
/// and returns the whole output as one string.
#[test]
fn render_targets_give_the_same_output() {
    let loader = templates(&[("a.tpl", "<p>{= x}</p>")]);
    let engine = AstProgram::new(EngineOptions {
        loader: Some(Box::new(loader)),
        ..Default::default()
    })
    .expect("valid engine options");
    let assign = ojson(serde_json::json!({ "x": 1 }));
    assert_eq!(
        engine
            .render(RenderTarget::Name("a.tpl"), &assign, &RenderOptions::default())
            .expect("render"),
        "<p>1</p>"
    );
    let ast = crate::parse(b"<p>{= x}</p>", "a.tpl", &Default::default()).expect("parse");
    assert_eq!(
        engine
            .render(RenderTarget::Ast(&ast), &assign, &RenderOptions::default())
            .expect("render"),
        "<p>1</p>"
    );
}

/// A loader whose sources the test changes after the program took it: the program holds a clone, and the sources live in
/// the cell that both share.
struct SharedLoader(Arc<Mutex<MapLoader>>);

impl Loader for SharedLoader {
    fn load(&self, name: &str) -> Result<Option<Loaded>, crate::loader::LoadError> {
        self.0.lock().unwrap().load(name)
    }
}

/// RT-76: under dev a program renders the changed source of a template, and under false it keeps its first parse.
#[test]
fn artifact_refresh_policies_are_independent_of_rendering() {
    for (policy, expected) in [(ArtifactRefresh::Dev, "2"), (ArtifactRefresh::False, "1")] {
        let sources = Arc::new(Mutex::new(MapLoader::new()));
        sources.lock().unwrap().set("a.tpl", "1");
        let program = AstProgram::new(EngineOptions {
            loader: Some(Box::new(SharedLoader(Arc::clone(&sources)))),
            artifact_refresh: Some(policy),
            ..Default::default()
        })
        .expect("valid engine options");
        let render = || {
            program
                .render(
                    RenderTarget::Name("a.tpl"),
                    &ojson(serde_json::json!({})),
                    &RenderOptions::default(),
                )
                .unwrap()
        };
        assert_eq!(render(), "1");
        sources.lock().unwrap().set("a.tpl", "2");
        assert_eq!(render(), expected, "the render after the source changed");
    }
}

/// A loader whose source and version the test changes independently after the program took it.
struct VersionedLoader {
    source: Arc<Mutex<String>>,
    version: Arc<Mutex<String>>,
}

impl Loader for VersionedLoader {
    fn load(&self, name: &str) -> Result<Option<Loaded>, crate::loader::LoadError> {
        if name != "a.tpl" {
            return Ok(None);
        }
        Ok(Some(Loaded::Source {
            bytes: self.source.lock().unwrap().as_bytes().to_vec(),
            version: self.version.lock().unwrap().clone(),
        }))
    }
}

// RT-40: under the default artifact refresh policy `true` (RT-76) an engine parses a template once per name@version
// and reuses the parse while the loader reports the same version.
#[test]
fn the_parse_is_reused_while_the_version_stays_the_same() {
    let source = Arc::new(Mutex::new("1".to_string()));
    let version = Arc::new(Mutex::new("v1".to_string()));
    let program = AstProgram::new(EngineOptions {
        loader: Some(Box::new(VersionedLoader {
            source: Arc::clone(&source),
            version: Arc::clone(&version),
        })),
        ..Default::default()
    })
    .expect("valid engine options");
    let render = || {
        program
            .render(
                RenderTarget::Name("a.tpl"),
                &ojson(serde_json::json!({})),
                &RenderOptions::default(),
            )
            .unwrap()
    };
    assert_eq!(render(), "1");
    source.lock().unwrap().replace_range(.., "2");
    assert_eq!(render(), "1", "the same version keeps the parse");
    version.lock().unwrap().replace_range(.., "v2");
    assert_eq!(render(), "2", "a new version reparses");
}

#[test]
fn date_text_with_a_multibyte_character_in_the_time_is_not_a_date() {
    // The time field ends inside the two-byte character; the parser rejects the text instead of panicking.
    assert!(to_unix_seconds(&Value::text("2024-01-01T12:34:5\u{e9}"), 0).is_err());
    assert!(to_unix_seconds(&Value::text("2024-01-01 \u{e9}2:34:56"), 0).is_err());
    assert!(to_unix_seconds(&Value::text("2024-01-01T12:34:56\u{e9}"), 0).is_err());
    assert_eq!(parse_offset("+\u{e9}:00"), None);
    assert_eq!(parse_offset("+0\u{e9}:0"), None);
}

/// The polyspec-json value of a JSON value that a test writes with `serde_json::json!`.
fn ojson(value: serde_json::Value) -> polyspec_json::Value {
    polyspec_json::parse(value.to_string().as_bytes(), &polyspec_json::ParseOptions::default()).expect("JSON")
}

/// The template error of a render failure; a test that expects a kind fails on the error of host code (FUN-46).
fn kind(error: crate::RenderError) -> crate::TemplateError {
    match error {
        crate::RenderError::Kind(error) => error,
        other => panic!("expected a template error, got the error of host code: {other}"),
    }
}
