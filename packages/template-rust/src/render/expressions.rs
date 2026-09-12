//! Expression evaluation (docs/spec/expressions.md).

use crate::ast::{BinaryOp, Expr, LoopMetaField, MapEntry, UnaryOp};
use crate::error::{ErrorCode, Span, TemplateError};
use crate::render::context::{Frame, RenderContext, Scope};
use crate::render::runtime_bindings::RuntimeBindings;
use crate::value::{OrderedMap, Value};
use std::cmp::Ordering;

/// Evaluates expressions against a frame and a scope.
pub struct Evaluator<'c, 'e> {
    context: &'c mut RenderContext<'e>,
    runtime: RuntimeBindings,
    depth: usize,
}

impl<'c, 'e> Evaluator<'c, 'e> {
    /// Creates an evaluator over a render context.
    pub fn new(context: &'c mut RenderContext<'e>) -> Evaluator<'c, 'e> {
        Evaluator {
            context,
            runtime: RuntimeBindings::new(),
            depth: 0,
        }
    }

    fn fail(&self, frame: &Frame, span: Span, code: ErrorCode, message: impl Into<String>) -> TemplateError {
        self.runtime.error(self.context, frame, span, code, message)
    }

    /// Evaluates an expression.
    pub fn evaluate(&mut self, expr: &Expr, frame: &Frame, scope: &mut Scope) -> Result<Value, TemplateError> {
        self.depth += 1;
        if let Err(error) = self.runtime.limit(self.context, "expression", self.depth, frame, expr.span()) {
            self.depth -= 1;
            return Err(error);
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
                Ok(self.runtime.member(&container, key))
            }
            Expr::Index { object, index, .. } => {
                let container = self.evaluate(object, frame, scope)?;
                let key = self.evaluate(index, frame, scope)?;
                Ok(self.runtime.index(&container, &key))
            }
            Expr::Call { name, args, span } => {
                let mut values = Vec::with_capacity(args.len());
                for arg in args {
                    values.push(self.evaluate(arg, frame, scope)?);
                }
                self.runtime.call(self.context, name, values, frame, *span)
            }
            Expr::Unary { op, operand, span } => {
                let value = self.evaluate(operand, frame, scope)?;
                if *op == UnaryOp::Not {
                    return Ok(Value::Bool(!self.runtime.truthy(&value)));
                }
                let number = self.runtime.number(self.context, &value, frame, *span)?;
                self.runtime.finite(self.context, -number, frame, *span)
            }
            Expr::Binary { op, left, right, span } => self.binary(*op, left, right, *span, frame, scope),
            Expr::Ternary { test, then, r#else, .. } => {
                let condition = self.evaluate(test, frame, scope)?;
                match then {
                    None => {
                        if self.runtime.truthy(&condition) {
                            Ok(condition)
                        } else {
                            self.evaluate(r#else, frame, scope)
                        }
                    }
                    Some(then) => {
                        if self.runtime.truthy(&condition) {
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
                            let key_text = self.runtime.stringify(self.context, &key_value, frame, key.span())?;
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
                if !self.runtime.truthy(&l) {
                    return Ok(Value::Bool(false));
                }
                let right = self.evaluate(right, frame, scope)?;
                return Ok(Value::Bool(self.runtime.truthy(&right)));
            }
            BinaryOp::Or => {
                let l = self.evaluate(left, frame, scope)?;
                if self.runtime.truthy(&l) {
                    return Ok(Value::Bool(true));
                }
                let right = self.evaluate(right, frame, scope)?;
                return Ok(Value::Bool(self.runtime.truthy(&right)));
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
                    let mut text = self.runtime.stringify(self.context, &l, frame, span)?;
                    text.push_str(&self.runtime.stringify(self.context, &r, frame, span)?);
                    return Ok(Value::text(text));
                }
                let sum = self.runtime.number(self.context, &l, frame, span)? + self.runtime.number(self.context, &r, frame, span)?;
                self.runtime.finite(self.context, sum, frame, span)
            }
            BinaryOp::Subtract => {
                let value = self.runtime.number(self.context, &l, frame, span)? - self.runtime.number(self.context, &r, frame, span)?;
                self.runtime.finite(self.context, value, frame, span)
            }
            BinaryOp::Multiply => {
                let value = self.runtime.number(self.context, &l, frame, span)? * self.runtime.number(self.context, &r, frame, span)?;
                self.runtime.finite(self.context, value, frame, span)
            }
            BinaryOp::Divide => {
                let divisor = self.runtime.number(self.context, &r, frame, span)?;
                if divisor == 0.0 {
                    return Err(self.fail(frame, span, ErrorCode::E_RUNTIME_DIV_ZERO, "division by zero"));
                }
                let value = self.runtime.number(self.context, &l, frame, span)? / divisor;
                self.runtime.finite(self.context, value, frame, span)
            }
            BinaryOp::Remainder => {
                let dividend = self.runtime.number(self.context, &l, frame, span)?;
                let divisor = self.runtime.number(self.context, &r, frame, span)?;
                if dividend.fract() != 0.0 || divisor.fract() != 0.0 {
                    return Err(self.fail(frame, span, ErrorCode::E_RUNTIME_TYPE, "% requires integer operands"));
                }
                if divisor == 0.0 {
                    return Err(self.fail(frame, span, ErrorCode::E_RUNTIME_DIV_ZERO, "division by zero"));
                }
                Ok(Value::Number(dividend % divisor))
            }
            BinaryOp::Equal => Ok(Value::Bool(self.runtime.equal(&l, &r, false))),
            BinaryOp::NotEqual => Ok(Value::Bool(!self.runtime.equal(&l, &r, false))),
            BinaryOp::StrictEqual => Ok(Value::Bool(self.runtime.equal(&l, &r, true))),
            BinaryOp::StrictNotEqual => Ok(Value::Bool(!self.runtime.equal(&l, &r, true))),
            BinaryOp::Less | BinaryOp::Greater | BinaryOp::LessEqual | BinaryOp::GreaterEqual => {
                let order = self.runtime.compare(self.context, &l, &r, frame, span)?;
                Ok(Value::Bool(match op {
                    BinaryOp::Less => order == Ordering::Less,
                    BinaryOp::Greater => order == Ordering::Greater,
                    BinaryOp::LessEqual => order != Ordering::Greater,
                    _ => order != Ordering::Less,
                }))
            }
            BinaryOp::In => match &r {
                Value::List(list) => Ok(Value::Bool(list.iter().any(|item| self.runtime.equal(item, &l, false)))),
                Value::Map(map) => {
                    let key = self.runtime.stringify(self.context, &l, frame, span)?;
                    Ok(Value::Bool(map.contains_key(&key)))
                }
                other if other.is_string() => {
                    let needle = self.runtime.stringify(self.context, &l, frame, span)?;
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
}

fn is_collection(value: &Value) -> bool {
    matches!(value, Value::List(_) | Value::Map(_))
}
