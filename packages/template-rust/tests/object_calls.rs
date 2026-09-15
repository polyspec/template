use polyspec_template::{AstProgram, EngineOptions, OrderedMap, ParseOptions, RenderOptions, RenderTarget, TemplateObject, Value, parse};

#[derive(Debug)]
struct Order {
    total: f64,
}

impl TemplateObject for Order {
    fn member(&self, key: &str) -> Option<Value> {
        (key == "total").then_some(Value::Number(self.total))
    }

    fn call(&self, method: &str, args: &[Value]) -> Option<Result<Value, String>> {
        if method != "status_label" {
            return None;
        }
        let prefix = args
            .first()
            .and_then(Value::as_text)
            .ok_or_else(|| "prefix is required".to_string());
        Some(prefix.map(|prefix| Value::text(format!("{prefix}:{}", self.total))))
    }
}

#[test]
fn native_instance_member_and_method_are_rendered_without_copying() {
    let template = parse(
        b"{= order.total}|{= order.status_label(\"ready\")}",
        "page.tpl",
        &ParseOptions::default(),
    )
    .unwrap();
    let mut root = OrderedMap::new();
    root.insert("order".to_string(), Value::object(Order { total: 12.0 }));
    let program = AstProgram::new(EngineOptions::default());
    let result = program
        .render_values(RenderTarget::Ast(&template), root, &RenderOptions::default())
        .unwrap();
    assert_eq!(result, "12|ready:12");
}
