//! Shared runtime value, function and error semantics for AST and generated programs.

use crate::ast::{BinaryOp, UnaryOp};
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

    /// Applies one eager unary operator.
    pub fn unary(
        &self,
        context: &RenderContext<'_>,
        operator: UnaryOp,
        operand: &Value,
        frame: &Frame,
        span: Span,
    ) -> Result<Value, TemplateError> {
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
    ) -> Result<Value, TemplateError> {
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
                value if value.is_string() => {
                    let needle = self.stringify(context, left, frame, span)?;
                    Ok(Value::Bool(value.as_text().unwrap_or("").contains(&needle)))
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
        if let Value::Object(object) = container { return object.member(key).unwrap_or(Value::Null); }
        self.index(container, &Value::text(key))
    }

    /// Calls a public method on the original assigned object.
    pub fn member_call(&self, context: &RenderContext<'_>, container: &Value, method: &str, args: Vec<Value>, frame: &Frame, span: Span) -> Result<Value, TemplateError> {
        let Value::Object(object) = container else { return Err(self.error(context, frame, span, ErrorCode::E_RUNTIME_UNKNOWN_FUNCTION, format!("{method} is not a function"))); };
        object.call(method, &args).map_err(|message| self.error(context, frame, span, ErrorCode::E_RUNTIME_HOST_FUNCTION, format!("{method} failed: {message}")))
    }

    /// Calls a registered logical class function.
    pub fn class_call(&self, context: &RenderContext<'_>, class_name: &str, method: &str, args: Vec<Value>, frame: &Frame, span: Span) -> Result<Value, TemplateError> {
        let Some(function) = context.services.class_function(class_name, method) else { return Err(self.error(context, frame, span, ErrorCode::E_RUNTIME_UNKNOWN_FUNCTION, format!("{class_name}::{method} is not a function"))); };
        function(&args, &FunctionContext { env: &context.env }).map_err(|message| self.error(context, frame, span, ErrorCode::E_RUNTIME_HOST_FUNCTION, format!("{class_name}::{method} failed: {message}")))
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

    /// Validates and expands one list spread operand.
    pub fn list_spread(&self, context: &RenderContext<'_>, value: &Value, frame: &Frame, span: Span) -> Result<Vec<Value>, TemplateError> {
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
    ) -> Result<crate::value::OrderedMap, TemplateError> {
        match value {
            Value::Map(map) => Ok((**map).clone()),
            _ => Err(self.error(context, frame, span, ErrorCode::E_RUNTIME_TYPE, "spread in a map requires a map")),
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
