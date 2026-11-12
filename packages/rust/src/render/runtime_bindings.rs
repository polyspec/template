//! Shared runtime value, function and error semantics for AST and generated programs.

use crate::ast::{BinaryOp, UnaryOp};
use crate::error::{ErrorCode, RenderError, Span};
use crate::escape::escape_html;
use crate::functions::{FunctionContext, builtins, to_number};
use crate::render::context::{Frame, RenderContext};
use crate::value::bind::bind_value;
use crate::value::number::MAX_SAFE;
use crate::value::{HostError, MAX_DEPTH, StringifyError, Value, absent_is_null, compare_values, loose_equals, strict_equals, stringify};
use std::cmp::Ordering;

/// One iterable key and value pair.
pub type RuntimeEntry = (Value, Value);

/// One implementation of observable runtime semantics shared by both compiler modes.
#[derive(Debug, Default, Clone, Copy)]
pub struct RuntimeBindings;

impl RuntimeBindings {
    /// Creates runtime semantics.
    pub fn new() -> RuntimeBindings {
        RuntimeBindings
    }

    /// Applies template truthiness.
    pub fn truthy(&self, value: &Value) -> bool {
        value.is_truthy()
    }

    /// Applies one eager unary operator.
    pub fn unary(
        &self,
        context: &RenderContext<'_>,
        operator: UnaryOp,
        operand: &Value,
        frame: &Frame,
        span: Span,
    ) -> Result<Value, RenderError> {
        match operator {
            UnaryOp::Not => Ok(Value::Bool(!self.truthy(operand))),
            UnaryOp::Negate => {
                let number = self.number(context, operand, frame, span)?;
                self.finite(context, -number, frame, span)
            }
        }
    }

    /// Applies one eager binary operator. Short-circuit selection remains generated control flow.
    pub fn binary(
        &self,
        context: &RenderContext<'_>,
        operator: BinaryOp,
        left: &Value,
        right: &Value,
        frame: &Frame,
        span: Span,
    ) -> Result<Value, RenderError> {
        match operator {
            BinaryOp::Add => {
                if matches!(left, Value::List(_) | Value::Map(_)) || matches!(right, Value::List(_) | Value::Map(_)) {
                    return Err(self.error(
                        context,
                        frame,
                        span,
                        ErrorCode::E_RUNTIME_STRINGIFY,
                        "a list or map cannot be converted to text",
                    ));
                }
                if left.is_string() || right.is_string() {
                    let mut text = self.stringify(context, left, frame, span)?;
                    text.push_str(&self.stringify(context, right, frame, span)?);
                    return Ok(Value::text(text));
                }
                let result = self.number(context, left, frame, span)? + self.number(context, right, frame, span)?;
                self.finite(context, result, frame, span)
            }
            BinaryOp::Subtract => {
                let result = self.number(context, left, frame, span)? - self.number(context, right, frame, span)?;
                self.finite(context, result, frame, span)
            }
            BinaryOp::Multiply => {
                let result = self.number(context, left, frame, span)? * self.number(context, right, frame, span)?;
                self.finite(context, result, frame, span)
            }
            BinaryOp::Divide => {
                let divisor = self.number(context, right, frame, span)?;
                if divisor == 0.0 {
                    return Err(self.error(context, frame, span, ErrorCode::E_RUNTIME_DIV_ZERO, "division by zero"));
                }
                let result = self.number(context, left, frame, span)? / divisor;
                self.finite(context, result, frame, span)
            }
            BinaryOp::Remainder => {
                let dividend = self.number(context, left, frame, span)?;
                let divisor = self.number(context, right, frame, span)?;
                if dividend.fract() != 0.0 || divisor.fract() != 0.0 {
                    return Err(self.error(context, frame, span, ErrorCode::E_RUNTIME_TYPE, "% requires integer operands"));
                }
                if divisor == 0.0 {
                    return Err(self.error(context, frame, span, ErrorCode::E_RUNTIME_DIV_ZERO, "division by zero"));
                }
                Ok(Value::Number(dividend % divisor))
            }
            BinaryOp::Equal => Ok(Value::Bool(self.equal(left, right, false))),
            BinaryOp::NotEqual => Ok(Value::Bool(!self.equal(left, right, false))),
            BinaryOp::StrictEqual => Ok(Value::Bool(self.equal(left, right, true))),
            BinaryOp::StrictNotEqual => Ok(Value::Bool(!self.equal(left, right, true))),
            BinaryOp::Less | BinaryOp::Greater | BinaryOp::LessEqual | BinaryOp::GreaterEqual => {
                let order = self.compare(context, left, right, frame, span)?;
                Ok(Value::Bool(match operator {
                    BinaryOp::Less => order == Ordering::Less,
                    BinaryOp::Greater => order == Ordering::Greater,
                    BinaryOp::LessEqual => order != Ordering::Greater,
                    _ => order != Ordering::Less,
                }))
            }
            BinaryOp::In => match right {
                Value::List(list) => Ok(Value::Bool(list.iter().any(|item| self.equal(item, left, false)))),
                Value::Map(map) => {
                    let key = self.stringify(context, left, frame, span)?;
                    Ok(Value::Bool(map.contains_key(&key)))
                }
                Value::Str(text) | Value::Safe(text) => {
                    let needle = self.stringify(context, left, frame, span)?;
                    Ok(Value::Bool(text.contains(&needle)))
                }
                _ => Err(self.error(
                    context,
                    frame,
                    span,
                    ErrorCode::E_RUNTIME_TYPE,
                    "in requires a list, map or string on the right",
                )),
            },
            BinaryOp::And | BinaryOp::Or | BinaryOp::Coalesce => Err(self.error(
                context,
                frame,
                span,
                ErrorCode::E_RUNTIME_TYPE,
                "short-circuit operator requires control flow",
            )),
        }
    }

    /// Converts one value to text at its source location.
    pub fn stringify(&self, context: &RenderContext<'_>, value: &Value, frame: &Frame, span: Span) -> Result<String, RenderError> {
        stringify(value).map_err(|error| match error {
            StringifyError::NoText => self.error(
                context,
                frame,
                span,
                ErrorCode::E_RUNTIME_STRINGIFY,
                "a list or map cannot be converted to text",
            ),
            StringifyError::NotFinite(error) => {
                self.error(context, frame, span, ErrorCode::E_INTERNAL, format!("internal failure: {error}"))
            }
        })
    }

    /// Applies echo escaping while preserving safe text.
    pub fn escape(&self, context: &RenderContext<'_>, value: &Value, frame: &Frame, span: Span) -> Result<String, RenderError> {
        match value {
            Value::Safe(text) => Ok(text.clone()),
            Value::Str(text) => Ok(escape_html(text).into_owned()),
            other => Ok(escape_html(&self.stringify(context, other, frame, span)?).into_owned()),
        }
    }

    /// Converts one value to a number.
    pub fn number(&self, context: &RenderContext<'_>, value: &Value, frame: &Frame, span: Span) -> Result<f64, RenderError> {
        to_number(value).map_err(|error| self.error(context, frame, span, error.code, error.message))
    }

    /// Rejects non-finite arithmetic results.
    pub fn finite(&self, context: &RenderContext<'_>, value: f64, frame: &Frame, span: Span) -> Result<Value, RenderError> {
        if value.is_finite() {
            Ok(Value::Number(value))
        } else {
            Err(self.error(context, frame, span, ErrorCode::E_RUNTIME_TYPE, "arithmetic result is not finite"))
        }
    }

    /// Applies loose or strict equality.
    pub fn equal(&self, left: &Value, right: &Value, strict: bool) -> bool {
        if strict {
            strict_equals(left, right)
        } else {
            loose_equals(left, right)
        }
    }

    /// Orders two values or returns a positioned runtime error.
    pub fn compare(
        &self,
        context: &RenderContext<'_>,
        left: &Value,
        right: &Value,
        frame: &Frame,
        span: Span,
    ) -> Result<Ordering, RenderError> {
        compare_values(left, right).ok_or_else(|| {
            self.error(
                context,
                frame,
                span,
                ErrorCode::E_RUNTIME_COMPARE,
                format!("{} and {} have no order", left.value_type().name(), right.value_type().name()),
            )
        })
    }

    /// Reads a fixed member name (EXP-18, VAL-19).
    pub fn member(
        &self,
        context: &RenderContext<'_>,
        container: &Value,
        key: &str,
        frame: &Frame,
        span: Span,
    ) -> Result<Value, RenderError> {
        self.index(context, container, &Value::text(key), frame, span)
    }

    /// Calls a public method on the original assigned object and binds its result (VAL-19).
    pub fn member_call(
        &self,
        context: &RenderContext<'_>,
        container: &Value,
        method: &str,
        args: Vec<Value>,
        frame: &Frame,
        span: Span,
    ) -> Result<Value, RenderError> {
        let Value::Object(object) = container else {
            return Err(self.error(
                context,
                frame,
                span,
                ErrorCode::E_RUNTIME_UNKNOWN_FUNCTION,
                format!("{method} is not a function"),
            ));
        };
        match object.call(method, &host_arguments(&args)) {
            None => Err(self.error(
                context,
                frame,
                span,
                ErrorCode::E_RUNTIME_UNKNOWN_FUNCTION,
                format!("{method} is not a function"),
            )),
            Some(result) => host_result(self, context, result, frame, span),
        }
    }

    /// Calls a registered logical class function and binds its result.
    pub fn class_call(
        &self,
        context: &RenderContext<'_>,
        class_name: &str,
        method: &str,
        args: Vec<Value>,
        frame: &Frame,
        span: Span,
    ) -> Result<Value, RenderError> {
        let Some(function) = context.services.class_function(class_name, method) else {
            return Err(self.error(
                context,
                frame,
                span,
                ErrorCode::E_RUNTIME_UNKNOWN_FUNCTION,
                format!("{class_name}::{method} is not a function"),
            ));
        };
        let result = function(&host_arguments(&args), &FunctionContext { env: &context.env });
        host_result(self, context, result, frame, span)
    }

    /// Reads a dynamic list or map key, or a public field of a native object (EXP-19, VAL-19).
    pub fn index(
        &self,
        context: &RenderContext<'_>,
        container: &Value,
        key: &Value,
        frame: &Frame,
        span: Span,
    ) -> Result<Value, RenderError> {
        match container {
            Value::Map(map) => {
                if let Some(text) = key.as_text() {
                    return Ok(absent_is_null(map.get(text)));
                }
                if let Value::Number(number) = key
                    && number.fract() == 0.0
                {
                    let text = crate::value::number::number_to_string(*number)
                        .map_err(|error| self.error(context, frame, span, ErrorCode::E_INTERNAL, format!("internal failure: {error}")))?;
                    return Ok(absent_is_null(map.get(&text)));
                }
                Err(key_type(self, context, "map", key, frame, span))
            }
            Value::List(list) => {
                // EXP-19: an integral number or an index text names the element at that index; a number below 0 or not
                // below the length, a fraction and any other key name none. The number is compared before it is
                // converted, so no cast saturates.
                // A key of another type, a fraction included, is runtime_type.
                let position: Option<usize> = match key {
                    Value::Number(number) if number.fract() == 0.0 && *number >= 0.0 && *number < MAX_SAFE => list_index(*number),
                    Value::Number(number) if number.fract() == 0.0 => None,
                    other => match other.as_text() {
                        // EXP-19: digits beyond usize are an index beyond every list.
                        #[allow(clippy::disallowed_methods, reason = "EXP-19: an index text beyond usize names no element")]
                        Some(text) if is_index_text(text) => text.parse::<usize>().ok(),
                        Some(_) => None,
                        None => return Err(key_type(self, context, "list", key, frame, span)),
                    },
                };
                Ok(match position.and_then(|position| list.get(position)) {
                    Some(item) => item.clone(),
                    None => Value::Null,
                })
            }
            Value::Object(object) => {
                let Some(name) = key.as_text() else {
                    return Err(key_type(self, context, "native object", key, frame, span));
                };
                match object
                    .member(name)
                    .and_then(|value| value.map(|value| bind_value(&value)).transpose().map_err(HostError::Data))
                {
                    Ok(value) => Ok(absent_is_null(value.as_ref())),
                    Err(error) => Err(host_failure(self, context, error, frame, span)),
                }
            }
            _ => Ok(Value::Null),
        }
    }

    /// Checks the depth of a value that a list or map literal built (VAL-20).
    pub fn depth(&self, context: &RenderContext<'_>, value: Value, frame: &Frame, span: Span) -> Result<Value, RenderError> {
        if value.depth_within(MAX_DEPTH) {
            Ok(value)
        } else {
            Err(self.error(
                context,
                frame,
                span,
                ErrorCode::E_RUNTIME_LIMIT,
                format!("a list or map literal nests deeper than {MAX_DEPTH} levels"),
            ))
        }
    }

    /// Normalizes a loop operand.
    pub fn entries(&self, context: &RenderContext<'_>, value: &Value, frame: &Frame, span: Span) -> Result<Vec<RuntimeEntry>, RenderError> {
        match value {
            Value::Null => Ok(Vec::new()),
            Value::List(list) => Ok(list
                .iter()
                .enumerate()
                .map(|(index, value)| (Value::Number(index as f64), value.clone()))
                .collect()),
            Value::Map(map) => Ok(map.iter().map(|(key, value)| (Value::text(key.clone()), value.clone())).collect()),
            _ => Err(self.error(
                context,
                frame,
                span,
                ErrorCode::E_RUNTIME_TYPE,
                "loop requires a list, a map or null",
            )),
        }
    }

    /// Validates and expands one list spread operand.
    pub fn list_spread(&self, context: &RenderContext<'_>, value: &Value, frame: &Frame, span: Span) -> Result<Vec<Value>, RenderError> {
        match value {
            Value::List(list) => Ok(list.to_vec()),
            _ => Err(self.error(context, frame, span, ErrorCode::E_RUNTIME_TYPE, "spread in a list requires a list")),
        }
    }

    /// Validates and expands one map spread operand.
    pub fn map_spread(
        &self,
        context: &RenderContext<'_>,
        value: &Value,
        frame: &Frame,
        span: Span,
    ) -> Result<crate::value::OrderedMap, RenderError> {
        match value {
            Value::Map(map) => Ok((**map).clone()),
            _ => Err(self.error(context, frame, span, ErrorCode::E_RUNTIME_TYPE, "spread in a map requires a map")),
        }
    }

    /// Invokes a built-in or host function and binds its result.
    pub fn call(&self, context: &RenderContext<'_>, name: &str, args: Vec<Value>, frame: &Frame, span: Span) -> Result<Value, RenderError> {
        let function_context = FunctionContext { env: &context.env };
        if let Some(builtin) = builtins().get(name) {
            if args.len() < builtin.min || args.len() > builtin.max {
                let range = if builtin.min == builtin.max {
                    builtin.min.to_string()
                } else {
                    format!("{} to {}", builtin.min, builtin.max)
                };
                return Err(self.error(
                    context,
                    frame,
                    span,
                    ErrorCode::E_RUNTIME_ARITY,
                    format!("{name} accepts {range} arguments, got {}", args.len()),
                ));
            }
            return (builtin.call)(&args, &function_context).map_err(|error| self.error(context, frame, span, error.code, error.message));
        }
        let Some(host) = context.services.host_function(name) else {
            return Err(self.error(
                context,
                frame,
                span,
                ErrorCode::E_RUNTIME_UNKNOWN_FUNCTION,
                format!("{name} is not a function"),
            ));
        };
        let result = host(&host_arguments(&args), &function_context);
        host_result(self, context, result, frame, span)
    }

    /// Checks expression and iteration limits.
    pub fn limit(&self, context: &RenderContext<'_>, kind: &str, count: usize, frame: &Frame, span: Span) -> Result<(), RenderError> {
        let limits = context.services.limits();
        let (maximum, message) = if kind == "expression" {
            (limits.expression_depth, "expression nesting exceeds")
        } else {
            (limits.iterations, "loop iterations exceed")
        };
        if count > maximum {
            return Err(self.error(context, frame, span, ErrorCode::E_RUNTIME_LIMIT, format!("{message} {maximum}")));
        }
        Ok(())
    }

    /// Creates one positioned runtime error.
    pub fn error(
        &self,
        context: &RenderContext<'_>,
        frame: &Frame,
        span: Span,
        code: ErrorCode,
        message: impl Into<String>,
    ) -> RenderError {
        context.fail(code, Some(frame), Some(span), message)
    }
}

/// Binds the result of host code (VAL-11, FUN-45, FUN-46): a value that cannot be bound fails with its data code at the
/// call, and the error of host code reaches the caller unchanged.
fn host_result(
    bindings: &RuntimeBindings,
    context: &RenderContext<'_>,
    result: Result<Value, HostError>,
    frame: &Frame,
    span: Span,
) -> Result<Value, RenderError> {
    match result.and_then(|value| bind_value(&value).map_err(HostError::Data)) {
        Ok(value) => Ok(value),
        Err(error) => Err(host_failure(bindings, context, error, frame, span)),
    }
}

/// The render failure of a host error (FUN-46): a binding error at the call or the lookup, or the error of host code
/// unchanged.
fn host_failure(bindings: &RuntimeBindings, context: &RenderContext<'_>, error: HostError, frame: &Frame, span: Span) -> RenderError {
    match error {
        HostError::Data(error) => bindings.error(context, frame, span, error.code, error.message),
        HostError::Raised(raised) => RenderError::Raised(raised),
        HostError::Callback(error) => RenderError::Callback(error),
    }
}

/// The index that a number names: the caller checked that it is integral, not negative and below 2^53, so the
/// conversion is exact; an index beyond usize names no element (EXP-19).
fn list_index(number: f64) -> Option<usize> {
    #[allow(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        reason = "EXP-19: the caller checked an integral number from 0 to 2^53, which u64 holds exactly"
    )]
    let index = number as u64;
    #[allow(clippy::disallowed_methods, reason = "EXP-19: an index beyond usize names no element")]
    usize::try_from(index).ok()
}

fn is_index_text(text: &str) -> bool {
    text == "0" || (text.starts_with(|character: char| ('1'..='9').contains(&character)) && text.bytes().all(|byte| byte.is_ascii_digit()))
}

/// VAL-21: the arguments that host code receives.
fn host_arguments(args: &[Value]) -> Vec<Value> {
    args.iter().map(Value::host_argument).collect()
}

    /// EXP-19: a key whose type names no entry of the container: runtime_type.
fn key_type(runtime: &RuntimeBindings, context: &RenderContext<'_>, container: &str, key: &Value, frame: &Frame, span: Span) -> RenderError {
        let found = match key {
            Value::Number(_) => "a fractional number",
            other => other.value_type().name(),
        };
        let expected = match container {
            "map" => "a map key is a string or an integer",
            "list" => "a list index is an integer or an index text",
            _ => "a member name of a native object is a string",
        };
        runtime.error(context, frame, span, ErrorCode::E_RUNTIME_TYPE, format!("{expected}, not {found}"))
    }
