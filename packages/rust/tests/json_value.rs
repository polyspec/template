//! The JSON form of a template value: a native object has none, so to_json_value fails instead of writing it as null.

use polyspec_template::{HostError, TemplateObject, Value, to_json_value};

#[derive(Debug)]
struct Host;

impl TemplateObject for Host {
    fn member(&self, _key: &str) -> Result<Option<Value>, HostError> {
        Ok(None)
    }

    fn call(&self, _method: &str, _args: &[Value]) -> Option<Result<Value, HostError>> {
        None
    }
}

#[test]
fn a_native_object_has_no_json_form() {
    let error = to_json_value(&Value::List(vec![Value::object(Host)].into())).expect_err("a native object has no JSON form");
    assert_eq!(error.code.as_str(), "E_DATA_UNSUPPORTED_TYPE");
    assert_eq!(
        to_json_value(&Value::text("a")).expect("a string has a JSON form"),
        serde_json::json!("a")
    );
}
