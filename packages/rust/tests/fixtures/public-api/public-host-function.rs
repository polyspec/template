use polyspec_template::{Env, FunctionContext, HostFunction, Value};

pub fn read_environment(env: &Env) -> Value {
    let context = FunctionContext { env };
    Value::text(context.env.timezone.clone())
}

pub fn host_function() -> HostFunction {
    Box::new(|_, context| Ok(Value::text(context.env.timezone.clone())))
}

pub fn configurations() -> (polyspec_template::EngineOptions, polyspec_template::RenderOptions) {
    use polyspec_template::{ArtifactRefresh, EngineOptions, Limits, RenderOptions};
    let _policies = [ArtifactRefresh::Dev, ArtifactRefresh::True, ArtifactRefresh::False];
    let engine = EngineOptions {
        loader: Some(Box::new(polyspec_template::MapLoader::new())),
        functions: std::collections::HashMap::from([("custom".into(), host_function())]),
        limits: Some(Limits { output_bytes: 128, ..Default::default() }),
        delimiters: Some("[]".into()), artifact_refresh: ArtifactRefresh::False,
    };
    let request = RenderOptions {
        define: std::collections::HashMap::new(), env: Some(Env { timezone: "+09:00".into(), now: 123.0 }),
    };
    (engine, request)
}

pub fn values(object: std::sync::Arc<dyn polyspec_template::TemplateObject>) -> Vec<Value> {
    use polyspec_template::OrderedMap;
    let mut map = OrderedMap::with_capacity(2);
    map.insert("first".into(), Value::Null);
    map.insert("second".into(), Value::Bool(false));
    let _ = (map.get("first"), map.contains_key("first"), map.len(), map.is_empty());
    let _ = (map.iter().count(), map.keys().count(), map.values().count());
    let _ = map.remove("missing");
    vec![Value::Null, Value::Bool(true), Value::Number(12.5), Value::Str("é😀".into()),
        Value::Safe("<i>".into()), Value::List(std::sync::Arc::new(vec![])),
        Value::Map(std::sync::Arc::new(map)), Value::Object(object),
        Value::text("plain"), Value::safe_text("<i>"), Value::list(vec![]), Value::map(OrderedMap::new())]
}
