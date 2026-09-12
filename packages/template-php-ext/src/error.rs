//! The PHP exception class and the conversion from the engine error object (ERR-1).

use ext_php_rs::convert::IntoZval;
use ext_php_rs::exception::PhpException;
use ext_php_rs::ffi::{zend_class_entry, zend_object, zval};
use ext_php_rs::prelude::*;
use ext_php_rs::types::{ZendHashTable, Zval};
use ext_php_rs::zend::ce;
use polyspec_template::TemplateError as EngineError;
use std::os::raw::c_char;
use std::ptr;

// `\Exception::$message` is protected, so the property is written with the class entry of
// `\Exception` as the scope. The symbol is resolved by the PHP binary that loads the extension.
unsafe extern "C" {
    fn zend_update_property(
        scope: *mut zend_class_entry,
        object: *mut zend_object,
        name: *const c_char,
        name_length: usize,
        value: *mut zval,
    );
}

/// The error object of the specification, thrown as a PHP exception.
///
/// The accessor names avoid `getCode`, `getLine` and `getFile`, which `\Exception` declares final.
#[php_class]
#[php(name = "Polyspec\\Template\\Native\\TemplateError")]
#[php(extends(ce = ce::exception, stub = "\\Exception"))]
pub struct NativeTemplateError {
    code: String,
    template: String,
    error_line: i64,
    error_col: i64,
    offset: i64,
    end: i64,
    text: String,
}

#[php_impl]
impl NativeTemplateError {
    /// Error code of the specification, such as `E_PARSE_UNCLOSED_BLOCK`.
    pub fn get_error_code(&self) -> String {
        self.code.clone()
    }

    /// Name of the template in which the error is located.
    pub fn get_template(&self) -> String {
        self.template.clone()
    }

    /// 1-based line, or 0 when the error has no position.
    pub fn get_error_line(&self) -> i64 {
        self.error_line
    }

    /// 1-based byte column, or 0 when the error has no position.
    pub fn get_error_col(&self) -> i64 {
        self.error_col
    }

    /// Start byte offset of the related token or node.
    pub fn get_offset(&self) -> i64 {
        self.offset
    }

    /// End byte offset of the related token or node.
    pub fn get_end(&self) -> i64 {
        self.end
    }

    /// The error as an array with the keys of the specification.
    pub fn to_array(&self) -> Result<Zval, PhpException> {
        let mut table = ZendHashTable::new();
        insert(&mut table, "code", self.code.clone())?;
        insert(&mut table, "template", self.template.clone())?;
        insert(&mut table, "line", self.error_line)?;
        insert(&mut table, "col", self.error_col)?;
        insert(&mut table, "offset", self.offset)?;
        insert(&mut table, "end", self.end)?;
        insert(&mut table, "message", self.text.clone())?;
        table.into_zval(false).map_err(|error| PhpException::default(error.to_string()))
    }
}

fn insert(table: &mut ZendHashTable, key: &str, value: impl IntoZval) -> Result<(), PhpException> {
    table.insert(key, value).map_err(|error| PhpException::default(error.to_string()))
}

/// Builds a PHP exception that carries the fields of an engine error.
pub fn php_exception(error: &EngineError) -> PhpException {
    let native = NativeTemplateError {
        code: error.code.as_str().to_string(),
        template: error.template.clone(),
        error_line: error.line as i64,
        error_col: error.col as i64,
        offset: error.offset as i64,
        end: error.end as i64,
        text: error.message.clone(),
    };
    let message = error.message.clone();
    match native.into_zval(false) {
        Ok(mut zval) => {
            // The object is created without running a constructor, so the message that
            // `getMessage()` reads is written directly.
            set_message(&mut zval, &message);
            PhpException::from_class::<NativeTemplateError>(message).with_object(zval)
        }
        Err(_) => PhpException::from_class::<NativeTemplateError>(message),
    }
}

fn set_message(zval: &mut Zval, message: &str) {
    let Some(object) = zval.object_mut() else { return };
    let Ok(mut value) = message.into_zval(false) else { return };
    let name = "message";
    unsafe {
        zend_update_property(
            ptr::from_ref(ce::exception()).cast_mut().cast::<zend_class_entry>(),
            ptr::from_mut(object).cast::<zend_object>(),
            name.as_ptr().cast::<c_char>(),
            name.len(),
            &raw mut value,
        );
    }
}
