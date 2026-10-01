//! Host argument form (VAL-21) and native object equality (EXP-39) with the shared fixture of
//! tests/fixtures/native-object/host-values.json.

mod common;

use polyspec_template::{AstProgram, EngineOptions, HostError, MapLoader, OrderedMap, RenderOptions, RenderTarget, TemplateObject, Value};
use std::path::PathBuf;
use std::rc::Rc;

#[derive(Debug)]
struct Order;

impl TemplateObject for Order {
    fn member(&self, _key: &str) -> Result<Option<Value>, HostError> {
        Ok(None)
    }

    fn call(&self, method: &str, args: &[Value]) -> Option<Result<Value, HostError>> {
        (method == "describe").then(|| Ok(Value::text(describe_arguments(args, |object| same_as(object, self)))))
    }
}

fn same_as(object: &Rc<dyn TemplateObject>, order: &Order) -> bool {
    std::ptr::eq(Rc::as_ptr(object).cast::<()>(), std::ptr::from_ref(order).cast::<()>())
}

fn describe_value(value: &Value, is_order: &dyn Fn(&Rc<dyn TemplateObject>) -> bool) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(value) => format!("bool({value})"),
        Value::Number(value) => format!("number({value})"),
        Value::Str(text) => format!("string({text})"),
        Value::List(items) => format!(
            "list({})",
            items
                .iter()
                .map(|item| describe_value(item, is_order))
                .collect::<Vec<_>>()
                .join(",")
        ),
        Value::Map(map) => format!(
            "map({})",
            map.iter()
                .map(|(key, item)| format!("{key}={}", describe_value(item, is_order)))
                .collect::<Vec<_>>()
                .join(",")
        ),
        Value::Object(object) if is_order(object) => "object(order)".to_string(),
        other => format!("unexpected({:?})", other.value_type()),
    }
}

fn describe_arguments(args: &[Value], is_order: impl Fn(&Rc<dyn TemplateObject>) -> bool) -> String {
    args.iter()
        .map(|item| describe_value(item, &is_order))
        .collect::<Vec<_>>()
        .join(",")
}

fn fixture_dir() -> PathBuf {
    common::repo_root().join("tests").join("fixtures").join("native-object")
}

fn render(target: &str, names: &[String]) -> Result<String, polyspec_template::TemplateError> {
    let mut loader = MapLoader::new();
    for name in names {
        loader.set(name, &std::fs::read_to_string(fixture_dir().join(name)).expect("fixture template"));
    }
    let mut program = AstProgram::new(EngineOptions {
        loader: Some(Box::new(loader)),
        ..Default::default()
    });
    let order = Value::object(Order);
    let Value::Object(original) = order.clone() else { unreachable!() };
    let describe_original = Rc::clone(&original);
    program
        .register(
            "describe",
            Box::new(move |args, _| {
                Ok(Value::text(describe_arguments(args, |object| {
                    Rc::ptr_eq(object, &describe_original)
                })))
            }),
        )
        .expect("register describe");
    program
        .register(
            "mutate",
            Box::new(|args, _| {
                // Values are shared and immutable: a host can change only its own copy.
                if let Value::List(list) = &args[0] {
                    let mut copy = Rc::clone(list);
                    Rc::make_mut(&mut copy)[0] = Value::text("changed");
                }
                if let Value::Map(map) = &args[1] {
                    let mut copy = Rc::clone(map);
                    Rc::make_mut(&mut copy).insert("k".to_string(), Value::text("changed"));
                }
                Ok(Value::Null)
            }),
        )
        .expect("register mutate");
    program
        .register("pick", Box::new(|args, _| Ok(args[0].clone())))
        .expect("register pick");
    let class_original = Rc::clone(&original);
    program
        .register_class(
            "Order",
            "describe",
            Box::new(move |args, _| Ok(Value::text(describe_arguments(args, |object| Rc::ptr_eq(object, &class_original))))),
        )
        .expect("register class function");
    let mut root = OrderedMap::new();
    root.insert("order".to_string(), order.clone());
    root.insert("same".to_string(), order);
    root.insert("other".to_string(), Value::object(Order));
    root.insert("items".to_string(), Value::list(vec![Value::Number(1.0)]));
    program.render_values(RenderTarget::Name(target), root, &RenderOptions::default())
}

#[test]
fn host_arguments_and_native_equality_match_the_shared_fixture() {
    let expected: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(fixture_dir().join("host-values.json")).expect("expectations")).expect("JSON");
    let outputs = expected["outputs"].as_object().expect("outputs");
    let errors = expected["errors"].as_object().expect("errors");
    let names: Vec<String> = outputs.keys().chain(errors.keys()).cloned().collect();
    for (target, output) in outputs {
        assert_eq!(render(target, &names).expect(target), output.as_str().expect("text"), "{target}");
    }
    for (target, code) in errors {
        let error = render(target, &names).expect_err(target);
        assert_eq!(error.code.as_str(), code.as_str().expect("code"), "{target}");
    }
}
