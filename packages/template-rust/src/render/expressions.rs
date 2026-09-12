//! Expression evaluation (docs/spec/expressions.md).

use crate::ast::{BinaryOp, Expr, LoopMetaField, MapEntry, UnaryOp};
use crate::error::{ErrorCode, Span, TemplateError};
use crate::functions::{FunctionContext, builtins, to_number};
use crate::render::context::{Frame, RenderContext, Scope};
use crate::value::bind::bind;
use crate::value::{OrderedMap, Value, compare_values, loose_equals, strict_equals, stringify};
use std::cmp::Ordering;

/// Evaluates expressions against a frame and a scope.
pub struct Evaluator<'c, 'e> {
    context: &'c mut RenderContext<'e>,
    depth: usize,
}

impl<'c, 'e> Evaluator<'c, 'e> {
    /// Creates an evaluator over a render context.
    pub fn new(context: &'c mut RenderContext<'e>) -> Evaluator<'c, 'e> {
        Evaluator { context, depth: 0 }
    }

    fn fail(&self, frame: &Frame, span: Span, code: ErrorCode, message: impl Into<String>) -> TemplateError {
        self.context.fail(code, Some(frame), Some(span), message)
    }

    /// Evaluates an expression.
    pub fn evaluate(&mut self, expr: &Expr, frame: &Frame, scope: &mut Scope) -> Result<Value, TemplateError> {
        self.depth += 1;
        if self.depth > self.context.engine.limits.expression_depth {
            self.depth -= 1;
            return Err(self.fail(
                frame,
                expr.span(),
                ErrorCode::E_RUNTIME_LIMIT,
                format!("expression nesting exceeds {}", self.context.engine.limits.expression_depth),
            ));
        }
        let result = self.evaluate_node(expr, frame, scope);
        self.depth -= 1;
        result
    }

    fn evaluate_node(&mut self, expr: &Expr, frame: &Frame, scope: &mut Scope) -> Result<Value, TemplateError> {
        match expr {
            Expr::Literal { value, .. } => Ok(match value {
                crate::ast::LiteralValue::Null => Value::Null,
                crate::ast::LiteralValue::Bool(b) => Value::Bool(*b),
                crate::ast::LiteralValue::Number(n) => Value::Number(*n),
                crate::ast::LiteralValue::String(s) => Value::text(s.clone()),
            }),
            Expr::Var { name, .. } => Ok(scope.lookup(frame, name)),
            Expr::LoopMeta { r#loop, field, span } => {
                let Some(meta) = scope.loop_meta(r#loop) else {
                    return Err(self.fail(
                        frame,
                        *span,
                        ErrorCode::E_RUNTIME_UNKNOWN_LOOP,
                        format!("{loop} is not an active loop variable", loop = r#loop),
                    ));
                };
                Ok(match field {
                    LoopMetaField::Index => Value::Number(meta.index as f64),
                    LoopMetaField::Key => meta.key.clone(),
                    LoopMetaField::Value => meta.value.clone(),
                    LoopMetaField::First => Value::Bool(meta.first),
                    LoopMetaField::Last => Value::Bool(meta.last),
                    LoopMetaField::Size => Value::Number(meta.size as f64),
                })
            }
            Expr::Member { object, key, .. } => {
                let container = self.evaluate(object, frame, scope)?;
                Ok(lookup(&container, &Value::text(key.clone())))
            }
            Expr::Index { object, index, .. } => {
                let container = self.evaluate(object, frame, scope)?;
                let key = self.evaluate(index, frame, scope)?;
                Ok(lookup(&container, &key))
            }
            Expr::Call { name, args, span } => {
                let mut values = Vec::with_capacity(args.len());
                for arg in args {
                    values.push(self.evaluate(arg, frame, scope)?);
                }
                self.call(name, values, frame, *span)
            }
            Expr::Unary { op, operand, span } => {
                let value = self.evaluate(operand, frame, scope)?;
                if *op == UnaryOp::Not {
                    return Ok(Value::Bool(!value.is_truthy()));
                }
                let number = self.number(&value, frame, *span)?;
                self.finite(-number, frame, *span)
            }
            Expr::Binary { op, left, right, span } => self.binary(*op, left, right, *span, frame, scope),
            Expr::Ternary { test, then, r#else, .. } => {
                let condition = self.evaluate(test, frame, scope)?;
                match then {
                    None => {
                        if condition.is_truthy() {
                            Ok(condition)
                        } else {
                            self.evaluate(r#else, frame, scope)
                        }
                    }
                    Some(then) => {
                        if condition.is_truthy() {
                            self.evaluate(then, frame, scope)
                        } else {
                            self.evaluate(r#else, frame, scope)
                        }
                    }
                }
            }
            Expr::List { items, .. } => {
                let mut list = Vec::new();
                for item in items {
                    if let Expr::Spread { expr, span } = item {
                        match self.evaluate(expr, frame, scope)? {
                            Value::List(values) => list.extend(values.iter().cloned()),
                            _ => return Err(self.fail(frame, *span, ErrorCode::E_RUNTIME_TYPE, "spread in a list requires a list")),
                        }
                    } else {
                        list.push(self.evaluate(item, frame, scope)?);
                    }
                }
                Ok(Value::list(list))
            }
            Expr::Map { entries, .. } => {
                let mut map = OrderedMap::new();
                for entry in entries {
                    match entry {
                        MapEntry::Spread(spread) => {
                            let span = spread.span();
                            let inner = match spread {
                                Expr::Spread { expr, .. } => expr,
                                other => other,
                            };
                            match self.evaluate(inner, frame, scope)? {
                                Value::Map(values) => {
                                    for (key, value) in values.iter() {
                                        map.insert(key.clone(), value.clone());
                                    }
                                }
                                _ => return Err(self.fail(frame, span, ErrorCode::E_RUNTIME_TYPE, "spread in a map requires a map")),
                            }
                        }
                        MapEntry::Entry { key, value } => {
                            let key_value = self.evaluate(key, frame, scope)?;
                            let key_text = self.stringify(&key_value, frame, key.span())?;
                            let value = self.evaluate(value, frame, scope)?;
                            map.insert(key_text, value);
                        }
                    }
                }
                Ok(Value::map(map))
            }
            Expr::Spread { span, .. } => Err(self.fail(frame, *span, ErrorCode::E_RUNTIME_TYPE, "spread outside of a literal")),
        }
    }

    fn binary(
        &mut self,
        op: BinaryOp,
        left: &Expr,
        right: &Expr,
        span: Span,
        frame: &Frame,
        scope: &mut Scope,
    ) -> Result<Value, TemplateError> {
        match op {
            BinaryOp::And => {
                let l = self.evaluate(left, frame, scope)?;
                if !l.is_truthy() {
                    return Ok(Value::Bool(false));
                }
                return Ok(Value::Bool(self.evaluate(right, frame, scope)?.is_truthy()));
            }
            BinaryOp::Or => {
                let l = self.evaluate(left, frame, scope)?;
                if l.is_truthy() {
                    return Ok(Value::Bool(true));
                }
                return Ok(Value::Bool(self.evaluate(right, frame, scope)?.is_truthy()));
            }
            BinaryOp::Coalesce => {
                let l = self.evaluate(left, frame, scope)?;
                return if l != Value::Null {
                    Ok(l)
                } else {
                    self.evaluate(right, frame, scope)
                };
            }
            _ => {}
        }
        let l = self.evaluate(left, frame, scope)?;
        let r = self.evaluate(right, frame, scope)?;
        match op {
            BinaryOp::Add => {
                if is_collection(&l) || is_collection(&r) {
                    return Err(self.fail(
                        frame,
                        span,
                        ErrorCode::E_RUNTIME_STRINGIFY,
                        "a list or map cannot be converted to text",
                    ));
                }
                if l.is_string() || r.is_string() {
                    let mut text = self.stringify(&l, frame, span)?;
                    text.push_str(&self.stringify(&r, frame, span)?);
                    return Ok(Value::text(text));
                }
                let sum = self.number(&l, frame, span)? + self.number(&r, frame, span)?;
                self.finite(sum, frame, span)
            }
            BinaryOp::Subtract => {
                let value = self.number(&l, frame, span)? - self.number(&r, frame, span)?;
                self.finite(value, frame, span)
            }
            BinaryOp::Multiply => {
                let value = self.number(&l, frame, span)? * self.number(&r, frame, span)?;
                self.finite(value, frame, span)
            }
            BinaryOp::Divide => {
                let divisor = self.number(&r, frame, span)?;
                if divisor == 0.0 {
                    return Err(self.fail(frame, span, ErrorCode::E_RUNTIME_DIV_ZERO, "division by zero"));
                }
                let value = self.number(&l, frame, span)? / divisor;
                self.finite(value, frame, span)
            }
            BinaryOp::Remainder => {
                let dividend = self.number(&l, frame, span)?;
                let divisor = self.number(&r, frame, span)?;
                if dividend.fract() != 0.0 || divisor.fract() != 0.0 {
                    return Err(self.fail(frame, span, ErrorCode::E_RUNTIME_TYPE, "% requires integer operands"));
                }
                if divisor == 0.0 {
                    return Err(self.fail(frame, span, ErrorCode::E_RUNTIME_DIV_ZERO, "division by zero"));
                }
                Ok(Value::Number(dividend % divisor))
            }
            BinaryOp::Equal => Ok(Value::Bool(loose_equals(&l, &r))),
            BinaryOp::NotEqual => Ok(Value::Bool(!loose_equals(&l, &r))),
            BinaryOp::StrictEqual => Ok(Value::Bool(strict_equals(&l, &r))),
            BinaryOp::StrictNotEqual => Ok(Value::Bool(!strict_equals(&l, &r))),
            BinaryOp::Less | BinaryOp::Greater | BinaryOp::LessEqual | BinaryOp::GreaterEqual => {
                let Some(order) = compare_values(&l, &r) else {
                    return Err(self.fail(
                        frame,
                        span,
                        ErrorCode::E_RUNTIME_COMPARE,
                        format!("{} and {} have no order", l.value_type().name(), r.value_type().name()),
                    ));
                };
                Ok(Value::Bool(match op {
                    BinaryOp::Less => order == Ordering::Less,
                    BinaryOp::Greater => order == Ordering::Greater,
                    BinaryOp::LessEqual => order != Ordering::Greater,
                    _ => order != Ordering::Less,
                }))
            }
            BinaryOp::In => match &r {
                Value::List(list) => Ok(Value::Bool(list.iter().any(|item| loose_equals(item, &l)))),
                Value::Map(map) => {
                    let key = self.stringify(&l, frame, span)?;
                    Ok(Value::Bool(map.contains_key(&key)))
                }
                other if other.is_string() => {
                    let needle = self.stringify(&l, frame, span)?;
                    Ok(Value::Bool(other.as_text().unwrap_or("").contains(&needle)))
                }
                _ => Err(self.fail(
                    frame,
                    span,
                    ErrorCode::E_RUNTIME_TYPE,
                    "in requires a list, map or string on the right",
                )),
            },
            // The short-circuiting operators returned above.
            BinaryOp::And | BinaryOp::Or | BinaryOp::Coalesce => unreachable!("short-circuiting operator"),
        }
    }

    fn number(&self, value: &Value, frame: &Frame, span: Span) -> Result<f64, TemplateError> {
        to_number(value).map_err(|error| self.fail(frame, span, error.code, error.message))
    }

    fn finite(&self, value: f64, frame: &Frame, span: Span) -> Result<Value, TemplateError> {
        if value.is_finite() {
            Ok(Value::Number(value))
        } else {
            Err(self.fail(frame, span, ErrorCode::E_RUNTIME_TYPE, "arithmetic result is not finite"))
        }
    }

    /// Stringifies a value; a list or map is E_RUNTIME_STRINGIFY at the span.
    pub fn stringify(&self, value: &Value, frame: &Frame, span: Span) -> Result<String, TemplateError> {
        stringify(value).map_err(|_| {
            self.fail(
                frame,
                span,
                ErrorCode::E_RUNTIME_STRINGIFY,
                "a list or map cannot be converted to text",
            )
        })
    }

    fn call(&mut self, name: &str, args: Vec<Value>, frame: &Frame, span: Span) -> Result<Value, TemplateError> {
        let function_context = FunctionContext { env: &self.context.env };
        if let Some(builtin) = builtins().get(name) {
            if args.len() < builtin.min || args.len() > builtin.max {
                let range = if builtin.min == builtin.max {
                    builtin.min.to_string()
                } else {
                    format!("{} to {}", builtin.min, builtin.max)
                };
                return Err(self.fail(
                    frame,
                    span,
                    ErrorCode::E_RUNTIME_ARITY,
                    format!("{name} accepts {range} arguments, got {}", args.len()),
                ));
            }
            return (builtin.call)(&args, &function_context).map_err(|error| self.fail(frame, span, error.code, error.message));
        }
        let Some(host) = self.context.engine.functions.get(name) else {
            return Err(self.fail(
                frame,
                span,
                ErrorCode::E_RUNTIME_UNKNOWN_FUNCTION,
                format!("{name} is not a function"),
            ));
        };
        match host(&args, &function_context) {
            Ok(value) => {
                let json = crate::value::bind::to_json_value(&value);
                bind(&json).map_err(|error| self.fail(frame, span, error.code, error.message))
            }
            Err(message) => Err(self.fail(frame, span, ErrorCode::E_RUNTIME_HOST_FUNCTION, format!("{name} failed: {message}"))),
        }
    }
}

fn is_collection(value: &Value) -> bool {
    matches!(value, Value::List(_) | Value::Map(_))
}

/// EXP-19 lookup.
pub fn lookup(container: &Value, key: &Value) -> Value {
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
            let index: Option<i64> = match key {
                Value::Number(number) if number.fract() == 0.0 => Some(*number as i64),
                other => other
                    .as_text()
                    .and_then(|text| if is_index_text(text) { text.parse().ok() } else { None }),
            };
            match index {
                Some(index) if index >= 0 && (index as usize) < list.len() => list[index as usize].clone(),
                _ => Value::Null,
            }
        }
        _ => Value::Null,
    }
}

fn is_index_text(text: &str) -> bool {
    text == "0" || (text.starts_with(|c: char| ('1'..='9').contains(&c)) && text.bytes().all(|b| b.is_ascii_digit()))
}
