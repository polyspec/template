//! Host functions and resource limits shared by compiler modes.

use super::context::{Limits, RuntimeServices};
use crate::functions::HostFunction;
use std::collections::HashMap;

/// Concrete runtime services owned by AST and generated programs.
pub struct RuntimeEnvironment {
    /// Active resource limits.
    pub limits: Limits,
    /// Registered host functions.
    pub host_functions: HashMap<String, HostFunction>,
}

impl RuntimeEnvironment {
    /// Creates runtime services from explicit limits and host functions.
    pub fn new(limits: Option<Limits>, host_functions: HashMap<String, HostFunction>) -> RuntimeEnvironment {
        RuntimeEnvironment {
            limits: limits.unwrap_or_default(),
            host_functions,
        }
    }

    /// Registers a host function after validating its name.
    pub fn register(&mut self, name: &str, function: HostFunction) -> Result<(), String> {
        let valid = name.bytes().next().is_some_and(|byte| byte.is_ascii_alphabetic() || byte == b'_')
            && name.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'_');
        if !valid {
            return Err(format!("{name:?} is not an identifier"));
        }
        if crate::functions::builtins().contains_key(name) {
            return Err(format!("{name} is a built-in function"));
        }
        self.host_functions.insert(name.to_string(), function);
        Ok(())
    }
}

impl RuntimeServices for RuntimeEnvironment {
    fn limits(&self) -> Limits {
        self.limits
    }

    fn host_function(&self, name: &str) -> Option<&HostFunction> {
        self.host_functions.get(name)
    }
}
