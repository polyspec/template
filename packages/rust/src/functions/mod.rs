//! Built-in function table and the host function contract (docs/spec/functions.md).

pub mod collection;
pub mod date;
pub mod encoding;
pub mod helpers;
pub mod number;
pub mod string;

pub use helpers::{BuiltIn, Env, FunctionContext, to_number};

use crate::error::ErrorCode;
use crate::value::bind::BindError;
use crate::value::{HostError, Value};
use binding_core::Failure;
use std::collections::HashMap;
use std::sync::OnceLock;

/// A host function: receives the arguments and the context and returns a value or a host error
/// (FUN-43, FUN-46). `Err("message".into())` reports a failure; a returned value is bound (VAL-13).
pub type HostFunction = Box<dyn Fn(&[Value], &FunctionContext<'_>) -> Result<Value, HostError> + Send + Sync>;

/// The record `environment` of the interface contract, which a host function of the contract takes: the timezone and
/// the `now()` of the render (FUN-42).
pub type Environment = Env;

/// A host function in the form of the interface contract (binding GN-6d), which a generated binding gives
/// `AstProgram::register_function` and `AstProgram::register_class_function`: the arguments and the environment of the
/// call, and a template value or a failure (FUN-43, FUN-46).
pub type ContractFunction = Box<dyn Fn(&[Value], &Environment) -> Result<Value, Failure<ErrorCode>> + Send + Sync>;

/// The host function of the runtime that calls a function of the contract. `Failure::Kind` is a binding failure of its
/// code, as a returned value that binding refuses is (VAL-19); `Failure::Raised` and `Failure::Callback` are the error
/// of host code, which reaches the caller of `render` unchanged (FUN-46).
pub fn contract_host_function(function: ContractFunction) -> HostFunction {
    Box::new(move |args: &[Value], context: &FunctionContext<'_>| {
        function(args, context.env).map_err(|failure| match failure {
            Failure::Kind(code) => HostError::Data(BindError {
                code,
                message: format!("the host function failed with {}", code.as_str()),
            }),
            Failure::Raised(raised) => HostError::Raised(raised),
            Failure::Callback(error) => HostError::Callback(error),
        })
    })
}

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

#[cfg(test)]
mod tests;
