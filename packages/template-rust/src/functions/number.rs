//! number, round, floor, ceil, abs, min, max, num (FUN-16, FUN-17, FUN-20 to FUN-25).

use crate::functions::helpers::{BuiltIn, FunctionContext, FunctionError, arg_integer, arg_number, arg_string, optional, type_error};
use crate::value::Value;
use crate::value::number::{format_number, round_number};

fn finite(value: f64) -> Result<Value, FunctionError> {
    if value.is_finite() {
        Ok(Value::Number(value))
    } else {
        Err(type_error("arithmetic result is not finite"))
    }
}

fn decimals(args: &[Value], index: usize, name: &str) -> Result<usize, FunctionError> {
    match optional(args, index) {
        None => Ok(0),
        Some(value) => {
            let places = arg_integer(value)?;
            if places < 0 {
                return Err(type_error(format!("{name} requires a non-negative decimal count")));
            }
            Ok(places as usize)
        }
    }
}

fn number(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    let places = decimals(args, 1, "number")?;
    let dec = match optional(args, 2) {
        Some(value) => arg_string(value, "number")?,
        None => ".".to_string(),
    };
    let thousands = match optional(args, 3) {
        Some(value) => arg_string(value, "number")?,
        None => ",".to_string(),
    };
    Ok(Value::text(format_number(arg_number(&args[0])?, places, &dec, &thousands)))
}

fn round(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    let places = decimals(args, 1, "round")?;
    Ok(Value::Number(round_number(arg_number(&args[0])?, places)))
}

fn floor(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    finite(arg_number(&args[0])?.floor())
}

fn ceil(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    finite(arg_number(&args[0])?.ceil())
}

fn abs(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    Ok(Value::Number(arg_number(&args[0])?.abs()))
}

fn require_numbers(args: &[Value], name: &str) -> Result<Vec<f64>, FunctionError> {
    args.iter()
        .map(|value| match value {
            Value::Number(number) => Ok(*number),
            _ => Err(type_error(format!("{name} accepts only numbers"))),
        })
        .collect()
}

fn min(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    Ok(Value::Number(
        require_numbers(args, "min")?.into_iter().fold(f64::INFINITY, f64::min),
    ))
}

fn max(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    Ok(Value::Number(
        require_numbers(args, "max")?.into_iter().fold(f64::NEG_INFINITY, f64::max),
    ))
}

fn num(args: &[Value], _context: &FunctionContext<'_>) -> Result<Value, FunctionError> {
    Ok(Value::Number(arg_number(&args[0])?))
}

/// The number function group.
pub fn functions() -> Vec<(&'static str, BuiltIn)> {
    vec![
        (
            "number",
            BuiltIn {
                min: 1,
                max: 4,
                call: number,
            },
        ),
        (
            "round",
            BuiltIn {
                min: 1,
                max: 2,
                call: round,
            },
        ),
        (
            "floor",
            BuiltIn {
                min: 1,
                max: 1,
                call: floor,
            },
        ),
        (
            "ceil",
            BuiltIn {
                min: 1,
                max: 1,
                call: ceil,
            },
        ),
        ("abs", BuiltIn { min: 1, max: 1, call: abs }),
        (
            "min",
            BuiltIn {
                min: 1,
                max: usize::MAX,
                call: min,
            },
        ),
        (
            "max",
            BuiltIn {
                min: 1,
                max: usize::MAX,
                call: max,
            },
        ),
        ("num", BuiltIn { min: 1, max: 1, call: num }),
    ]
}
