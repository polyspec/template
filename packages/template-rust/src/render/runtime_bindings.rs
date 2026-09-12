//! Shared runtime value, function and error semantics for AST and generated programs.

use crate::error::{ErrorCode, Span, TemplateError};
use crate::escape::escape_html;
use crate::functions::{FunctionContext, builtins, to_number};
use crate::render::context::{Frame, RenderContext};
use crate::value::bind::{bind, to_json_value};
use crate::value::{Value, compare_values, loose_equals, strict_equals, stringify};
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

    /// Converts one value to text at its source location.
    pub fn stringify(&self, context: &RenderContext<'_>, value: &Value, frame: &Frame, span: Span) -> Result<String, TemplateError> {
        stringify(value).map_err(|_| {
            self.error(
                context,
                frame,
                span,
                ErrorCode::E_RUNTIME_STRINGIFY,
                "a list or map cannot be converted to text",
            )
        })
    }

    /// Applies echo escaping while preserving safe text.
    pub fn escape(&self, context: &RenderContext<'_>, value: &Value, frame: &Frame, span: Span) -> Result<String, TemplateError> {
        match value {
            Value::Safe(text) => Ok(text.clone()),
            Value::Str(text) => Ok(escape_html(text).into_owned()),
            other => Ok(escape_html(&self.stringify(context, other, frame, span)?).into_owned()),
        }
    }

    /// Converts one value to a number.
    pub fn number(&self, context: &RenderContext<'_>, value: &Value, frame: &Frame, span: Span) -> Result<f64, TemplateError> {
        to_number(value).map_err(|error| self.error(context, frame, span, error.code, error.message))
    }

    /// Rejects non-finite arithmetic results.
    pub fn finite(&self, context: &RenderContext<'_>, value: f64, frame: &Frame, span: Span) -> Result<Value, TemplateError> {
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
    ) -> Result<Ordering, TemplateError> {
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

    /// Reads a fixed member name.
    pub fn member(&self, container: &Value, key: &str) -> Value {
        self.index(container, &Value::text(key))
    }

    /// Reads a dynamic list or map key.
    pub fn index(&self, container: &Value, key: &Value) -> Value {
        match container {
            Value::Map(map) => {
                if let Some(text) = key.as_text() {
                    return map.get(text).cloned().unwrap_or(Value::Null);
                }
                if let Value::Number(number) = key
                    && number.fract() == 0.0
                {
                    return map
                        .get(&crate::value::number::number_to_string(*number))
                        .cloned()
                        .unwrap_or(Value::Null);
                }
                Value::Null
            }
            Value::List(list) => {
                let position: Option<i64> = match key {
                    Value::Number(number) if number.fract() == 0.0 => Some(*number as i64),
                    other => other
                        .as_text()
                        .and_then(|text| if is_index_text(text) { text.parse().ok() } else { None }),
                };
                match position {
                    Some(position) if position >= 0 && (position as usize) < list.len() => list[position as usize].clone(),
                    _ => Value::Null,
                }
            }
            _ => Value::Null,
        }
    }

    /// Normalizes a loop operand.
    pub fn entries(
        &self,
        context: &RenderContext<'_>,
        value: &Value,
        frame: &Frame,
        span: Span,
    ) -> Result<Vec<RuntimeEntry>, TemplateError> {
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

    /// Invokes a built-in or host function and binds its result.
    pub fn call(
        &self,
        context: &RenderContext<'_>,
        name: &str,
        args: Vec<Value>,
        frame: &Frame,
        span: Span,
    ) -> Result<Value, TemplateError> {
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
        match host(&args, &function_context) {
            Ok(value) => bind(&to_json_value(&value)).map_err(|error| self.error(context, frame, span, error.code, error.message)),
            Err(message) => Err(self.error(
                context,
                frame,
                span,
                ErrorCode::E_RUNTIME_HOST_FUNCTION,
                format!("{name} failed: {message}"),
            )),
        }
    }

    /// Checks expression and iteration limits.
    pub fn limit(&self, context: &RenderContext<'_>, kind: &str, count: usize, frame: &Frame, span: Span) -> Result<(), TemplateError> {
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
    ) -> TemplateError {
        context.fail(code, Some(frame), Some(span), message)
    }
}

fn is_index_text(text: &str) -> bool {
    text == "0" || (text.starts_with(|character: char| ('1'..='9').contains(&character)) && text.bytes().all(|byte| byte.is_ascii_digit()))
}
