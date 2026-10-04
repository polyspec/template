//! The bound map class of the extension (VAL-22).

use crate::convert::php_to_map;
use crate::error::{boundary, php_exception};
use ext_php_rs::convert::IntoZval;
use ext_php_rs::exception::PhpException;
use ext_php_rs::flags::ClassFlags;
use ext_php_rs::prelude::*;
use ext_php_rs::types::{ZendClassObject, ZendObject, Zval};
use polyspec_template::{BoundMap, ErrorCode, TemplateError as EngineError, bind, merge};

/// A map that host binding checked once (VAL-22). `bind` and `merge` create it; PHP code cannot
/// instantiate, clone or unserialize the class, and `render` takes it as assign and as definition
/// data without binding it again.
#[php_class]
#[php(name = "Polyspec\\Template\\Native\\BoundMap")]
#[php(flags = ClassFlags::Final)]
pub struct NativeBoundMap {
    bound: BoundMap,
}

#[php_impl]
impl NativeBoundMap {
    /// Applies host binding to a value and returns a bound map (VAL-22). Null and the empty array give
    /// the empty bound map, and a bound map of the extension is returned unchanged. Errors have no
    /// template and no position (ERR-14).
    pub fn bind(value: &Zval) -> PhpResult<Zval> {
        boundary("", || {
            if bound_of(value).is_some() {
                return Ok(value.shallow_clone());
            }
            let entries =
                php_to_map(value).map_err(|error| php_exception(&EngineError::without_position(error.code, "", error.message)))?;
            let bound = bind(&entries).map_err(|error| php_exception(&error))?;
            into_object(NativeBoundMap { bound })
        })
    }

    /// Returns a bound map with the entries of `first` and `second` by the precedence of RT-26. An
    /// argument that is not a bound map of the extension fails (ERR-14).
    pub fn merge(first: &Zval, second: &Zval) -> PhpResult<Zval> {
        boundary("", || match (bound_of(first), bound_of(second)) {
            (Some(first), Some(second)) => into_object(NativeBoundMap {
                bound: merge(first, second),
            }),
            _ => Err(php_exception(&EngineError::without_position(
                ErrorCode::E_DATA_UNSUPPORTED_TYPE,
                "",
                "merge takes two bound maps of the extension",
            ))),
        })
    }
}

fn into_object(bound: NativeBoundMap) -> PhpResult<Zval> {
    bound
        .into_zval(false)
        .map_err(|error| PhpException::default(format!("cannot create a bound map: {error}")))
}

/// The bound map of a PHP value that is a bound map of the extension.
pub fn bound_of(value: &Zval) -> Option<&BoundMap> {
    object_bound(value.dereference().object()?)
}

/// The bound map of a PHP object of the class `Polyspec\Template\Native\BoundMap`.
pub fn object_bound(object: &ZendObject) -> Option<&BoundMap> {
    ZendClassObject::<NativeBoundMap>::from_zend_obj(object)?
        .obj
        .as_ref()
        .map(|native| &native.bound)
}
