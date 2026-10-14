//! Native objects, host function results and the internal error boundary (VAL-16, VAL-18 to VAL-20,
//! FUN-45, FUN-46, ERR-13).

use polyspec_template::{
    AstProgram, BindError, EngineOptions, ErrorCode, HostError, MapLoader, OrderedMap, ParseOptions, RenderOptions, RenderTarget,
    TemplateError, TemplateObject, Value, parse,
};
use std::rc::Rc;

#[derive(Debug)]
struct Order {
    total: f64,
}

impl TemplateObject for Order {
    fn member(&self, key: &str) -> Result<Option<Value>, HostError> {
        match key {
            "total" => Ok(Some(Value::Number(self.total))),
            "huge" => Ok(Some(Value::Number(1e19))),
            "invalid" => Err(HostError::Data(BindError {
                code: ErrorCode::E_DATA_INVALID_UTF8,
                message: "not UTF-8".to_string(),
            })),
            "broken" => Err("accessor failed".into()),
            _ => Ok(None),
        }
    }

    fn call(&self, method: &str, args: &[Value]) -> Option<Result<Value, HostError>> {
        match method {
            "status_label" => {
                let prefix = args
                    .first()
                    .and_then(Value::as_text)
                    .ok_or_else(|| HostError::from("prefix is required"));
                Some(prefix.map(|prefix| Value::text(format!("{prefix}:{}", self.total))))
            }
            "same" => Some(Ok(Value::Bool(
                args.first()
                    .and_then(Value::downcast_object::<Order>)
                    .is_some_and(|other| std::ptr::eq(Rc::as_ptr(&other), self)),
            ))),
            "nan" => Some(Ok(Value::Number(f64::NAN))),
            _ => None,
        }
    }
}

fn program(sources: &[&str]) -> AstProgram {
    let mut loader = MapLoader::new();
    for (index, source) in sources.iter().enumerate() {
        loader.set(&format!("page{index}.tpl"), source);
    }
    AstProgram::new(EngineOptions {
        loader: Some(Box::new(loader)),
        ..Default::default()
    })
    .expect("valid engine options")
}

fn render(program: &AstProgram, index: usize, root: OrderedMap) -> Result<String, TemplateError> {
    program.render_values(RenderTarget::Name(&format!("page{index}.tpl")), root, &RenderOptions::default())
}

fn order_root(order: &Rc<Order>) -> OrderedMap {
    let mut root = OrderedMap::new();
    root.insert("order".to_string(), Value::Object(Rc::clone(order) as Rc<dyn TemplateObject>));
    root
}

#[test]
fn native_instance_member_and_method_are_rendered_without_copying() {
    let program = program(&["{= order.total}|{= order['total']}|{= order.missing}|{= order.status_label(\"ready\")}"]);
    let order = Rc::new(Order { total: 12.0 });
    let result = render(&program, 0, order_root(&order));
    assert_eq!(result.unwrap(), "12|12||ready:12");
}

#[test]
fn member_and_result_binding_failures_point_at_the_expression() {
    // VAL-19: a field that cannot be bound fails with its data code, an accessor failure is E_RUNTIME_HOST_FUNCTION,
    // and a method result is bound; every error points at the lookup or the call.
    let order = Rc::new(Order { total: 1.0 });
    let cases = [
        ("x{= order.huge}", ErrorCode::E_DATA_NUMBER_RANGE, 5),
        ("x{= order['invalid']}", ErrorCode::E_DATA_INVALID_UTF8, 5),
        ("x{= order.broken}", ErrorCode::E_RUNTIME_HOST_FUNCTION, 5),
        ("x{= order.nan()}", ErrorCode::E_DATA_NUMBER_NOT_FINITE, 5),
        ("x{= order.absent()}", ErrorCode::E_RUNTIME_UNKNOWN_FUNCTION, 5),
    ];
    for (source, code, col) in cases {
        let error = render(&program(&[source]), 0, order_root(&order)).unwrap_err();
        assert_eq!((error.code, error.line, error.col), (code, 1, col), "{source}");
    }
}

#[test]
fn native_object_arguments_arrive_as_the_original_object() {
    // VAL-18: a host function, a class function and a method receive the same TemplateObject, also inside a list.
    let mut program = program(&["{= is_order(order, [order])}|{= Order::total_of(order)}|{= order.same(order)}"]);
    let order = Rc::new(Order { total: 3.0 });
    let expected = Rc::clone(&order);
    program
        .register(
            "is_order",
            Box::new(move |args, _| {
                let direct = args[0]
                    .downcast_object::<Order>()
                    .is_some_and(|value| Rc::ptr_eq(&value, &expected));
                let nested = match &args[1] {
                    Value::List(items) => items[0]
                        .downcast_object::<Order>()
                        .is_some_and(|value| Rc::ptr_eq(&value, &expected)),
                    _ => false,
                };
                Ok(Value::Bool(direct && nested))
            }),
        )
        .unwrap();
    let expected_class = Rc::clone(&order);
    program
        .register_class(
            "Order",
            "total_of",
            Box::new(move |args, _| match args[0].downcast_object::<Order>() {
                Some(value) if Rc::ptr_eq(&value, &expected_class) => Ok(Value::Number(value.total)),
                _ => Err("not the assigned order".into()),
            }),
        )
        .unwrap();
    let result = render(&program, 0, order_root(&order));
    assert_eq!(result.unwrap(), "true|3|true");
}

#[test]
fn host_function_results_are_bound() {
    // VAL-16: a returned native object is retained, a safe string becomes plain text and an invalid number fails at the call.
    let mut program = program(&["{= order().total}|{= tag()}", "{= huge()}"]);
    let order = Rc::new(Order { total: 5.0 });
    let returned = Rc::clone(&order);
    program
        .register(
            "order",
            Box::new(move |_, _| Ok(Value::Object(Rc::clone(&returned) as Rc<dyn TemplateObject>))),
        )
        .unwrap();
    program.register("tag", Box::new(|_, _| Ok(Value::safe_text("<b>")))).unwrap();
    program
        .register("huge", Box::new(|_, _| Ok(Value::list(vec![Value::Number(1e19)]))))
        .unwrap();
    assert_eq!(render(&program, 0, OrderedMap::new()).unwrap(), "5|&lt;b&gt;");
    let error = render(&program, 1, OrderedMap::new()).unwrap_err();
    assert_eq!((error.code, error.col), (ErrorCode::E_DATA_NUMBER_RANGE, 4));
}

#[test]
fn render_values_binds_the_host_built_root() {
    // VAL-16, VAL-20: a root that the host builds is checked like JSON data.
    let program = program(&["{= n}", "{= 1}", "{= s}"]);
    let mut root = OrderedMap::new();
    root.insert("n".to_string(), Value::Number(f64::INFINITY));
    let error = render(&program, 0, root).unwrap_err();
    assert_eq!((error.code, error.line), (ErrorCode::E_DATA_NUMBER_NOT_FINITE, 0));
    let mut deep = Value::Null;
    for _ in 0..64 {
        deep = Value::list(vec![deep]);
    }
    let mut root = OrderedMap::new();
    root.insert("deep".to_string(), deep);
    assert_eq!(render(&program, 1, root).unwrap_err().code, ErrorCode::E_DATA_DEPTH);
    let mut root = OrderedMap::new();
    root.insert("s".to_string(), Value::safe_text("<i>"));
    assert_eq!(render(&program, 2, root).unwrap(), "&lt;i&gt;");
}

#[test]
fn a_panic_is_reported_as_an_internal_error() {
    // ERR-12, ERR-13: a panic in a host callback or in the engine does not leave the public operation.
    let mut program = program(&["{= boom()}"]);
    program.register("boom", Box::new(|_, _| panic!("host defect"))).unwrap();
    let error = program
        .render(RenderTarget::Name("page0.tpl"), &serde_json::json!({}), &RenderOptions::default())
        .unwrap_err();
    assert_eq!(
        (error.code, error.template.as_str(), error.line),
        (ErrorCode::E_INTERNAL, "page0.tpl", 0)
    );
    assert!(error.message.contains("host defect"));
    let prepared = program
        .prepare(RenderTarget::Name("page0.tpl"), &serde_json::json!({}), &RenderOptions::default())
        .unwrap();
    assert_eq!(prepared.render().unwrap_err().code, ErrorCode::E_INTERNAL);
    let error = render(&program, 0, OrderedMap::new()).unwrap_err();
    assert_eq!(error.code, ErrorCode::E_INTERNAL);
    let template = parse(b"{= 1}", "after.tpl", &ParseOptions::default()).unwrap();
    assert_eq!(
        program
            .render_values(RenderTarget::Ast(&template), OrderedMap::new(), &RenderOptions::default())
            .unwrap(),
        "1"
    );
}
