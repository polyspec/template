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
