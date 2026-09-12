//! Built-in function table and the host function contract (docs/spec/functions.md).

pub mod collection;
pub mod date;
pub mod encoding;
pub mod helpers;
pub mod number;
pub mod string;

pub use helpers::{BuiltIn, Env, FunctionContext, FunctionError, to_number};

use crate::value::Value;
use std::collections::HashMap;
use std::sync::OnceLock;

/// A host function: receives the arguments and the context and returns a value or a message.
pub type HostFunction = Box<dyn Fn(&[Value], &FunctionContext<'_>) -> Result<Value, String>>;

/// The table of built-in functions.
pub fn builtins() -> &'static HashMap<&'static str, BuiltIn> {
    static TABLE: OnceLock<HashMap<&'static str, BuiltIn>> = OnceLock::new();
    TABLE.get_or_init(|| {
        let mut table = HashMap::new();
        for group in [
            encoding::functions(),
            string::functions(),
            collection::functions(),
            number::functions(),
            date::functions(),
        ] {
            for (name, function) in group {
                table.insert(name, function);
            }
        }
        table
    })
}
