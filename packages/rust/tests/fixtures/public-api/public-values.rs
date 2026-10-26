use polyspec_template::{BindError, OrderedMap, Value, ValueType, bind_map};

pub fn public_values() -> Result<OrderedMap, BindError> {
    let kind: ValueType = Value::text("value").value_type();
    assert_eq!(kind, ValueType::String);
    let value = polyspec_template::to_json_value(&Value::Null)?;
    bind_map(&value)
}
