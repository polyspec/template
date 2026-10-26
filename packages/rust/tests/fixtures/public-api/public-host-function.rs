use polyspec_template::{Env, FunctionContext, HostFunction, Value};

pub fn read_environment(env: &Env) -> Value {
    let context = FunctionContext { env };
    Value::text(context.env.timezone.clone())
}

pub fn host_function() -> HostFunction {
    Box::new(|_, context| Ok(Value::text(context.env.timezone.clone())))
}
