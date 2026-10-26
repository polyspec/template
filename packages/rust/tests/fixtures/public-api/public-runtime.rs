use polyspec_template::{Frame, OrderedMap, RuntimeBindings, RuntimeEntry, RuntimeEnvironment, RuntimeServices, Scope, Value};
use std::sync::Arc;

pub fn runtime_lookup() -> Value {
    let frame = Frame { name: "page.tpl".into(), lines: None, context: Arc::new(OrderedMap::new()) };
    let scope = Scope::default();
    let value = scope.lookup(&frame, "name");
    let _ = RuntimeBindings::new().truthy(&value);
    value
}

pub fn runtime_services(runtime: &RuntimeEnvironment) -> &dyn RuntimeServices {
    runtime
}

pub fn runtime_entry(entry: RuntimeEntry) -> RuntimeEntry {
    entry
}
