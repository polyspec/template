//! RT-74, RT-22, RT-35, ERR-2: public render state works without a program.
use polyspec_template::{DefineEntry, Env, ErrorCode, Frame, Limits, LineIndex, OrderedMap, RenderContext, RuntimeEnvironment};
use std::collections::HashMap;
use std::sync::Arc;

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
