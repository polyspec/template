//! Expression evaluation (docs/spec/expressions.md).

use crate::ast::{BinaryOp, Expr, LoopMetaField, MapEntry};
use crate::error::{ErrorCode, Span, TemplateError};
use crate::render::context::{Frame, RenderContext, Scope};
use crate::render::runtime_bindings::RuntimeBindings;
use crate::value::{OrderedMap, Value};

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
            Expr::MemberCall { object, method, args, span } => {
                let object = self.evaluate(object, frame, scope)?;
                let values = args.iter().map(|arg| self.evaluate(arg, frame, scope)).collect::<Result<Vec<_>, _>>()?;
                self.runtime.member_call(self.context, &object, method, values, frame, *span)
            }
            Expr::ClassCall { class_name, method, args, span } => {
                let values = args.iter().map(|arg| self.evaluate(arg, frame, scope)).collect::<Result<Vec<_>, _>>()?;
                self.runtime.class_call(self.context, class_name, method, values, frame, *span)
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
                self.runtime.unary(self.context, *op, &value, frame, *span)
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
                        let value = self.evaluate(expr, frame, scope)?;
                        list.extend(self.runtime.list_spread(self.context, &value, frame, *span)?);
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
                            let value = self.evaluate(inner, frame, scope)?;
                            for (key, value) in self.runtime.map_spread(self.context, &value, frame, span)?.iter() {
                                map.insert(key.clone(), value.clone());
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
                let left = self.evaluate(left, frame, scope)?;
                if !self.runtime.truthy(&left) {
                    return Ok(Value::Bool(false));
                }
                let right = self.evaluate(right, frame, scope)?;
                return Ok(Value::Bool(self.runtime.truthy(&right)));
            }
            BinaryOp::Or => {
                let left = self.evaluate(left, frame, scope)?;
                if self.runtime.truthy(&left) {
                    return Ok(Value::Bool(true));
                }
                let right = self.evaluate(right, frame, scope)?;
                return Ok(Value::Bool(self.runtime.truthy(&right)));
            }
            BinaryOp::Coalesce => {
                let left = self.evaluate(left, frame, scope)?;
                return if left != Value::Null {
                    Ok(left)
                } else {
                    self.evaluate(right, frame, scope)
                };
            }
            _ => {}
        }
        let left = self.evaluate(left, frame, scope)?;
        let right = self.evaluate(right, frame, scope)?;
        self.runtime.binary(self.context, op, &left, &right, frame, span)
    }
}
