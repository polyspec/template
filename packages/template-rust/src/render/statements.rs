//! Statement rendering: text, echo, if, loop, assignment, include, block (RT-11 to RT-32).

use crate::ast::{Expr, IfBranch, Node, ScopeItem};
use crate::error::{ErrorCode, Span, TemplateError};
use crate::escape::escape_html;
use crate::loader::resolve_path;
use crate::render::context::{DefineEntry, Frame, LoopMeta, RenderContext, Scope};
use crate::render::expressions::Evaluator;
use crate::value::{OrderedMap, Value};
use std::rc::Rc;

/// Renders statement nodes into the output of a render context.
pub struct Renderer<'c, 'e> {
    context: &'c mut RenderContext<'e>,
}

impl<'c, 'e> Renderer<'c, 'e> {
    /// Creates a renderer over a render context.
    pub fn new(context: &'c mut RenderContext<'e>) -> Renderer<'c, 'e> {
        Renderer { context }
    }

    fn evaluate(&mut self, expr: &Expr, frame: &Frame, scope: &mut Scope) -> Result<Value, TemplateError> {
        Evaluator::new(self.context).evaluate(expr, frame, scope)
    }

    /// Renders a list of nodes.
    pub fn render_nodes(&mut self, nodes: &[Node], frame: &Frame, scope: &mut Scope) -> Result<(), TemplateError> {
        for node in nodes {
            self.render_node(node, frame, scope)?;
        }
        Ok(())
    }

    fn render_node(&mut self, node: &Node, frame: &Frame, scope: &mut Scope) -> Result<(), TemplateError> {
        match node {
            Node::Text { value, span } => self.context.write(value, frame, *span),
            Node::Echo { expr, span } => {
                let value = self.evaluate(expr, frame, scope)?;
                match &value {
                    // A safe string is written as is (RT-32).
                    Value::Safe(text) => self.context.write(text, frame, *span),
                    // A string is escaped from its own storage, without an intermediate copy.
                    Value::Str(text) => {
                        let escaped = escape_html(text);
                        self.context.write(&escaped, frame, *span)
                    }
                    other => {
                        let text = Evaluator::new(self.context).stringify(other, frame, expr.span())?;
                        let escaped = escape_html(&text);
                        self.context.write(&escaped, frame, *span)
                    }
                }
            }
            Node::If { branches, r#else, .. } => self.render_if(branches, r#else.as_deref(), frame, scope),
            Node::For {
                name,
                iter,
                body,
                empty,
                span,
            } => self.render_for(name, iter, body, empty.as_deref(), *span, frame, scope),
            Node::Set { name, expr, .. } => {
                let value = self.evaluate(expr, frame, scope)?;
                scope.locals.insert(name.clone(), value);
                Ok(())
            }
            Node::Include { path, span } => self.render_include(path, *span, frame, scope),
            Node::Block {
                id,
                path,
                scope: items,
                span,
            } => self.render_block(id.as_deref(), path.as_deref(), items, *span, frame, scope),
            Node::IfBlock { id, body, r#else, .. } => {
                if self.context.registry.contains_key(id) {
                    self.render_nodes(body, frame, scope)
                } else if let Some(nodes) = r#else {
                    self.render_nodes(nodes, frame, scope)
                } else {
                    Ok(())
                }
            }
        }
    }

    fn render_if(&mut self, branches: &[IfBranch], r#else: Option<&[Node]>, frame: &Frame, scope: &mut Scope) -> Result<(), TemplateError> {
        for branch in branches {
            if self.evaluate(&branch.test, frame, scope)?.is_truthy() {
                return self.render_nodes(&branch.body, frame, scope);
            }
        }
        if let Some(nodes) = r#else {
            return self.render_nodes(nodes, frame, scope);
        }
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    fn render_for(
        &mut self,
        name: &str,
        iter: &Expr,
        body: &[Node],
        empty: Option<&[Node]>,
        span: Span,
        frame: &Frame,
        scope: &mut Scope,
    ) -> Result<(), TemplateError> {
        let iterable = self.evaluate(iter, frame, scope)?;
        let entries: Vec<(Value, Value)> = match iterable {
            Value::Null => Vec::new(),
            Value::List(list) => list
                .iter()
                .enumerate()
                .map(|(index, value)| (Value::Number(index as f64), value.clone()))
                .collect(),
            Value::Map(map) => map.iter().map(|(key, value)| (Value::text(key.clone()), value.clone())).collect(),
            _ => {
                return Err(self.context.fail(
                    ErrorCode::E_RUNTIME_TYPE,
                    Some(frame),
                    Some(span),
                    "loop requires a list, a map or null",
                ));
            }
        };
        if entries.is_empty() {
            if let Some(nodes) = empty {
                return self.render_nodes(nodes, frame, scope);
            }
            return Ok(());
        }
        let previous = scope.locals.get(name).cloned();
        let size = entries.len();
        scope.loops.entry(name.to_string()).or_default().push(LoopMeta {
            index: 0,
            key: Value::Null,
            value: Value::Null,
            first: true,
            last: false,
            size,
        });
        let mut result = Ok(());
        for (index, (key, value)) in entries.into_iter().enumerate() {
            if let Err(error) = self.context.count_iteration(frame, span) {
                result = Err(error);
                break;
            }
            if let Some(meta) = scope.loops.get_mut(name).and_then(|stack| stack.last_mut()) {
                meta.index = index;
                meta.key = key;
                meta.value = value.clone();
                meta.first = index == 0;
                meta.last = index == size - 1;
            }
            scope.locals.insert(name.to_string(), value);
            if let Err(error) = self.render_nodes(body, frame, scope) {
                result = Err(error);
                break;
            }
        }
        if let Some(stack) = scope.loops.get_mut(name) {
            stack.pop();
        }
        match previous {
            Some(value) => {
                scope.locals.insert(name.to_string(), value);
            }
            None => {
                scope.locals.remove(name);
            }
        }
        result
    }

    fn resolve(&self, path: &str, frame: &Frame, span: Span) -> Result<String, TemplateError> {
        resolve_path(frame.name(), path)
            .map_err(|error| self.context.fail(ErrorCode::E_LOAD_OUTSIDE_ROOT, Some(frame), Some(span), error.0))
    }

    fn render_include(&mut self, path: &str, span: Span, frame: &Frame, scope: &mut Scope) -> Result<(), TemplateError> {
        let name = self.resolve(path, frame, span)?;
        let template = self.context.engine.load_template(&name, Some(frame), Some(span))?;
        self.context.enter(&name, Some(frame), Some(span))?;
        let included = Frame {
            template: Rc::clone(&template),
            context: Rc::clone(&frame.context),
        };
        let result = self.render_nodes(&template.ast.body, &included, scope);
        self.context.leave();
        result
    }

    fn render_block(
        &mut self,
        id: Option<&str>,
        path: Option<&str>,
        items: &[ScopeItem],
        span: Span,
        frame: &Frame,
        scope: &mut Scope,
    ) -> Result<(), TemplateError> {
        let entry: DefineEntry = match (id, path) {
            (Some(id), None) => match self.context.registry.get(id) {
                Some(entry) => entry.clone(),
                None => {
                    return Err(self.context.fail(
                        ErrorCode::E_RUNTIME_BLOCK_UNDEFINED,
                        Some(frame),
                        Some(span),
                        format!("define {id} is not registered"),
                    ));
                }
            },
            (id, Some(path)) => {
                let name = self.resolve(path, frame, span)?;
                match id {
                    Some(id) => match self.context.registry.get(id) {
                        Some(registered) => {
                            let same = matches!(registered, DefineEntry::Template { template, .. } if *template == name);
                            if !same {
                                return Err(self.context.fail(
                                    ErrorCode::E_RUNTIME_BLOCK_REDEFINED,
                                    Some(frame),
                                    Some(span),
                                    format!("define {id} is registered with a different template"),
                                ));
                            }
                            registered.clone()
                        }
                        None => {
                            let entry = DefineEntry::Template {
                                template: name,
                                data: None,
                            };
                            self.context.registry.insert(id.to_string(), entry.clone());
                            entry
                        }
                    },
                    None => DefineEntry::Template {
                        template: name,
                        data: None,
                    },
                }
            }
            (None, None) => {
                return Err(self.context.fail(
                    ErrorCode::E_RUNTIME_BLOCK_UNDEFINED,
                    Some(frame),
                    Some(span),
                    "block tag without id or path",
                ));
            }
        };
        let (template_name, entry_data) = match entry {
            DefineEntry::Html(html) => return self.context.write(&html, frame, span),
            DefineEntry::Template { template, data } => (template, data),
        };
        let mut data: OrderedMap = (*self.context.root).clone();
        if let Some(entry_data) = entry_data {
            for (key, value) in entry_data.iter() {
                data.insert(key.clone(), value.clone());
            }
        }
        for item in items {
            let value = self.evaluate(&item.expr, frame, scope)?;
            data.insert(item.name.clone(), value);
        }
        let template = self.context.engine.load_template(&template_name, Some(frame), Some(span))?;
        self.context.enter(&template_name, Some(frame), Some(span))?;
        let block_frame = Frame {
            template: Rc::clone(&template),
            context: Rc::new(data),
        };
        let mut block_scope = Scope::default();
        let result = self.render_nodes(&template.ast.body, &block_frame, &mut block_scope);
        self.context.leave();
        result
    }
}
