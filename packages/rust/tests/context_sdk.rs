//! RT-74, RT-22, RT-35, ERR-2: public render state works without a program.
use polyspec_template::{DefineEntry, Env, ErrorCode, Frame, Limits, LineIndex, OrderedMap, RenderContext, RuntimeEnvironment};
use std::collections::HashMap;
use std::sync::Arc;

/// RT-1, RT-5, RT-6, RT-74: concrete AST operations share the Program/runtime-service contracts.
#[test]
fn ast_program_protocols() {
    use polyspec_template::{ArtifactRefresh, AstProgram, EngineOptions, Program, RenderOptions, RenderTarget, RuntimeServices, Value};
    let mut loader = polyspec_template::MapLoader::new();
    loader.set("a.tpl", "{= hello()}|{= Box::value()}");
    let mut program = AstProgram::new(EngineOptions {
        loader: Some(Box::new(loader)),
        ..Default::default()
    })
    .unwrap();
    program.register("hello", Box::new(|_, _| Ok(Value::text("host")))).unwrap();
    program
        .register_class("Box", "value", Box::new(|_, _| Ok(Value::text("box"))))
        .unwrap();
    let services: &dyn RuntimeServices = &program;
    assert!(std::ptr::eq(
        services.host_function("hello").unwrap(),
        program.runtime.host_function("hello").unwrap()
    ));
    assert!(std::ptr::eq(
        services.class_function("Box", "value").unwrap(),
        program.runtime.class_function("Box", "value").unwrap()
    ));
    assert_eq!(services.limits().output_bytes, program.runtime.limits().output_bytes);
    assert!(program.loader.load("a.tpl").unwrap().is_some());
    assert_eq!(program.artifact_refresh, ArtifactRefresh::True);
    let assign = serde_json::json!({});
    let options = RenderOptions::default();
    let protocol: &dyn Program = &program;
    assert_eq!(
        protocol
            .prepare(RenderTarget::Name("a.tpl"), &assign, &options)
            .unwrap()
            .render()
            .unwrap(),
        "host|box"
    );
    assert_eq!(protocol.render(RenderTarget::Name("a.tpl"), &assign, &options).unwrap(), "host|box");
    assert_eq!(
        program
            .prepare(RenderTarget::Name("a.tpl"), &assign, &options)
            .unwrap()
            .render()
            .unwrap(),
        "host|box"
    );
    assert_eq!(program.render(RenderTarget::Name("a.tpl"), &assign, &options).unwrap(), "host|box");
}

#[test]
fn isolated_state_positioned_errors_and_bounded_output() {
    let services = RuntimeEnvironment::new(
        Some(Limits {
            output_bytes: 2,
            ..Limits::default()
        }),
        HashMap::new(),
    )
    .unwrap();
    let root = Arc::new(OrderedMap::new());
    let env = Env {
        timezone: "Z".into(),
        now: 123.0,
    };
    let mut context = RenderContext::new(&services, root.clone(), env.clone(), "entry.tpl");
    let other = RenderContext::new(&services, root.clone(), env.clone(), "other.tpl");
    assert!(std::ptr::eq(context.services, other.services));
    assert!(Arc::ptr_eq(&context.root, &root));
    assert_eq!(context.env, env);
    assert_eq!(context.entry, "entry.tpl");
    assert_eq!(context.iterations, 0);
    context.iterations += 1;
    context.registry.insert("layout".into(), DefineEntry::Html("ready".into()));
    assert_eq!(context.registry.get("layout"), Some(&DefineEntry::Html("ready".into())));
    assert!(other.registry.is_empty());
    assert_eq!(other.iterations, 0);
    let frame = Frame {
        name: "part.tpl".into(),
        lines: Some(LineIndex::from_starts(vec![0, 2])),
        context: root,
    };
    let error = context.fail(ErrorCode::E_RUNTIME_TYPE, None, None, "unpositioned");
    assert_eq!(
        (error.template.as_str(), error.line, error.col, error.offset, error.end),
        ("entry.tpl", 0, 0, 0, 0)
    );
    let error = context.fail(ErrorCode::E_RUNTIME_TYPE, Some(&frame), Some([2, 3]), "positioned");
    assert_eq!(
        (error.template.as_str(), error.line, error.col, error.offset, error.end),
        ("part.tpl", 2, 1, 2, 3)
    );
    context.enter("entry.tpl", None, None).unwrap();
    assert_eq!(context.chain, vec!["entry.tpl"]);
    assert_eq!(
        context.enter("entry.tpl", Some(&frame), Some([2, 3])).unwrap_err().code,
        ErrorCode::E_LOAD_CYCLE
    );
    assert_eq!(context.chain, vec!["entry.tpl"]);
    context.leave();
    assert!(context.chain.is_empty());
    context.write("é", &frame, [2, 3]).unwrap();
    assert_eq!(context.output, "é");
    assert_eq!(other.output, "");
    let error = context.write("x", &frame, [2, 3]).unwrap_err();
    assert_eq!(
        (error.code, error.template.as_str(), error.line, error.col, error.offset, error.end),
        (ErrorCode::E_RUNTIME_LIMIT, "part.tpl", 2, 1, 2, 3)
    );
}
