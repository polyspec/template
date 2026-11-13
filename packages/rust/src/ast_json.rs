//! The canonical JSON form of the AST (AST-7) and its decode with the rules of `contracts/schema/ast.schema.json`
//! (AST-10). The JSON text is read and written with polyspec-json, the one JSON reader and writer; the decoder states the
//! rules of the schema in code and names the JSON Pointer of the first node, in document order, that breaks one.

use crate::ast::{BinaryOp, Comment, Expr, IfBranch, LiteralValue, LoopMetaField, MapEntry, Node, ScopeItem, Template, UnaryOp};
use crate::error::{ErrorCode, Span, TemplateError};
use polyspec_json::{Kind, OrderedMap, ParseOptions, Value as Json, number_text, parse};

// ---- encode (AST-7) ----

/// The canonical JSON text of an AST (AST-7): compact, the `type` field first and the fields in the order of the schema.
/// A number literal that is not finite has no JSON text; no parsed or decoded template holds one, so it is `internal`.
pub fn encode_template(template: &Template) -> Result<String, TemplateError> {
    let mut out = String::new();
    write_template(&mut out, template)?;
    Ok(out)
}

/// The canonical JSON text of an expression, as `encode_template` writes it inside a template.
#[cfg(feature = "__test_support")]
pub fn encode_expr(expr: &Expr) -> Result<String, TemplateError> {
    let mut out = String::new();
    write_expr(&mut out, expr)?;
    Ok(out)
}

fn text(out: &mut String, value: &str) {
    out.push_str(Json::string(value).raw());
}

fn key(out: &mut String, first: &mut bool, name: &str) {
    if !*first {
        out.push(',');
    }
    *first = false;
    text(out, name);
    out.push(':');
}

fn span(out: &mut String, first: &mut bool, value: Span) {
    key(out, first, "span");
    out.push_str(&format!("[{},{}]", value[0], value[1]));
}

fn list<T>(out: &mut String, items: &[T], write: impl Fn(&mut String, &T) -> Result<(), TemplateError>) -> Result<(), TemplateError> {
    out.push('[');
    for (index, item) in items.iter().enumerate() {
        if index > 0 {
            out.push(',');
        }
        write(out, item)?;
    }
    out.push(']');
    Ok(())
}

fn nodes(out: &mut String, items: &[Node]) -> Result<(), TemplateError> {
    list(out, items, write_node)
}

fn optional_nodes(out: &mut String, items: Option<&Vec<Node>>) -> Result<(), TemplateError> {
    match items {
        Some(items) => nodes(out, items),
        None => {
            out.push_str("null");
            Ok(())
        }
    }
}

fn optional_text(out: &mut String, value: Option<&String>) {
    match value {
        Some(value) => text(out, value),
        None => out.push_str("null"),
    }
}

fn write_template(out: &mut String, template: &Template) -> Result<(), TemplateError> {
    let mut first = true;
    out.push('{');
    key(out, &mut first, "type");
    text(out, "Template");
    key(out, &mut first, "name");
    text(out, &template.name);
    key(out, &mut first, "body");
    nodes(out, &template.body)?;
    key(out, &mut first, "comments");
    list(out, &template.comments, |out, comment| {
        let mut first = true;
        out.push('{');
        key(out, &mut first, "type");
        text(out, "Comment");
        key(out, &mut first, "value");
        text(out, &comment.value);
        span(out, &mut first, comment.span);
        out.push('}');
        Ok(())
    })?;
    out.push('}');
    Ok(())
}

fn write_node(out: &mut String, node: &Node) -> Result<(), TemplateError> {
    let mut first = true;
    out.push('{');
    key(out, &mut first, "type");
    match node {
        Node::Text { value, span: at } => {
            text(out, "Text");
            key(out, &mut first, "value");
            text(out, value);
            span(out, &mut first, *at);
        }
        Node::Echo { expr, span: at } => {
            text(out, "Echo");
            key(out, &mut first, "expr");
            write_expr(out, expr)?;
            span(out, &mut first, *at);
        }
        Node::If {
            branches,
            r#else,
            span: at,
        } => {
            text(out, "If");
            key(out, &mut first, "branches");
            list(out, branches, |out, branch: &IfBranch| {
                let mut first = true;
                out.push('{');
                key(out, &mut first, "test");
                write_expr(out, &branch.test)?;
                key(out, &mut first, "body");
                nodes(out, &branch.body)?;
                span(out, &mut first, branch.span);
                out.push('}');
                Ok(())
            })?;
            key(out, &mut first, "else");
            optional_nodes(out, r#else.as_ref())?;
            span(out, &mut first, *at);
        }
        Node::For {
            name,
            iter,
            body,
            empty,
            span: at,
        } => {
            text(out, "For");
            key(out, &mut first, "name");
            text(out, name);
            key(out, &mut first, "iter");
            write_expr(out, iter)?;
            key(out, &mut first, "body");
            nodes(out, body)?;
            key(out, &mut first, "empty");
            optional_nodes(out, empty.as_ref())?;
            span(out, &mut first, *at);
        }
        Node::Set { name, expr, span: at } => {
            text(out, "Set");
            key(out, &mut first, "name");
            text(out, name);
            key(out, &mut first, "expr");
            write_expr(out, expr)?;
            span(out, &mut first, *at);
        }
        Node::Include { path, span: at } => {
            text(out, "Include");
            key(out, &mut first, "path");
            text(out, path);
            span(out, &mut first, *at);
        }
        Node::Block { id, path, scope, span: at } => {
            text(out, "Block");
            key(out, &mut first, "id");
            optional_text(out, id.as_ref());
            key(out, &mut first, "path");
            optional_text(out, path.as_ref());
            key(out, &mut first, "scope");
            list(out, scope, |out, item: &ScopeItem| {
                let mut first = true;
                out.push('{');
                key(out, &mut first, "name");
                text(out, &item.name);
                key(out, &mut first, "expr");
                write_expr(out, &item.expr)?;
                out.push('}');
                Ok(())
            })?;
            span(out, &mut first, *at);
        }
        Node::IfBlock {
            id,
            body,
            r#else,
            span: at,
        } => {
            text(out, "IfBlock");
            key(out, &mut first, "id");
            text(out, id);
            key(out, &mut first, "body");
            nodes(out, body)?;
            key(out, &mut first, "else");
            optional_nodes(out, r#else.as_ref())?;
            span(out, &mut first, *at);
        }
    }
    out.push('}');
    Ok(())
}

fn exprs(out: &mut String, items: &[Expr]) -> Result<(), TemplateError> {
    list(out, items, write_expr)
}

fn write_expr(out: &mut String, expr: &Expr) -> Result<(), TemplateError> {
    let mut first = true;
    out.push('{');
    key(out, &mut first, "type");
    match expr {
        Expr::Literal { kind, value, span: at } => {
            text(out, "Literal");
            key(out, &mut first, "kind");
            text(out, kind);
            key(out, &mut first, "value");
            match value {
                LiteralValue::Null => out.push_str("null"),
                LiteralValue::Bool { value } => out.push_str(if *value { "true" } else { "false" }),
                // AST-7: the number token of the value, as VAL-9 writes it.
                LiteralValue::Number { value } => out.push_str(
                    &number_text(*value)
                        .map_err(|error| TemplateError::without_position(ErrorCode::Internal, "", format!("internal failure: {error}")))?,
                ),
                LiteralValue::String { value } => text(out, value),
            }
            span(out, &mut first, *at);
        }
        Expr::Var { name, span: at } => {
            text(out, "Var");
            key(out, &mut first, "name");
            text(out, name);
            span(out, &mut first, *at);
        }
        Expr::LoopMeta { r#loop, field, span: at } => {
            text(out, "LoopMeta");
            key(out, &mut first, "loop");
            text(out, r#loop);
            key(out, &mut first, "field");
            text(out, field.name());
            span(out, &mut first, *at);
        }
        Expr::Member {
            object,
            key: name,
            span: at,
        } => {
            text(out, "Member");
            key(out, &mut first, "object");
            write_expr(out, object)?;
            key(out, &mut first, "key");
            text(out, name);
            span(out, &mut first, *at);
        }
        Expr::MemberCall {
            object,
            method,
            args,
            span: at,
        } => {
            text(out, "MemberCall");
            key(out, &mut first, "object");
            write_expr(out, object)?;
            key(out, &mut first, "method");
            text(out, method);
            key(out, &mut first, "args");
            exprs(out, args)?;
            span(out, &mut first, *at);
        }
        Expr::ClassCall {
            class_name,
            method,
            args,
            span: at,
        } => {
            text(out, "ClassCall");
            key(out, &mut first, "className");
            text(out, class_name);
            key(out, &mut first, "method");
            text(out, method);
            key(out, &mut first, "args");
            exprs(out, args)?;
            span(out, &mut first, *at);
        }
        Expr::Index { object, index, span: at } => {
            text(out, "Index");
            key(out, &mut first, "object");
            write_expr(out, object)?;
            key(out, &mut first, "index");
            write_expr(out, index)?;
            span(out, &mut first, *at);
        }
        Expr::Call { name, args, span: at } => {
            text(out, "Call");
            key(out, &mut first, "name");
            text(out, name);
            key(out, &mut first, "args");
            exprs(out, args)?;
            span(out, &mut first, *at);
        }
        Expr::Unary { op, operand, span: at } => {
            text(out, "Unary");
            key(out, &mut first, "op");
            text(out, op.as_str());
            key(out, &mut first, "operand");
            write_expr(out, operand)?;
            span(out, &mut first, *at);
        }
        Expr::Binary { op, left, right, span: at } => {
            text(out, "Binary");
            key(out, &mut first, "op");
            text(out, op.as_str());
            key(out, &mut first, "left");
            write_expr(out, left)?;
            key(out, &mut first, "right");
            write_expr(out, right)?;
            span(out, &mut first, *at);
        }
        Expr::Ternary {
            test,
            then,
            r#else,
            span: at,
        } => {
            text(out, "Ternary");
            key(out, &mut first, "test");
            write_expr(out, test)?;
            key(out, &mut first, "then");
            match then {
                Some(then) => write_expr(out, then)?,
                None => out.push_str("null"),
            }
            key(out, &mut first, "else");
            write_expr(out, r#else)?;
            span(out, &mut first, *at);
        }
        Expr::List { items, span: at } => {
            text(out, "List");
            key(out, &mut first, "items");
            exprs(out, items)?;
            span(out, &mut first, *at);
        }
        Expr::Map { entries, span: at } => {
            text(out, "Map");
            key(out, &mut first, "entries");
            list(out, entries, |out, entry: &MapEntry| match entry {
                MapEntry::Entry { key: name, value } => {
                    let mut first = true;
                    out.push('{');
                    key(out, &mut first, "key");
                    write_expr(out, name)?;
                    key(out, &mut first, "value");
                    write_expr(out, value)?;
                    out.push('}');
                    Ok(())
                }
                MapEntry::Spread { expr } => write_expr(out, expr),
            })?;
            span(out, &mut first, *at);
        }
        Expr::Spread { expr, span: at } => {
            text(out, "Spread");
            key(out, &mut first, "expr");
            write_expr(out, expr)?;
            span(out, &mut first, *at);
        }
    }
    out.push('}');
    Ok(())
}

// ---- decode (AST-10) ----

/// The first node that breaks a rule of the schema: its JSON Pointer (RFC 6901) and the rule.
struct Invalid {
    path: String,
    reason: String,
}

type Decoded<T> = Result<T, Invalid>;

fn invalid<T>(path: &str, reason: impl Into<String>) -> Decoded<T> {
    Err(Invalid {
        path: path.to_string(),
        reason: reason.into(),
    })
}

fn child(path: &str, name: &str) -> String {
    format!("{path}/{}", name.replace('~', "~0").replace('/', "~1"))
}

fn at(path: &str, index: usize) -> String {
    format!("{path}/{index}")
}

/// The members of an object node with exactly the fields `fields` (the schema's `required` and
/// `additionalProperties: false`); a missing or an extra field is a rule of the node itself.
struct Fields<'v> {
    path: String,
    members: &'v OrderedMap,
}

impl<'v> Fields<'v> {
    fn get(&self, name: &str) -> Decoded<(&'v Json, String)> {
        match self.members.get(name) {
            Ok(Some(value)) => Ok((value, child(&self.path, name))),
            Ok(None) => invalid(&self.path, format!("the field {name} is missing")),
            Err(error) => invalid(&self.path, format!("internal failure: {error}")),
        }
    }
}

fn object<'v>(value: &'v Json, path: &str, fields: &[&str]) -> Decoded<Fields<'v>> {
    if value.kind() != Kind::Object {
        return invalid(path, "an object is expected");
    }
    let members = match value.members() {
        Ok(members) => members,
        Err(error) => return invalid(path, format!("internal failure: {error}")),
    };
    for name in fields {
        match members.get(name) {
            Ok(Some(_)) => {}
            Ok(None) => return invalid(path, format!("the field {name} is missing")),
            Err(error) => return invalid(path, format!("internal failure: {error}")),
        }
    }
    for (name, _) in members.iter() {
        let name = match name.string_value() {
            Ok(name) => name,
            Err(error) => return invalid(path, format!("a field name is no text: {error}")),
        };
        if !fields.contains(&name.as_str()) {
            return invalid(path, format!("the field {name} is not a field of this node"));
        }
    }
    Ok(Fields {
        path: path.to_string(),
        members,
    })
}

/// The `type` of a node whose schema is chosen by it: a missing `type` is a rule of the node, a value that names no
/// schema of `allowed` a rule of the field.
fn node_type(value: &Json, path: &str, allowed: &[&str]) -> Decoded<String> {
    if value.kind() != Kind::Object {
        return invalid(path, "an object is expected");
    }
    let found = match value.get("type") {
        Ok(Some(found)) => found,
        Ok(None) => return invalid(path, "the field type is missing"),
        Err(error) => return invalid(path, format!("internal failure: {error}")),
    };
    let name = string(found, &child(path, "type"))?;
    if !allowed.contains(&name.as_str()) {
        return invalid(&child(path, "type"), format!("{name:?} is not one of {allowed:?}"));
    }
    Ok(name)
}

fn string(value: &Json, path: &str) -> Decoded<String> {
    if value.kind() != Kind::String {
        return invalid(path, "a string is expected");
    }
    match value.string_value() {
        Ok(text) => Ok(text),
        Err(error) => invalid(path, format!("the string is no Unicode text: {error}")),
    }
}

fn field_string(fields: &Fields<'_>, name: &str) -> Decoded<String> {
    let (value, path) = fields.get(name)?;
    string(value, &path)
}

/// AST-10: an identifier matches `^[A-Za-z_][A-Za-z0-9_]*$`.
fn identifier(value: &Json, path: &str) -> Decoded<String> {
    let name = string(value, path)?;
    if !is_identifier(&name) {
        return invalid(path, format!("{name:?} is not an identifier"));
    }
    Ok(name)
}

fn field_identifier(fields: &Fields<'_>, name: &str) -> Decoded<String> {
    let (value, path) = fields.get(name)?;
    identifier(value, &path)
}

fn array<'v>(value: &'v Json, path: &str) -> Decoded<&'v [Json]> {
    if value.kind() != Kind::Array {
        return invalid(path, "an array is expected");
    }
    match value.items() {
        Ok(items) => Ok(items),
        Err(error) => invalid(path, format!("internal failure: {error}")),
    }
}

/// A span: two offsets, each an integer of at least 0 that a usize holds.
fn field_span(fields: &Fields<'_>) -> Decoded<Span> {
    let (value, path) = fields.get("span")?;
    let items = array(value, &path)?;
    if items.len() != 2 {
        return invalid(&path, "a span has two offsets");
    }
    let offset = |index: usize| -> Decoded<usize> {
        let item_path = at(&path, index);
        let item = &items[index];
        if item.kind() != Kind::Number {
            return invalid(&item_path, "an offset is an integer");
        }
        let literal = match item.number_literal() {
            Ok(literal) => literal,
            Err(error) => return invalid(&item_path, format!("internal failure: {error}")),
        };
        match literal.parse::<usize>() {
            Ok(offset) => Ok(offset),
            Err(error) => invalid(&item_path, format!("{literal} is not an offset of at least 0: {error}")),
        }
    };
    Ok([offset(0)?, offset(1)?])
}

fn node_list(value: &Json, path: &str) -> Decoded<Vec<Node>> {
    array(value, path)?
        .iter()
        .enumerate()
        .map(|(index, item)| decode_node(item, &at(path, index)))
        .collect()
}

fn field_nodes(fields: &Fields<'_>, name: &str) -> Decoded<Vec<Node>> {
    let (value, path) = fields.get(name)?;
    node_list(value, &path)
}

fn field_optional_nodes(fields: &Fields<'_>, name: &str) -> Decoded<Option<Vec<Node>>> {
    let (value, path) = fields.get(name)?;
    if value.kind() == Kind::Null {
        return Ok(None);
    }
    node_list(value, &path).map(Some)
}

fn field_expr(fields: &Fields<'_>, name: &str) -> Decoded<Expr> {
    let (value, path) = fields.get(name)?;
    decode_expr(value, &path)
}

fn field_exprs(fields: &Fields<'_>, name: &str) -> Decoded<Vec<Expr>> {
    let (value, path) = fields.get(name)?;
    array(value, &path)?
        .iter()
        .enumerate()
        .map(|(index, item)| decode_expr(item, &at(&path, index)))
        .collect()
}

fn decode_root(value: &Json) -> Decoded<Template> {
    let fields = object(value, "", &["type", "name", "body", "comments"])?;
    let (kind, kind_path) = fields.get("type")?;
    if string(kind, &kind_path)? != "Template" {
        return invalid(&kind_path, "the root is a Template");
    }
    let name = field_string(&fields, "name")?;
    let body = field_nodes(&fields, "body")?;
    let (comments, path) = fields.get("comments")?;
    let comments = array(comments, &path)?
        .iter()
        .enumerate()
        .map(|(index, item)| {
            let item_path = at(&path, index);
            let fields = object(item, &item_path, &["type", "value", "span"])?;
            let (kind, kind_path) = fields.get("type")?;
            if string(kind, &kind_path)? != "Comment" {
                return invalid(&kind_path, "a comment is a Comment");
            }
            Ok(Comment {
                value: field_string(&fields, "value")?,
                span: field_span(&fields)?,
            })
        })
        .collect::<Decoded<Vec<_>>>()?;
    Ok(Template { name, body, comments })
}

const NODE_TYPES: [&str; 8] = ["Text", "Echo", "If", "For", "Set", "Include", "Block", "IfBlock"];

fn decode_node(value: &Json, path: &str) -> Decoded<Node> {
    let kind = node_type(value, path, &NODE_TYPES)?;
    Ok(match kind.as_str() {
        "Text" => {
            let fields = object(value, path, &["type", "value", "span"])?;
            Node::Text {
                value: field_string(&fields, "value")?,
                span: field_span(&fields)?,
            }
        }
        "Echo" => {
            let fields = object(value, path, &["type", "expr", "span"])?;
            Node::Echo {
                expr: field_expr(&fields, "expr")?,
                span: field_span(&fields)?,
            }
        }
        "If" => {
            let fields = object(value, path, &["type", "branches", "else", "span"])?;
            let (branches, branches_path) = fields.get("branches")?;
            let items = array(branches, &branches_path)?;
            if items.is_empty() {
                return invalid(&branches_path, "an if has at least one branch");
            }
            let branches = items
                .iter()
                .enumerate()
                .map(|(index, item)| {
                    let fields = object(item, &at(&branches_path, index), &["test", "body", "span"])?;
                    Ok(IfBranch {
                        test: field_expr(&fields, "test")?,
                        body: field_nodes(&fields, "body")?,
                        span: field_span(&fields)?,
                    })
                })
                .collect::<Decoded<Vec<_>>>()?;
            Node::If {
                branches,
                r#else: field_optional_nodes(&fields, "else")?,
                span: field_span(&fields)?,
            }
        }
        "For" => {
            let fields = object(value, path, &["type", "name", "iter", "body", "empty", "span"])?;
            Node::For {
                name: field_identifier(&fields, "name")?,
                iter: field_expr(&fields, "iter")?,
                body: field_nodes(&fields, "body")?,
                empty: field_optional_nodes(&fields, "empty")?,
                span: field_span(&fields)?,
            }
        }
        "Set" => {
            let fields = object(value, path, &["type", "name", "expr", "span"])?;
            Node::Set {
                name: field_identifier(&fields, "name")?,
                expr: field_expr(&fields, "expr")?,
                span: field_span(&fields)?,
            }
        }
        "Include" => {
            let fields = object(value, path, &["type", "path", "span"])?;
            let (found, found_path) = fields.get("path")?;
            let include = string(found, &found_path)?;
            if include.is_empty() {
                return invalid(&found_path, "a path is not empty");
            }
            Node::Include {
                path: include,
                span: field_span(&fields)?,
            }
        }
        "Block" => {
            let fields = object(value, path, &["type", "id", "path", "scope", "span"])?;
            let (id, id_path) = fields.get("id")?;
            let id = if id.kind() == Kind::Null {
                None
            } else {
                Some(identifier(id, &id_path)?)
            };
            let (found, found_path) = fields.get("path")?;
            let block_path = if found.kind() == Kind::Null {
                None
            } else {
                let text = string(found, &found_path)?;
                if text.is_empty() {
                    return invalid(&found_path, "a path is not empty");
                }
                Some(text)
            };
            let (scope, scope_path) = fields.get("scope")?;
            let scope = array(scope, &scope_path)?
                .iter()
                .enumerate()
                .map(|(index, item)| {
                    let fields = object(item, &at(&scope_path, index), &["name", "expr"])?;
                    Ok(ScopeItem {
                        name: field_identifier(&fields, "name")?,
                        expr: field_expr(&fields, "expr")?,
                    })
                })
                .collect::<Decoded<Vec<_>>>()?;
            Node::Block {
                id,
                path: block_path,
                scope,
                span: field_span(&fields)?,
            }
        }
        _ => {
            let fields = object(value, path, &["type", "id", "body", "else", "span"])?;
            Node::IfBlock {
                id: field_identifier(&fields, "id")?,
                body: field_nodes(&fields, "body")?,
                r#else: field_optional_nodes(&fields, "else")?,
                span: field_span(&fields)?,
            }
        }
    })
}

const EXPR_TYPES: [&str; 13] = [
    "Literal",
    "Var",
    "LoopMeta",
    "Member",
    "MemberCall",
    "ClassCall",
    "Index",
    "Call",
    "Unary",
    "Binary",
    "Ternary",
    "List",
    "Map",
];

/// Whether a List item or a Map entry is a Spread: an object whose `type` is "Spread" (the `if` of the schema).
fn is_spread(value: &Json) -> bool {
    value.kind() == Kind::Object
        && matches!(value.get("type"), Ok(Some(found)) if found.kind() == Kind::String && matches!(found.string_value().as_deref(), Ok("Spread")))
}

fn decode_spread(value: &Json, path: &str) -> Decoded<Expr> {
    let fields = object(value, path, &["type", "expr", "span"])?;
    Ok(Expr::Spread {
        expr: Box::new(field_expr(&fields, "expr")?),
        span: field_span(&fields)?,
    })
}

fn decode_expr(value: &Json, path: &str) -> Decoded<Expr> {
    let kind = node_type(value, path, &EXPR_TYPES)?;
    let boxed = |fields: &Fields<'_>, name: &str| field_expr(fields, name).map(Box::new);
    Ok(match kind.as_str() {
        "Literal" => {
            let fields = object(value, path, &["type", "kind", "value", "span"])?;
            let (kind, kind_path) = fields.get("kind")?;
            let kind = string(kind, &kind_path)?;
            let (found, value_path) = fields.get("value")?;
            let literal = match (kind.as_str(), found.kind()) {
                ("null", Kind::Null) => LiteralValue::Null,
                ("bool", Kind::Boolean) => match found.boolean_value() {
                    Ok(value) => LiteralValue::Bool { value },
                    Err(error) => return invalid(&value_path, format!("internal failure: {error}")),
                },
                ("number", Kind::Number) => {
                    let literal = match found.number_literal() {
                        Ok(literal) => literal,
                        Err(error) => return invalid(&value_path, format!("internal failure: {error}")),
                    };
                    match literal.parse::<f64>() {
                        Ok(number) if number.is_finite() => LiteralValue::Number { value: number },
                        _ => return invalid(&value_path, format!("{literal} has no finite 64-bit float")),
                    }
                }
                ("string", Kind::String) => LiteralValue::String {
                    value: string(found, &value_path)?,
                },
                ("null" | "bool" | "number" | "string", _) => {
                    return invalid(&value_path, format!("the value is not of the kind {kind}"));
                }
                _ => return invalid(&kind_path, format!("{kind:?} is not a literal kind")),
            };
            Expr::Literal {
                kind,
                value: literal,
                span: field_span(&fields)?,
            }
        }
        "Var" => {
            let fields = object(value, path, &["type", "name", "span"])?;
            Expr::Var {
                name: field_identifier(&fields, "name")?,
                span: field_span(&fields)?,
            }
        }
        "LoopMeta" => {
            let fields = object(value, path, &["type", "loop", "field", "span"])?;
            let r#loop = field_identifier(&fields, "loop")?;
            let (found, field_path) = fields.get("field")?;
            let name = string(found, &field_path)?;
            let Some(field) = LoopMetaField::from_name(&name) else {
                return invalid(&field_path, format!("{name:?} is not a loop meta field"));
            };
            Expr::LoopMeta {
                r#loop,
                field,
                span: field_span(&fields)?,
            }
        }
        "Member" => {
            let fields = object(value, path, &["type", "object", "key", "span"])?;
            Expr::Member {
                object: boxed(&fields, "object")?,
                key: field_string(&fields, "key")?,
                span: field_span(&fields)?,
            }
        }
        "MemberCall" => {
            let fields = object(value, path, &["type", "object", "method", "args", "span"])?;
            Expr::MemberCall {
                object: boxed(&fields, "object")?,
                method: field_identifier(&fields, "method")?,
                args: field_exprs(&fields, "args")?,
                span: field_span(&fields)?,
            }
        }
        "ClassCall" => {
            let fields = object(value, path, &["type", "className", "method", "args", "span"])?;
            Expr::ClassCall {
                class_name: field_identifier(&fields, "className")?,
                method: field_identifier(&fields, "method")?,
                args: field_exprs(&fields, "args")?,
                span: field_span(&fields)?,
            }
        }
        "Index" => {
            let fields = object(value, path, &["type", "object", "index", "span"])?;
            Expr::Index {
                object: boxed(&fields, "object")?,
                index: boxed(&fields, "index")?,
                span: field_span(&fields)?,
            }
        }
        "Call" => {
            let fields = object(value, path, &["type", "name", "args", "span"])?;
            Expr::Call {
                name: field_identifier(&fields, "name")?,
                args: field_exprs(&fields, "args")?,
                span: field_span(&fields)?,
            }
        }
        "Unary" => {
            let fields = object(value, path, &["type", "op", "operand", "span"])?;
            let (found, op_path) = fields.get("op")?;
            let op = match string(found, &op_path)?.as_str() {
                "!" => UnaryOp::Not,
                "-" => UnaryOp::Negate,
                other => return invalid(&op_path, format!("{other:?} is not a unary operator")),
            };
            Expr::Unary {
                op,
                operand: boxed(&fields, "operand")?,
                span: field_span(&fields)?,
            }
        }
        "Binary" => {
            let fields = object(value, path, &["type", "op", "left", "right", "span"])?;
            let (found, op_path) = fields.get("op")?;
            let text = string(found, &op_path)?;
            let Some(op) = BinaryOp::from_text(&text) else {
                return invalid(&op_path, format!("{text:?} is not a binary operator"));
            };
            Expr::Binary {
                op,
                left: boxed(&fields, "left")?,
                right: boxed(&fields, "right")?,
                span: field_span(&fields)?,
            }
        }
        "Ternary" => {
            let fields = object(value, path, &["type", "test", "then", "else", "span"])?;
            let test = boxed(&fields, "test")?;
            let (then, then_path) = fields.get("then")?;
            let then = if then.kind() == Kind::Null {
                None
            } else {
                Some(Box::new(decode_expr(then, &then_path)?))
            };
            Expr::Ternary {
                test,
                then,
                r#else: boxed(&fields, "else")?,
                span: field_span(&fields)?,
            }
        }
        "List" => {
            let fields = object(value, path, &["type", "items", "span"])?;
            let (items, items_path) = fields.get("items")?;
            let items = array(items, &items_path)?
                .iter()
                .enumerate()
                .map(|(index, item)| {
                    let item_path = at(&items_path, index);
                    if is_spread(item) {
                        decode_spread(item, &item_path)
                    } else {
                        decode_expr(item, &item_path)
                    }
                })
                .collect::<Decoded<Vec<_>>>()?;
            Expr::List {
                items,
                span: field_span(&fields)?,
            }
        }
        _ => {
            let fields = object(value, path, &["type", "entries", "span"])?;
            let (entries, entries_path) = fields.get("entries")?;
            let entries = array(entries, &entries_path)?
                .iter()
                .enumerate()
                .map(|(index, item)| {
                    let item_path = at(&entries_path, index);
                    if is_spread(item) {
                        return decode_spread(item, &item_path).map(|expr| MapEntry::Spread { expr });
                    }
                    let fields = object(item, &item_path, &["key", "value"])?;
                    Ok(MapEntry::Entry {
                        key: field_expr(&fields, "key")?,
                        value: field_expr(&fields, "value")?,
                    })
                })
                .collect::<Decoded<Vec<_>>>()?;
            Expr::Map {
                entries,
                span: field_span(&fields)?,
            }
        }
    })
}

// ---- the rules of the schema (AST-10) ----

/// The violations of the rules of `contracts/schema/ast.schema.json` in a JSON value, each at the JSON Pointer of the
/// instance that breaks it, as a JSON Schema validator reports them: the schema selects the schema of a node by its
/// `type` with `if`/`then`, so a violation names a value of the node itself.
#[derive(Default)]
struct Violations(Vec<Invalid>);

impl Violations {
    fn add(&mut self, path: &str, reason: impl Into<String>) {
        self.0.push(Invalid {
            path: path.to_string(),
            reason: reason.into(),
        });
    }

    /// AST-10: of the instance locations, the deepest, and of several at that depth the least in code point order.
    fn first(self) -> Option<Invalid> {
        let depth = |invalid: &Invalid| invalid.path.matches('/').count();
        let deepest = self.0.iter().map(depth).max()?;
        self.0
            .into_iter()
            .filter(|invalid| depth(invalid) == deepest)
            .min_by(|a, b| a.path.cmp(&b.path))
    }

    /// `type: object`, `required` and `additionalProperties: false`; the members, or None for a value that is not an
    /// object, whose other keywords do not apply.
    fn object<'v>(&mut self, value: &'v Json, path: &str, fields: &[&str]) -> Option<&'v OrderedMap> {
        if value.kind() != Kind::Object {
            self.add(path, "an object is expected");
            return None;
        }
        let Ok(members) = value.members() else {
            self.add(path, "an object is expected");
            return None;
        };
        for name in fields {
            if !matches!(members.get(name), Ok(Some(_))) {
                self.add(path, format!("the field {name} is missing"));
            }
        }
        for (name, _) in members.iter() {
            match name.string_value() {
                Ok(name) if fields.contains(&name.as_str()) => {}
                Ok(name) => self.add(path, format!("the field {name} is not a field of this node")),
                Err(error) => self.add(path, format!("a field name is no text: {error}")),
            }
        }
        Some(members)
    }

    /// Calls `check` with the value and the pointer of a field that is present.
    fn field(&mut self, members: &OrderedMap, path: &str, name: &str, check: impl FnOnce(&mut Self, &Json, &str)) {
        if let Ok(Some(value)) = members.get(name) {
            check(self, value, &child(path, name));
        }
    }

    fn constant(&mut self, members: &OrderedMap, path: &str, name: &str, expected: &str) {
        self.field(members, path, name, |this, value, path| {
            if text_of(value).as_deref() != Some(expected) {
                this.add(path, format!("the value is not {expected:?}"));
            }
        });
    }

    fn one_of(&mut self, value: &Json, path: &str, allowed: &[&str]) {
        match text_of(value) {
            Some(name) if allowed.contains(&name.as_str()) => {}
            _ => self.add(path, format!("the value is not one of {allowed:?}")),
        }
    }

    fn string(&mut self, value: &Json, path: &str, min_length: usize) {
        match text_of(value) {
            Some(text) if text.chars().count() >= min_length => {}
            Some(_) => self.add(path, format!("a string of at least {min_length} characters is expected")),
            None => self.add(path, "a string is expected"),
        }
    }

    fn identifier(&mut self, value: &Json, path: &str) {
        match text_of(value) {
            Some(name) if is_identifier(&name) => {}
            Some(name) => self.add(path, format!("{name:?} does not match ^[A-Za-z_][A-Za-z0-9_]*$")),
            None => self.add(path, "a string is expected"),
        }
    }

    fn span(&mut self, value: &Json, path: &str) {
        let Some(items) = items_of(value) else {
            self.add(path, "an array is expected");
            return;
        };
        if items.len() != 2 {
            self.add(path, "a span has two offsets");
        }
        for (index, item) in items.iter().enumerate() {
            let literal = match (item.kind(), item.number_literal()) {
                (Kind::Number, Ok(literal)) => Some(literal),
                // Not a number: no number literal.
                (_, Ok(_) | Err(_)) => None,
            };
            match literal.map(|literal| (literal.starts_with('-'), literal.parse::<f64>())) {
                Some((_, Ok(number))) if number.fract() != 0.0 => self.add(&at(path, index), "an integer is expected"),
                Some((true, Ok(number))) if number < 0.0 => self.add(&at(path, index), "an offset is at least 0"),
                Some((_, Ok(_))) => {}
                _ => self.add(&at(path, index), "an integer is expected"),
            }
        }
    }

    fn array(&mut self, value: &Json, path: &str, min_items: usize, item: impl Fn(&mut Self, &Json, &str)) {
        let Some(items) = items_of(value) else {
            self.add(path, "an array is expected");
            return;
        };
        if items.len() < min_items {
            self.add(path, format!("an array of at least {min_items} items is expected"));
        }
        for (index, value) in items.iter().enumerate() {
            item(self, value, &at(path, index));
        }
    }

    fn nodes(&mut self, value: &Json, path: &str) {
        self.array(value, path, 0, Self::node);
    }

    fn optional_nodes(&mut self, value: &Json, path: &str) {
        if value.kind() != Kind::Null {
            self.nodes(value, path);
        }
    }

    fn exprs(&mut self, value: &Json, path: &str) {
        self.array(value, path, 0, Self::expr);
    }

    fn template(&mut self, value: &Json) {
        let Some(members) = self.object(value, "", &["type", "name", "body", "comments"]) else {
            return;
        };
        self.constant(members, "", "type", "Template");
        self.field(members, "", "name", |this, value, path| this.string(value, path, 0));
        self.field(members, "", "body", Self::nodes);
        self.field(members, "", "comments", |this, value, path| {
            this.array(value, path, 0, |this, value, path| {
                if let Some(members) = this.object(value, path, &["type", "value", "span"]) {
                    this.constant(members, path, "type", "Comment");
                    this.field(members, path, "value", |this, value, path| this.string(value, path, 0));
                    this.field(members, path, "span", Self::span);
                }
            });
        });
    }

    /// The `type` of a node that the schema chooses by it: an object whose `type` is one of `allowed`.
    fn typed(&mut self, value: &Json, path: &str, allowed: &[&str]) -> Option<String> {
        if value.kind() != Kind::Object {
            self.add(path, "an object is expected");
            return None;
        }
        let Ok(Some(found)) = value.get("type") else {
            self.add(path, "the field type is missing");
            return None;
        };
        self.one_of(found, &child(path, "type"), allowed);
        let name = text_of(found)?;
        allowed.contains(&name.as_str()).then_some(name)
    }

    fn node(&mut self, value: &Json, path: &str) {
        let Some(kind) = self.typed(value, path, &NODE_TYPES) else {
            return;
        };
        let fields: &[&str] = match kind.as_str() {
            "Text" => &["type", "value", "span"],
            "Echo" => &["type", "expr", "span"],
            "If" => &["type", "branches", "else", "span"],
            "For" => &["type", "name", "iter", "body", "empty", "span"],
            "Set" => &["type", "name", "expr", "span"],
            "Include" => &["type", "path", "span"],
            "Block" => &["type", "id", "path", "scope", "span"],
            _ => &["type", "id", "body", "else", "span"],
        };
        let Some(members) = self.object(value, path, fields) else {
            return;
        };
        self.field(members, path, "span", Self::span);
        match kind.as_str() {
            "Text" => self.field(members, path, "value", |this, value, path| this.string(value, path, 0)),
            "Echo" => self.field(members, path, "expr", Self::expr),
            "If" => {
                self.field(members, path, "branches", |this, value, path| {
                    this.array(value, path, 1, |this, value, path| {
                        if let Some(members) = this.object(value, path, &["test", "body", "span"]) {
                            this.field(members, path, "test", Self::expr);
                            this.field(members, path, "body", Self::nodes);
                            this.field(members, path, "span", Self::span);
                        }
                    });
                });
                self.field(members, path, "else", Self::optional_nodes);
            }
            "For" => {
                self.field(members, path, "name", Self::identifier);
                self.field(members, path, "iter", Self::expr);
                self.field(members, path, "body", Self::nodes);
                self.field(members, path, "empty", Self::optional_nodes);
            }
            "Set" => {
                self.field(members, path, "name", Self::identifier);
                self.field(members, path, "expr", Self::expr);
            }
            "Include" => self.field(members, path, "path", |this, value, path| this.string(value, path, 1)),
            "Block" => {
                self.field(members, path, "id", |this, value, path| {
                    if value.kind() != Kind::Null {
                        this.identifier(value, path);
                    }
                });
                self.field(members, path, "path", |this, value, path| {
                    if value.kind() != Kind::Null {
                        this.string(value, path, 1);
                    }
                });
                self.field(members, path, "scope", |this, value, path| {
                    this.array(value, path, 0, |this, value, path| {
                        if let Some(members) = this.object(value, path, &["name", "expr"]) {
                            this.field(members, path, "name", Self::identifier);
                            this.field(members, path, "expr", Self::expr);
                        }
                    });
                });
            }
            _ => {
                self.field(members, path, "id", Self::identifier);
                self.field(members, path, "body", Self::nodes);
                self.field(members, path, "else", Self::optional_nodes);
            }
        }
    }

    /// A List item or a Map entry: a Spread if it is an object of the type Spread, otherwise `otherwise`.
    fn spread_or(&mut self, value: &Json, path: &str, otherwise: impl FnOnce(&mut Self, &Json, &str)) {
        if !is_spread(value) {
            otherwise(self, value, path);
            return;
        }
        if let Some(members) = self.object(value, path, &["type", "expr", "span"]) {
            self.field(members, path, "expr", Self::expr);
            self.field(members, path, "span", Self::span);
        }
    }

    fn expr(&mut self, value: &Json, path: &str) {
        let Some(kind) = self.typed(value, path, &EXPR_TYPES) else {
            return;
        };
        let fields: &[&str] = match kind.as_str() {
            "Literal" => &["type", "kind", "value", "span"],
            "Var" => &["type", "name", "span"],
            "LoopMeta" => &["type", "loop", "field", "span"],
            "Member" => &["type", "object", "key", "span"],
            "MemberCall" => &["type", "object", "method", "args", "span"],
            "ClassCall" => &["type", "className", "method", "args", "span"],
            "Index" => &["type", "object", "index", "span"],
            "Call" => &["type", "name", "args", "span"],
            "Unary" => &["type", "op", "operand", "span"],
            "Binary" => &["type", "op", "left", "right", "span"],
            "Ternary" => &["type", "test", "then", "else", "span"],
            "List" => &["type", "items", "span"],
            _ => &["type", "entries", "span"],
        };
        let Some(members) = self.object(value, path, fields) else {
            return;
        };
        self.field(members, path, "span", Self::span);
        match kind.as_str() {
            "Literal" => {
                let mut literal_kind = None;
                self.field(members, path, "kind", |this, value, path| {
                    this.one_of(value, path, &["null", "bool", "number", "string"]);
                    literal_kind = text_of(value);
                });
                let expected = match literal_kind.as_deref() {
                    Some("null") => Some((Kind::Null, "null")),
                    Some("bool") => Some((Kind::Boolean, "bool")),
                    Some("number") => Some((Kind::Number, "number")),
                    Some("string") => Some((Kind::String, "string")),
                    _ => None,
                };
                if let Some((expected, name)) = expected {
                    self.field(members, path, "value", |this, value, path| {
                        if value.kind() != expected {
                            this.add(path, format!("the value is not of the kind {name}"));
                        }
                    });
                }
            }
            "Var" => self.field(members, path, "name", Self::identifier),
            "LoopMeta" => {
                self.field(members, path, "loop", Self::identifier);
                self.field(members, path, "field", |this, value, path| {
                    this.one_of(value, path, &["index_", "key_", "value_", "last_", "first_", "size_"]);
                });
            }
            "Member" => {
                self.field(members, path, "object", Self::expr);
                self.field(members, path, "key", |this, value, path| this.string(value, path, 0));
            }
            "MemberCall" => {
                self.field(members, path, "object", Self::expr);
                self.field(members, path, "method", Self::identifier);
                self.field(members, path, "args", Self::exprs);
            }
            "ClassCall" => {
                self.field(members, path, "className", Self::identifier);
                self.field(members, path, "method", Self::identifier);
                self.field(members, path, "args", Self::exprs);
            }
            "Index" => {
                self.field(members, path, "object", Self::expr);
                self.field(members, path, "index", Self::expr);
            }
            "Call" => {
                self.field(members, path, "name", Self::identifier);
                self.field(members, path, "args", Self::exprs);
            }
            "Unary" => {
                self.field(members, path, "op", |this, value, path| this.one_of(value, path, &["!", "-"]));
                self.field(members, path, "operand", Self::expr);
            }
            "Binary" => {
                self.field(members, path, "op", |this, value, path| this.one_of(value, path, &BINARY_OPS));
                self.field(members, path, "left", Self::expr);
                self.field(members, path, "right", Self::expr);
            }
            "Ternary" => {
                self.field(members, path, "test", Self::expr);
                self.field(members, path, "then", |this, value, path| {
                    if value.kind() != Kind::Null {
                        this.expr(value, path);
                    }
                });
                self.field(members, path, "else", Self::expr);
            }
            "List" => self.field(members, path, "items", |this, value, path| {
                this.array(value, path, 0, |this, value, path| this.spread_or(value, path, Self::expr));
            }),
            _ => self.field(members, path, "entries", |this, value, path| {
                this.array(value, path, 0, |this, value, path| {
                    this.spread_or(value, path, |this, value, path| {
                        if let Some(members) = this.object(value, path, &["key", "value"]) {
                            this.field(members, path, "key", Self::expr);
                            this.field(members, path, "value", Self::expr);
                        }
                    });
                });
            }),
        }
    }
}

const BINARY_OPS: [&str; 17] = [
    "+", "-", "*", "/", "%", "==", "!=", "===", "!==", "<", ">", "<=", ">=", "&&", "||", "??", "in",
];

fn text_of(value: &Json) -> Option<String> {
    if value.kind() != Kind::String {
        return None;
    }
    // AST-10: a string with an unpaired surrogate has no Rust text, so the AST types cannot hold it: it fails at the
    // node that holds it, as a value of another type does.
    #[expect(
        clippy::disallowed_methods,
        reason = "AST-10: the error of a string without Rust text is the violation of its node"
    )]
    let text = value.string_value().ok();
    text
}

fn items_of(value: &Json) -> Option<&[Json]> {
    match (value.kind(), value.items()) {
        (Kind::Array, Ok(items)) => Some(items),
        // Not an array: no items.
        (_, Ok(_) | Err(_)) => None,
    }
}

fn is_identifier(name: &str) -> bool {
    let mut bytes = name.bytes();
    matches!(bytes.next(), Some(b'A'..=b'Z' | b'a'..=b'z' | b'_')) && bytes.all(|b| b.is_ascii_alphanumeric() || b == b'_')
}

/// Decodes the canonical JSON text of a template AST (AST-7) into the [`Template`] that `parse` returns, so a program
/// renders it without parsing a source (RT-41). The value is checked against the rules of
/// `contracts/schema/ast.schema.json` (AST-10); text that is not JSON and a value that breaks a rule are `ast_invalid`
/// (ERR-15), whose message names the JSON Pointer of the first node, in document order, that breaks one.
pub fn decode_template(json: &str) -> Result<Template, TemplateError> {
    let value = parse(json.as_bytes(), &ParseOptions::default())
        .map_err(|error| TemplateError::without_position(ErrorCode::AstInvalid, "", format!("the template AST is not JSON: {error}")))?;
    let mut violations = Violations::default();
    violations.template(&value);
    let invalid = match violations.first() {
        Some(invalid) => Err(invalid),
        // A value of the schema that the AST types cannot hold, such as a span offset beyond usize, fails at the node
        // that holds it.
        None => decode_root(&value),
    };
    invalid.map_err(|Invalid { path, reason }| {
        let message = if path.is_empty() {
            format!("invalid template AST at the root: {reason}")
        } else {
            format!("invalid template AST at {path}: {reason}")
        };
        TemplateError::without_position(ErrorCode::AstInvalid, "", message)
    })
}
