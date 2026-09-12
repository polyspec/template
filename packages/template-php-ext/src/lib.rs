//! PHP extension that renders templates with the native implementation.
//!
//! The extension registers `Polyspec\Template\Native\Engine` and
//! `Polyspec\Template\Native\TemplateError`. The specification is in `docs/spec/` of the
//! repository; the behaviour is the behaviour of the Rust implementation.

#![deny(missing_docs)]

pub mod convert;
pub mod engine;
pub mod error;

use engine::NativeEngine;
use error::NativeTemplateError;
use ext_php_rs::prelude::*;

/// Registers the classes of the extension.
#[php_module]
pub fn module(module: ModuleBuilder) -> ModuleBuilder {
    module
        .name("polyspec_template")
        .class::<NativeTemplateError>()
        .class::<NativeEngine>()
}
