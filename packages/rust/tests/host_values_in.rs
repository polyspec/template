//! VAL-23: the binding of a value that a generated binding describes as a `HostValue`, and the making of a template value
//! as `OutValue`s.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    reason = "a test states its expectation with unwrap and expect; a failure there is the failure of the test"
)]

use binding_core::{Failure, Handle, HostText, HostValue, HostValues, OutValue, OutValues, Raised};
use polyspec_template::{ErrorCode, OrderedMap, RenderError, TemplateError, Value, value_in, value_out};
use std::collections::HashMap;

/// A language value as a binding describes it: containers by handle, with their children.
#[derive(Default)]
struct Host {
    lists: HashMap<u64, Vec<HostValue>>,
    maps: HashMap<u64, Vec<(HostValue, HostValue)>>,
    /// The handle of a container whose questions raise.
    raising: Option<u64>,
}

impl HostValues for Host {
    fn item(&mut self, list: Handle, index: u64) -> Result<HostValue, Raised> {
        if self.raising == Some(list.raw()) {
            return Err(Raised::from_generated(Handle::new(99)));
        }
        Ok(self.lists[&list.raw()][usize::try_from(index).unwrap()].clone())
    }

    fn entry(&mut self, map: Handle, index: u64) -> Result<(HostValue, HostValue), Raised> {
        Ok(self.maps[&map.raw()][usize::try_from(index).unwrap()].clone())
    }

    fn read(&mut self, _value: Handle) -> Result<HostValue, Raised> {
        Ok(HostValue::Null)
    }
}

fn text(value: &str) -> HostValue {
    HostValue::Text(HostText::Utf16(value.encode_utf16().collect()))
}

fn code(result: Result<Value, RenderError>) -> ErrorCode {
    match result {
        Err(RenderError::Kind(error)) => error.code,
        other => panic!("expected a kind, got {other:?}"),
    }
}

#[test]
fn scalars_bind_as_the_tables_of_val_13() {
    let mut host = Host::default();
    assert_eq!(value_in(&mut host, HostValue::Undefined).unwrap(), Value::Null);
    assert_eq!(value_in(&mut host, HostValue::Bool(true)).unwrap(), Value::Bool(true));
    assert_eq!(value_in(&mut host, HostValue::Int(-3)).unwrap(), Value::Number(-3.0));
    assert_eq!(value_in(&mut host, HostValue::UntypedNumber(1.5)).unwrap(), Value::Number(1.5));
    assert_eq!(value_in(&mut host, text("a")).unwrap(), Value::text("a"));
    assert_eq!(code(value_in(&mut host, HostValue::Int(1 << 53))), ErrorCode::E_DATA_NUMBER_RANGE);
    assert_eq!(
        code(value_in(&mut host, HostValue::Number("1".repeat(30)))),
        ErrorCode::E_DATA_NUMBER_RANGE
    );
    assert_eq!(
        code(value_in(&mut host, HostValue::Float(f64::NAN))),
        ErrorCode::E_DATA_NUMBER_NOT_FINITE
    );
    assert_eq!(
        code(value_in(&mut host, HostValue::Text(HostText::Utf16(vec![0xD800])))),
        ErrorCode::E_DATA_INVALID_UTF8
    );
    assert_eq!(
        code(value_in(&mut host, HostValue::Text(HostText::Bytes(vec![0xFF])))),
        ErrorCode::E_DATA_INVALID_UTF8
    );
    assert_eq!(
        code(value_in(&mut host, HostValue::Text(HostText::CodePoints(vec![0xDC00])))),
        ErrorCode::E_DATA_INVALID_UTF8
    );
    for value in [
        HostValue::Bytes(vec![1]),
        HostValue::Date(Handle::new(1)),
        HostValue::Callable(Handle::new(1)),
    ] {
        assert_eq!(code(value_in(&mut host, value)), ErrorCode::E_DATA_UNSUPPORTED_TYPE);
    }
}

#[test]
fn containers_bind_their_children_in_order() {
    let mut host = Host::default();
    host.lists.insert(
        1,
        vec![
            HostValue::Int(1),
            HostValue::PhpArray {
                handle: Handle::new(2),
                len: 2,
                is_list: false,
            },
        ],
    );
    host.maps
        .insert(2, vec![(HostValue::Int(0), text("x")), (text("k"), HostValue::Null)]);
    let value = value_in(
        &mut host,
        HostValue::List {
            handle: Handle::new(1),
            len: 2,
        },
    )
    .unwrap();
    let mut map = OrderedMap::new();
    map.insert("0".to_string(), Value::text("x"));
    map.insert("k".to_string(), Value::Null);
    assert_eq!(value, Value::list(vec![Value::Number(1.0), Value::map(map)]));
    // A key that is not a string is unsupported outside a PHP array.
    host.maps.insert(3, vec![(HostValue::Int(0), HostValue::Null)]);
    assert_eq!(
        code(value_in(
            &mut host,
            HostValue::Map {
                handle: Handle::new(3),
                len: 1
            }
        )),
        ErrorCode::E_DATA_UNSUPPORTED_TYPE
    );
}

#[test]
fn a_value_that_holds_itself_is_too_deep() {
    let mut host = Host::default();
    host.lists.insert(
        1,
        vec![HostValue::List {
            handle: Handle::new(1),
            len: 1,
        }],
    );
    assert_eq!(
        code(value_in(
            &mut host,
            HostValue::List {
                handle: Handle::new(1),
                len: 1
            }
        )),
        ErrorCode::E_DATA_DEPTH
    );
}

#[test]
fn an_exception_of_the_walk_reaches_the_caller_unchanged() {
    let mut host = Host {
        raising: Some(1),
        ..Host::default()
    };
    match value_in(
        &mut host,
        HostValue::List {
            handle: Handle::new(1),
            len: 1,
        },
    ) {
        Err(Failure::Raised(raised)) => assert_eq!(raised, Raised::from_generated(Handle::new(99))),
        other => panic!("expected the raised exception, got {other:?}"),
    }
}

#[test]
fn value_in_has_the_form_of_a_value_alias_in() {
    // Binding design E-1c: the `in` function of a value alias returns `Result<T, Failure<E>>` with the error enum of the
    // core, so an exception of language code is `Failure::Raised` beside the kinds of `TemplateError`.
    let function: fn(&mut dyn HostValues, HostValue) -> Result<Value, Failure<TemplateError>> = value_in;
    let mut host = Host::default();
    match function(&mut host, HostValue::Bytes(Vec::new())) {
        Err(Failure::Kind(error)) => assert_eq!(error.code, ErrorCode::E_DATA_UNSUPPORTED_TYPE),
        other => panic!("expected the kind data_unsupported_type, got {other:?}"),
    }
}

/// The making of a value as a binding does it: a container once, its children through the source.
fn make(out: OutValue, source: &mut dyn OutValues, made: &mut Vec<u64>) -> String {
    match out {
        OutValue::List { handle, len } => {
            if made.contains(&handle.raw()) {
                return format!("#{}", handle.raw());
            }
            made.push(handle.raw());
            let items: Vec<String> = (0..len)
                .map(|index| {
                    let item = source.item(handle, index);
                    make(item, source, made)
                })
                .collect();
            format!("[{}]", items.join(","))
        }
        OutValue::Map(map) => {
            let entries: Vec<String> = (0..map.len())
                .map(|index| {
                    let (key, item) = source.entry(map.handle(), index);
                    format!("{}:{}", make(key, source, made), make(item, source, made))
                })
                .collect();
            format!("{}{{{}}}", if map.sequence_keys() { "seq" } else { "" }, entries.join(","))
        }
        OutValue::Float(number) => number.value().to_string(),
        OutValue::Text(text) => text,
        OutValue::Native(handle) => format!("native{}", handle.raw()),
        other => format!("{other:?}"),
    }
}

#[test]
fn a_value_leaves_with_one_handle_for_one_container() {
    let shared = Value::list(vec![Value::Number(1.0)]);
    let mut map = OrderedMap::new();
    map.insert("0".to_string(), Value::text("a"));
    let mut host = Host::default();
    let native = value_in(
        &mut host,
        HostValue::Object {
            handle: Handle::new(7),
            type_name: "Order".to_string(),
            json_serializable: false,
        },
    )
    .unwrap();
    let value = Value::list(vec![shared.clone(), shared, Value::map(map), native]);
    let (root, mut source) = value_out(&value);
    let mut made = Vec::new();
    assert_eq!(make(root, &mut source, &mut made), "[[1],#2,seq{0:a},native7]");
}

/// A language object that entered as a handle has no member and no method in the core (VAL-23).
#[test]
fn a_host_object_is_opaque_to_templates() {
    let mut host = Host::default();
    let native = value_in(
        &mut host,
        HostValue::Object {
            handle: Handle::new(7),
            type_name: "Order".to_string(),
            json_serializable: false,
        },
    )
    .unwrap();
    let mut loader = polyspec_template::MapLoader::new();
    loader.set("a.tpl", "[{= o.x}]");
    loader.set("b.tpl", "{= o.m()}");
    let program = polyspec_template::AstProgram::new(polyspec_template::EngineOptions {
        loader: Some(Box::new(loader)),
        ..Default::default()
    })
    .unwrap();
    let assign = || {
        let mut map = OrderedMap::new();
        map.insert("o".to_string(), native.clone());
        map
    };
    let options = polyspec_template::RenderOptions::default();
    assert_eq!(
        program
            .render_values(polyspec_template::RenderTarget::Name("a.tpl"), assign(), &options)
            .unwrap(),
        "[]"
    );
    match program.render_values(polyspec_template::RenderTarget::Name("b.tpl"), assign(), &options) {
        Err(RenderError::Kind(error)) => assert_eq!(error.code, ErrorCode::E_RUNTIME_UNKNOWN_FUNCTION),
        other => panic!("expected runtime_unknown_function, got {other:?}"),
    }
}
