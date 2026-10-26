//! Private expression lexer and parser used by the template implementation.

pub mod lexer;
pub mod parser;

#[cfg(feature = "__test_support")]
pub(crate) mod vectors;
