//! The bound map type (VAL-22): a map that host binding checked once and that `render` uses as
//! assign or as definition data without binding it again.

use crate::error::{TemplateError, internal_boundary};
use crate::value::bind::{BindError, bind_map, bind_value, bind_values};
use crate::value::{OrderedMap, Value};
use std::rc::Rc;

/// A map that passed host binding (VAL-22). `bind` and `merge` create it; its entries are private.
///
/// It is not `Send`, because template values share their lists and maps with `Rc`, so a host binds
/// data in the thread that renders it.
pub struct BoundMap {
    entries: Rc<OrderedMap>,
}

mod sealed {
    use super::BoundMap;
    use crate::value::OrderedMap;

    /// The values that `bind` accepts.
    pub enum Source<'a> {
        Json(&'a serde_json::Value),
        Values(&'a OrderedMap),
        Bound(&'a BoundMap),
    }

    /// Converts an accepted value into its source; the module is private, so no other crate
    /// implements or calls it.
    pub trait Sealed<'a> {
        fn source(self) -> Source<'a>;
    }

    impl<'a> Sealed<'a> for &'a serde_json::Value {
        fn source(self) -> Source<'a> {
            Source::Json(self)
        }
    }

    impl<'a> Sealed<'a> for &'a OrderedMap {
        fn source(self) -> Source<'a> {
            Source::Values(self)
        }
    }

    impl<'a> Sealed<'a> for &'a BoundMap {
        fn source(self) -> Source<'a> {
            Source::Bound(self)
        }
    }
}

use sealed::{Sealed, Source};

/// A host value that `bind` accepts (VAL-16): JSON data, a map of values that the host built, or a
/// bound map.
pub trait BindInput<'a>: Sealed<'a> {}

impl<'a> BindInput<'a> for &'a serde_json::Value {}
impl<'a> BindInput<'a> for &'a OrderedMap {}
impl<'a> BindInput<'a> for &'a BoundMap {}

/// Applies host binding to a value and returns a bound map (VAL-22). A bound map gives a bound map
/// with the same entries. Its errors have no template and no position (ERR-14).
pub fn bind<'a>(input: impl BindInput<'a>) -> Result<BoundMap, TemplateError> {
    let failure = |error: BindError| TemplateError::without_position(error.code, "", error.message);
    internal_boundary("", || {
        let entries = match input.source() {
            Source::Bound(bound) => Rc::clone(&bound.entries),
            // The values that `render` uses as assign (RT-4) bind like assign.
            Source::Json(json) => Rc::new(bind_map(json).map_err(failure)?),
            Source::Values(map) => Rc::new(bind_values(map).map_err(failure)?),
        };
        Ok(BoundMap { entries })
    })
}

/// Returns a bound map with the entries of `first` and `second`: an entry of `second` replaces the
/// entry of `first` with the same key in its position, and the other entries of `second` follow
/// (RT-26). It reads no value again.
pub fn merge(first: &BoundMap, second: &BoundMap) -> BoundMap {
    let mut entries = (*first.entries).clone();
    for (key, value) in second.entries.iter() {
        entries.insert(key.clone(), value.clone());
    }
    BoundMap { entries: Rc::new(entries) }
}

/// The data of a template definition (RT-24): a value that is bound like assign data, or a bound
/// map that is not bound again (VAL-22).
pub enum DefineData {
    /// A value that the host built.
    Value(Value),
    /// A bound map.
    Bound(BoundMap),
}

impl Clone for DefineData {
    fn clone(&self) -> DefineData {
        match self {
            DefineData::Value(value) => DefineData::Value(value.clone()),
            DefineData::Bound(bound) => DefineData::Bound(BoundMap {
                entries: Rc::clone(&bound.entries),
            }),
        }
    }
}

impl std::fmt::Debug for DefineData {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DefineData::Value(value) => formatter.debug_tuple("Value").field(value).finish(),
            DefineData::Bound(_) => formatter.write_str("Bound"),
        }
    }
}

/// Binds the data of a template definition (RT-24): a bound map gives its entries as a map
/// without binding them again (VAL-22). Generated programs call it.
pub fn bind_data(data: &DefineData) -> Result<Value, BindError> {
    match data {
        DefineData::Value(value) => bind_value(value),
        DefineData::Bound(bound) => Ok(Value::Map(Rc::clone(&bound.entries))),
    }
}

/// The entries of a bound map given as assign (RT-4); they are shared and cannot be changed in
/// place. Generated programs call it.
pub fn bound_root(bound: &BoundMap) -> Rc<OrderedMap> {
    Rc::clone(&bound.entries)
}
