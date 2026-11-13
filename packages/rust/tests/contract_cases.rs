#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    reason = "a test states its expectation with unwrap and expect; a failure there is the failure of the test"
)]
//! The contract cases of contracts/core-cases.json (binding design K-1, G-5), one trial per case, `<group>::<id>`, run
//! against the core. A case names its arguments by the parameter names of its member in packages/rust/interface.json; an
//! instance is `{"new", "receiver", "args", "then"}`, a callback `{"callback": {"<member>": [rows]}}`, a function
//! `{"function": [rows]}`, a variant `{"type": "<case value>", fields}` (CNF-19), and a result is compared in the form
//! of a case value. A case of the value alias
//! `template_value` is `{id, value, raises}`: its value enters through `value_in` as a binding describes it, and the kind
//! is one of the `in_raises` of the alias (binding design U-7). A form that this runner does not read fails its case; no
//! case is skipped.

mod common;

use binding_core::{Handle, HostText, HostValue, HostValues, Io, Raised};
use common::{json_equal, kind_category, repo_root};
use libtest_mimic::{Arguments, Failed, Trial};
use polyspec_template::{
    ArtifactRefresh, AstProgram, BinaryOp, BoundMap, Comment, ContractFunction, DefineData, DefineInput, EngineOptions, Env, Environment,
    Expr, FormatOptions, FsLoader, HostError, IfBranch, IndentUnit, Limits, LineIndex, LiteralValue, LoadError, Loaded, Loader,
    LoopMetaField, MapEntry, MapLoader, Node, OrderedMap, ParseOptions, RenderError, RenderOptions, RenderTarget, ScopeItem, Span,
    SyntaxTag, SyntaxToken, Template, TemplateBlocks, TemplateError, TemplateObject, UnaryOp, Value, analyze, analyze_prefix, bind,
    decode_template, encode_template, format, merge, parse, resolve_path, value_in,
};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

type Json = serde_json::Value;

/// The calls of a fixture that no row answers; a case fails when one is left after its call (P-3).
type Unexpected = Arc<Mutex<Vec<String>>>;

fn fail<T>(message: impl Into<String>) -> Result<T, Failed> {
    Err(Failed::from(message.into()))
}

fn text(value: &Json, what: &str) -> Result<String, Failed> {
    match value.as_str() {
        Some(text) => Ok(text.to_string()),
        None => fail(format!("{what} is no text: {value}")),
    }
}

fn uint(value: &Json, what: &str) -> Result<usize, Failed> {
    match value.as_u64().map(usize::try_from) {
        Some(Ok(number)) => Ok(number),
        _ => fail(format!("{what} is no unsigned integer: {value}")),
    }
}

/// The value of a key of a case or of a record; an absent key is None, which a default of the contract takes.
fn key<'a>(object: &'a Json, name: &str) -> Option<&'a Json> {
    object.as_object().and_then(|members| members.get(name))
}

fn required<'a>(object: &'a Json, name: &str) -> Result<&'a Json, Failed> {
    match key(object, name) {
        Some(value) => Ok(value),
        None => fail(format!("the key {name} is missing in {object}")),
    }
}

/// The bytes of a `source` value: its text, or `{"hex": ...}` for bytes that are no text (GN-13).
fn source_bytes(value: &Json) -> Result<Vec<u8>, Failed> {
    match value.as_str() {
        Some(text) => Ok(text.as_bytes().to_vec()),
        None => bytes_of(value),
    }
}

/// The bytes of a `bytes` value, `{"hex": ...}` (CNF-19).
fn bytes_of(value: &Json) -> Result<Vec<u8>, Failed> {
    let hex = text(required(value, "hex")?, "hex")?;
    (0..hex.len())
        .step_by(2)
        .map(|at| match hex.get(at..at + 2).map(|pair| u8::from_str_radix(pair, 16)) {
            Some(Ok(byte)) => Ok(byte),
            _ => fail(format!("{hex} is no hex text")),
        })
        .collect()
}

/// A native object of a test (VAL-19): it has no member and no method, as an object that entered as a handle.
#[derive(Debug)]
struct Native;

impl TemplateObject for Native {
    fn member(&self, _key: &str) -> Result<Option<Value>, HostError> {
        Ok(None)
    }

    fn call(&self, _method: &str, _args: &[Value]) -> Option<Result<Value, HostError>> {
        None
    }
}

/// The template value of a case value `{"kind", "value"}`, or the native object of `{"host": "object"}`.
fn template_value(value: &Json) -> Result<Value, Failed> {
    if let Some(host) = key(value, "host") {
        return match host.as_str() {
            Some("object") => Ok(Value::Object(Arc::new(Native))),
            _ => fail(format!("the runner makes no language value {host}")),
        };
    }
    let kind = text(required(value, "kind")?, "kind")?;
    let content = key(value, "value");
    match (kind.as_str(), content) {
        ("null", None) => Ok(Value::Null),
        ("bool", Some(Json::Bool(flag))) => Ok(Value::Bool(*flag)),
        ("int" | "float", Some(Json::Number(number))) => match number.as_f64() {
            Some(number) => Ok(Value::Number(number)),
            None => fail(format!("{number} is no number")),
        },
        ("text", Some(Json::String(text))) => Ok(Value::Str(text.clone())),
        ("list", Some(Json::Array(items))) => Ok(Value::list(items.iter().map(template_value).collect::<Result<_, _>>()?)),
        ("map", Some(Json::Array(pairs))) => {
            let mut map = OrderedMap::new();
            for pair in pairs {
                map.insert(text(&pair[0], "a map key")?, template_value(&pair[1])?);
            }
            Ok(Value::map(map))
        }
        _ => fail(format!("{value} is no template value of a case")),
    }
}

/// The case value of a template value that leaves the core (VAL-23): a number is a float, a safe string a text.
fn case_value(value: &Value) -> Json {
    match value {
        Value::Null => serde_json::json!({"kind": "null"}),
        Value::Bool(flag) => serde_json::json!({"kind": "bool", "value": flag}),
        Value::Number(number) => serde_json::json!({"kind": "float", "value": number}),
        Value::Str(text) | Value::Safe(text) => serde_json::json!({"kind": "text", "value": text}),
        Value::List(items) => serde_json::json!({"kind": "list", "value": items.iter().map(case_value).collect::<Vec<_>>()}),
        Value::Map(map) => {
            let pairs: Vec<Json> = map.iter().map(|(key, value)| serde_json::json!([key, case_value(value)])).collect();
            serde_json::json!({"kind": "map", "value": pairs})
        }
        Value::Object(_) => serde_json::json!({"host": "object"}),
    }
}

/// The JSON text of a json_value of a case: `number` holds its literal, `map` its pairs in order (GN-13).
fn json_text(value: &Json) -> Result<String, Failed> {
    let kind = text(required(value, "kind")?, "kind")?;
    let content = key(value, "value");
    match (kind.as_str(), content) {
        ("null", None) => Ok("null".to_string()),
        ("bool", Some(Json::Bool(flag))) => Ok(flag.to_string()),
        ("number", Some(Json::String(literal))) => Ok(literal.clone()),
        ("text", Some(text @ Json::String(_))) => Ok(text.to_string()),
        ("text", Some(Json::Object(form))) => ill_formed_text(form),
        ("list", Some(Json::Array(items))) => Ok(format!(
            "[{}]",
            items.iter().map(json_text).collect::<Result<Vec<_>, _>>()?.join(",")
        )),
        ("map", Some(Json::Array(pairs))) => {
            let mut members = Vec::new();
            for pair in pairs {
                members.push(format!("{}:{}", pair[0], json_text(&pair[1])?));
            }
            Ok(format!("{{{}}}", members.join(",")))
        }
        _ => fail(format!("{value} is no json_value of a case")),
    }
}

/// The JSON string of a text that is not well formed, `{"ill_formed": "<text>"}` (G-5 of binding): the text and then
/// the escape of an unpaired surrogate, a code unit that no well-formed text holds (VAL-12).
fn ill_formed_text(form: &serde_json::Map<String, Json>) -> Result<String, Failed> {
    match (form.len(), form.get("ill_formed")) {
        (1, Some(text @ Json::String(_))) => {
            let quoted = text.to_string();
            match quoted.strip_suffix('"') {
                Some(open) => Ok(format!("{open}\\ud800\"")),
                None => fail(format!("{quoted} is no JSON string")),
            }
        }
        _ => fail(format!("{} is no text of a case", Json::Object(form.clone()))),
    }
}

fn json_value(value: &Json) -> Result<polyspec_template::polyspec_json::Value, Failed> {
    use polyspec_template::polyspec_json::{ParseOptions, parse};
    let text = json_text(value)?;
    parse(text.as_bytes(), &ParseOptions::default()).map_err(|error| Failed::from(format!("the json_value {text}: {error}")))
}

/// Fails a key of a record value or of a variant value that is no field of it (CNF-19).
fn only(value: &Json, names: &[&str]) -> Result<(), Failed> {
    for name in value.as_object().into_iter().flat_map(serde_json::Map::keys) {
        if !names.contains(&name.as_str()) {
            return fail(format!("{value} has no field {name}"));
        }
    }
    Ok(())
}

/// The case of a variant value: its tag key `type` holds the value of the case as the contract states it (CNF-19).
fn case_of<'a>(value: &'a Json, variant: &str) -> Result<&'a str, Failed> {
    match key(value, "type").and_then(Json::as_str) {
        Some(case) => Ok(case),
        None => fail(format!(
            "a value of the variant {variant} is an object whose type is the value of one of its cases, not {value}"
        )),
    }
}

/// A field of an `optional` type whose default is null: left out or null, it is no value (CNF-19).
fn optional<'a>(value: &'a Json, name: &str) -> Option<&'a Json> {
    key(value, name).filter(|field| !field.is_null())
}

fn optional_text(value: &Json, name: &str) -> Result<Option<String>, Failed> {
    match optional(value, name) {
        Some(field) => text(field, name).map(Some),
        None => Ok(None),
    }
}

fn list_of<T>(value: &Json, what: &str, item: impl Fn(&Json) -> Result<T, Failed>) -> Result<Vec<T>, Failed> {
    match value.as_array() {
        Some(items) => items.iter().map(item).collect(),
        None => fail(format!("{what} is no list: {value}")),
    }
}

/// A `tuple<uint, uint>` of a case, the span of a node: an array of its two parts.
fn span_of(value: &Json) -> Result<Span, Failed> {
    match value.as_array().map(Vec::as_slice) {
        Some([start, end]) => Ok([uint(start, "the start of a span")?, uint(end, "the end of a span")?]),
        _ => fail(format!("a span is an array of two unsigned integers, not {value}")),
    }
}

/// The record `template` of a case value.
fn template_of(value: &Json) -> Result<Template, Failed> {
    only(value, &["name", "body", "comments"])?;
    Ok(Template {
        name: text(required(value, "name")?, "name")?,
        body: list_of(required(value, "body")?, "body", node_of)?,
        comments: list_of(required(value, "comments")?, "comments", |comment| {
            only(comment, &["value", "span"])?;
            Ok(Comment {
                value: text(required(comment, "value")?, "value")?,
                span: span_of(required(comment, "span")?)?,
            })
        })?,
    })
}

fn optional_nodes(value: &Json, name: &str) -> Result<Option<Vec<Node>>, Failed> {
    match optional(value, name) {
        Some(nodes) => list_of(nodes, name, node_of).map(Some),
        None => Ok(None),
    }
}

/// The variant `node` of a case value.
fn node_of(value: &Json) -> Result<Node, Failed> {
    let case = case_of(value, "node")?;
    let span = span_of(required(value, "span")?)?;
    let name = |name: &str| text(required(value, name)?, name);
    let expr = |name: &str| expr_of(required(value, name)?);
    let nodes = |name: &str| list_of(required(value, name)?, name, node_of);
    let fields = |names: &[&str]| only(value, &[&["type", "span"][..], names].concat());
    match case {
        "Text" => {
            fields(&["value"])?;
            Ok(Node::Text {
                value: name("value")?,
                span,
            })
        }
        "Echo" => {
            fields(&["expr"])?;
            Ok(Node::Echo { expr: expr("expr")?, span })
        }
        "If" => {
            fields(&["branches", "else"])?;
            Ok(Node::If {
                branches: list_of(required(value, "branches")?, "branches", |branch| {
                    only(branch, &["test", "body", "span"])?;
                    Ok(IfBranch {
                        test: expr_of(required(branch, "test")?)?,
                        body: list_of(required(branch, "body")?, "body", node_of)?,
                        span: span_of(required(branch, "span")?)?,
                    })
                })?,
                r#else: optional_nodes(value, "else")?,
                span,
            })
        }
        "For" => {
            fields(&["name", "iter", "body", "empty"])?;
            Ok(Node::For {
                name: name("name")?,
                iter: expr("iter")?,
                body: nodes("body")?,
                empty: optional_nodes(value, "empty")?,
                span,
            })
        }
        "Set" => {
            fields(&["name", "expr"])?;
            Ok(Node::Set {
                name: name("name")?,
                expr: expr("expr")?,
                span,
            })
        }
        "Include" => {
            fields(&["path"])?;
            Ok(Node::Include { path: name("path")?, span })
        }
        "Block" => {
            fields(&["id", "path", "scope"])?;
            Ok(Node::Block {
                id: optional_text(value, "id")?,
                path: optional_text(value, "path")?,
                scope: list_of(required(value, "scope")?, "scope", |item| {
                    only(item, &["name", "expr"])?;
                    Ok(ScopeItem {
                        name: text(required(item, "name")?, "name")?,
                        expr: expr_of(required(item, "expr")?)?,
                    })
                })?,
                span,
            })
        }
        "IfBlock" => {
            fields(&["id", "body", "else"])?;
            Ok(Node::IfBlock {
                id: name("id")?,
                body: nodes("body")?,
                r#else: optional_nodes(value, "else")?,
                span,
            })
        }
        other => fail(format!("{other} is no case of the variant node")),
    }
}

/// The variant `literal_value` of a case value.
fn literal_of(value: &Json) -> Result<LiteralValue, Failed> {
    match case_of(value, "literal_value")? {
        "null" => {
            only(value, &["type"])?;
            Ok(LiteralValue::Null)
        }
        case @ ("bool" | "number" | "string") => {
            only(value, &["type", "value"])?;
            match (case, required(value, "value")?) {
                ("bool", Json::Bool(flag)) => Ok(LiteralValue::Bool { value: *flag }),
                ("number", Json::Number(number)) => match number.as_f64() {
                    Some(number) => Ok(LiteralValue::Number { value: number }),
                    None => fail(format!("{number} is no number")),
                },
                ("string", Json::String(text)) => Ok(LiteralValue::String { value: text.clone() }),
                (_, other) => fail(format!("{other} is no value of the case {case} of the variant literal_value")),
            }
        }
        other => fail(format!("{other} is no case of the variant literal_value")),
    }
}

/// The variant `map_entry` of a case value.
fn map_entry_of(value: &Json) -> Result<MapEntry, Failed> {
    match case_of(value, "map_entry")? {
        "entry" => {
            only(value, &["type", "key", "value"])?;
            Ok(MapEntry::Entry {
                key: expr_of(required(value, "key")?)?,
                value: expr_of(required(value, "value")?)?,
            })
        }
        "spread" => {
            only(value, &["type", "expr"])?;
            Ok(MapEntry::Spread {
                expr: expr_of(required(value, "expr")?)?,
            })
        }
        other => fail(format!("{other} is no case of the variant map_entry")),
    }
}

/// The variant `expr` of a case value; an enum is the value of its variant (CNF-19).
fn expr_of(value: &Json) -> Result<Expr, Failed> {
    let case = case_of(value, "expr")?;
    let span = span_of(required(value, "span")?)?;
    let name = |name: &str| text(required(value, name)?, name);
    let expr = |name: &str| -> Result<Box<Expr>, Failed> { Ok(Box::new(expr_of(required(value, name)?)?)) };
    let exprs = |name: &str| list_of(required(value, name)?, name, expr_of);
    let fields = |names: &[&str]| only(value, &[&["type", "span"][..], names].concat());
    match case {
        "Literal" => {
            fields(&["kind", "value"])?;
            Ok(Expr::Literal {
                kind: name("kind")?,
                value: literal_of(required(value, "value")?)?,
                span,
            })
        }
        "Var" => {
            fields(&["name"])?;
            Ok(Expr::Var { name: name("name")?, span })
        }
        "LoopMeta" => {
            fields(&["loop", "field"])?;
            let field = name("field")?;
            match LoopMetaField::from_name(&field) {
                Some(field) => Ok(Expr::LoopMeta {
                    r#loop: name("loop")?,
                    field,
                    span,
                }),
                None => fail(format!("{field} is no value of the enum loop_meta_field")),
            }
        }
        "Member" => {
            fields(&["object", "key"])?;
            Ok(Expr::Member {
                object: expr("object")?,
                key: name("key")?,
                span,
            })
        }
        "MemberCall" => {
            fields(&["object", "method", "args"])?;
            Ok(Expr::MemberCall {
                object: expr("object")?,
                method: name("method")?,
                args: exprs("args")?,
                span,
            })
        }
        "ClassCall" => {
            fields(&["class_name", "method", "args"])?;
            Ok(Expr::ClassCall {
                class_name: name("class_name")?,
                method: name("method")?,
                args: exprs("args")?,
                span,
            })
        }
        "Index" => {
            fields(&["object", "index"])?;
            Ok(Expr::Index {
                object: expr("object")?,
                index: expr("index")?,
                span,
            })
        }
        "Call" => {
            fields(&["name", "args"])?;
            Ok(Expr::Call {
                name: name("name")?,
                args: exprs("args")?,
                span,
            })
        }
        "Unary" => {
            fields(&["op", "operand"])?;
            let op = match name("op")?.as_str() {
                "!" => UnaryOp::Not,
                "-" => UnaryOp::Negate,
                other => return fail(format!("{other} is no value of the enum unary_op")),
            };
            Ok(Expr::Unary {
                op,
                operand: expr("operand")?,
                span,
            })
        }
        "Binary" => {
            fields(&["op", "left", "right"])?;
            let op = name("op")?;
            match BinaryOp::from_text(&op) {
                Some(op) => Ok(Expr::Binary {
                    op,
                    left: expr("left")?,
                    right: expr("right")?,
                    span,
                }),
                None => fail(format!("{op} is no value of the enum binary_op")),
            }
        }
        "Ternary" => {
            fields(&["test", "then", "else"])?;
            Ok(Expr::Ternary {
                test: expr("test")?,
                then: match optional(value, "then") {
                    Some(then) => Some(Box::new(expr_of(then)?)),
                    None => None,
                },
                r#else: expr("else")?,
                span,
            })
        }
        "List" => {
            fields(&["items"])?;
            Ok(Expr::List {
                items: exprs("items")?,
                span,
            })
        }
        "Map" => {
            fields(&["entries"])?;
            Ok(Expr::Map {
                entries: list_of(required(value, "entries")?, "entries", map_entry_of)?,
                span,
            })
        }
        "Spread" => {
            fields(&["expr"])?;
            Ok(Expr::Spread { expr: expr("expr")?, span })
        }
        other => fail(format!("{other} is no case of the variant expr")),
    }
}

/// The case value of the record `template`, every field written (CNF-19).
fn case_template(template: &Template) -> Json {
    let comments: Vec<Json> = template
        .comments
        .iter()
        .map(|comment| serde_json::json!({"value": comment.value, "span": comment.span}))
        .collect();
    serde_json::json!({"name": template.name, "body": case_nodes(&template.body), "comments": comments})
}

fn case_nodes(nodes: &[Node]) -> Json {
    nodes.iter().map(case_node).collect()
}

fn case_optional_nodes(nodes: Option<&[Node]>) -> Json {
    match nodes {
        Some(nodes) => case_nodes(nodes),
        None => Json::Null,
    }
}

fn case_exprs(exprs: &[Expr]) -> Json {
    exprs.iter().map(case_expr).collect()
}

/// The case value of the variant `node`.
fn case_node(node: &Node) -> Json {
    match node {
        Node::Text { value, span } => serde_json::json!({"type": "Text", "value": value, "span": span}),
        Node::Echo { expr, span } => serde_json::json!({"type": "Echo", "expr": case_expr(expr), "span": span}),
        Node::If { branches, r#else, span } => {
            let branches: Vec<Json> = branches
                .iter()
                .map(|branch| serde_json::json!({"test": case_expr(&branch.test), "body": case_nodes(&branch.body), "span": branch.span}))
                .collect();
            serde_json::json!({"type": "If", "branches": branches, "else": case_optional_nodes(r#else.as_deref()), "span": span})
        }
        Node::For {
            name,
            iter,
            body,
            empty,
            span,
        } => serde_json::json!({"type": "For", "name": name, "iter": case_expr(iter), "body": case_nodes(body),
            "empty": case_optional_nodes(empty.as_deref()), "span": span}),
        Node::Set { name, expr, span } => serde_json::json!({"type": "Set", "name": name, "expr": case_expr(expr), "span": span}),
        Node::Include { path, span } => serde_json::json!({"type": "Include", "path": path, "span": span}),
        Node::Block { id, path, scope, span } => {
            let scope: Vec<Json> = scope
                .iter()
                .map(|item| serde_json::json!({"name": item.name, "expr": case_expr(&item.expr)}))
                .collect();
            serde_json::json!({"type": "Block", "id": id, "path": path, "scope": scope, "span": span})
        }
        Node::IfBlock { id, body, r#else, span } => serde_json::json!({"type": "IfBlock", "id": id, "body": case_nodes(body),
            "else": case_optional_nodes(r#else.as_deref()), "span": span}),
    }
}

/// The case value of the variant `literal_value`.
fn case_literal(value: &LiteralValue) -> Json {
    match value {
        LiteralValue::Null => serde_json::json!({"type": "null"}),
        LiteralValue::Bool { value } => serde_json::json!({"type": "bool", "value": value}),
        LiteralValue::Number { value } => serde_json::json!({"type": "number", "value": value}),
        LiteralValue::String { value } => serde_json::json!({"type": "string", "value": value}),
    }
}

/// The case value of the variant `expr`; an enum is the value of its variant.
fn case_expr(expr: &Expr) -> Json {
    match expr {
        Expr::Literal { kind, value, span } => {
            serde_json::json!({"type": "Literal", "kind": kind, "value": case_literal(value), "span": span})
        }
        Expr::Var { name, span } => serde_json::json!({"type": "Var", "name": name, "span": span}),
        Expr::LoopMeta { r#loop, field, span } => {
            serde_json::json!({"type": "LoopMeta", "loop": r#loop, "field": field.name(), "span": span})
        }
        Expr::Member { object, key, span } => {
            serde_json::json!({"type": "Member", "object": case_expr(object), "key": key, "span": span})
        }
        Expr::MemberCall {
            object,
            method,
            args,
            span,
        } => serde_json::json!({"type": "MemberCall", "object": case_expr(object), "method": method, "args": case_exprs(args),
            "span": span}),
        Expr::ClassCall {
            class_name,
            method,
            args,
            span,
        } => serde_json::json!({"type": "ClassCall", "class_name": class_name, "method": method, "args": case_exprs(args),
            "span": span}),
        Expr::Index { object, index, span } => {
            serde_json::json!({"type": "Index", "object": case_expr(object), "index": case_expr(index), "span": span})
        }
        Expr::Call { name, args, span } => serde_json::json!({"type": "Call", "name": name, "args": case_exprs(args), "span": span}),
        Expr::Unary { op, operand, span } => {
            serde_json::json!({"type": "Unary", "op": op.as_str(), "operand": case_expr(operand), "span": span})
        }
        Expr::Binary { op, left, right, span } => serde_json::json!({"type": "Binary", "op": op.as_str(), "left": case_expr(left),
            "right": case_expr(right), "span": span}),
        Expr::Ternary { test, then, r#else, span } => {
            let then = match then {
                Some(then) => case_expr(then),
                None => Json::Null,
            };
            serde_json::json!({"type": "Ternary", "test": case_expr(test), "then": then, "else": case_expr(r#else), "span": span})
        }
        Expr::List { items, span } => serde_json::json!({"type": "List", "items": case_exprs(items), "span": span}),
        Expr::Map { entries, span } => {
            let entries: Vec<Json> = entries
                .iter()
                .map(|entry| match entry {
                    MapEntry::Entry { key, value } => {
                        serde_json::json!({"type": "entry", "key": case_expr(key), "value": case_expr(value)})
                    }
                    MapEntry::Spread { expr } => serde_json::json!({"type": "spread", "expr": case_expr(expr)}),
                })
                .collect();
            serde_json::json!({"type": "Map", "entries": entries, "span": span})
        }
        Expr::Spread { expr, span } => serde_json::json!({"type": "Spread", "expr": case_expr(expr), "span": span}),
    }
}

fn case_tags(tags: &[SyntaxTag]) -> Json {
    tags.iter()
        .map(|tag| {
            serde_json::json!({"start": tag.start, "end": tag.end, "echo": tag.echo, "kind": tag.kind.as_str(),
                "body_start": tag.body_start, "body_end": tag.body_end})
        })
        .collect()
}

fn case_tokens(tokens: &[SyntaxToken]) -> Json {
    tokens
        .iter()
        .map(|token| serde_json::json!({"start": token.start, "end": token.end, "kind": token.kind.as_str()}))
        .collect()
}

/// One row of a callback or function fixture (c6 2.1).
struct Row {
    args: Json,
    result: Json,
    once: bool,
    used: bool,
}

/// The rows of a fixture: the first unused row whose `args` equal the arguments answers a call, and a call that no row
/// answers is recorded (c6 2.2).
struct Rows {
    name: String,
    rows: Mutex<Vec<Row>>,
    unexpected: Unexpected,
}

impl Rows {
    fn new(name: &str, rows: &Json, unexpected: &Unexpected) -> Result<Rows, Failed> {
        let Some(list) = rows.as_array() else {
            return fail(format!("the rows of {name} are no list: {rows}"));
        };
        let mut parsed = Vec::new();
        for row in list {
            if key(row, "raise").is_some() || key(row, "async").is_some() {
                return fail(format!("the runner reads no raise and no async row: {row}"));
            }
            parsed.push(Row {
                args: required(row, "args")?.clone(),
                result: match key(row, "result") {
                    Some(result) => result.clone(),
                    None => Json::Null,
                },
                once: key(row, "once") == Some(&Json::Bool(true)),
                used: false,
            });
        }
        Ok(Rows {
            name: name.to_string(),
            rows: Mutex::new(parsed),
            unexpected: Arc::clone(unexpected),
        })
    }

    fn answer(&self, args: &Json) -> Result<Json, Box<dyn std::error::Error + Send + Sync>> {
        let mut rows = self.rows.lock().expect("the rows of a fixture");
        for row in rows.iter_mut() {
            if !row.used && json_equal(&row.args, args) {
                row.used = row.once;
                return Ok(row.result.clone());
            }
        }
        let call = format!("{}({args})", self.name);
        self.unexpected.lock().expect("the unexpected calls").push(call.clone());
        Err(format!("UnexpectedCall: {call}").into())
    }
}

/// A loader of host code as a callback fixture of `loader.load`.
struct FixtureLoader(Rows);

impl Loader for FixtureLoader {
    fn load(&self, name: &str) -> Result<Option<Loaded>, LoadError> {
        let result = self.0.answer(&serde_json::json!({"name": name})).map_err(LoadError::Callback)?;
        if result.is_null() {
            return Ok(None);
        }
        let loaded = (|| -> Result<Loaded, Failed> {
            let version = text(required(&result, "version")?, "version")?;
            match case_of(&result, "loaded")? {
                "source" => {
                    only(&result, &["type", "bytes", "version"])?;
                    Ok(Loaded::Source {
                        bytes: bytes_of(required(&result, "bytes")?)?,
                        version,
                    })
                }
                "ast" => {
                    only(&result, &["type", "ast", "version", "lines"])?;
                    // `lines` is an optional field without a default, so the value names it (CNF-19).
                    let lines = match required(&result, "lines")? {
                        Json::Null => None,
                        lines => {
                            let starts = list_of(lines, "lines", |line| uint(line, "a line start"))?;
                            Some(
                                LineIndex::try_from_starts(starts)
                                    .map_err(|error| Failed::from(format!("the line index of the row: {error}")))?,
                            )
                        }
                    };
                    Ok(Loaded::Ast {
                        ast: template_of(required(&result, "ast")?)?,
                        version,
                        lines,
                    })
                }
                other => fail(format!("{other} is no case of the variant loaded")),
            }
        })();
        match loaded {
            Ok(loaded) => Ok(Some(loaded)),
            Err(error) => Err(LoadError::Callback(format!("the row of loader.load: {error:?}").into())),
        }
    }
}

/// The function of a case `{"function": [<row>]}` in the form of the contract (GN-6d): the template values of the call
/// and the record environment, and a failure of binding_core.
fn host_function(rows: &Json, unexpected: &Unexpected) -> Result<ContractFunction, Failed> {
    let rows = Rows::new("function", required(rows, "function")?, unexpected)?;
    Ok(Box::new(move |args: &[Value], environment: &Environment| {
        let list: Vec<Json> = args.iter().map(case_value).collect();
        let call = serde_json::json!({"0": list, "1": {"timezone": environment.timezone, "now": environment.now}});
        let result = rows.answer(&call).map_err(binding_core::Failure::Callback)?;
        template_value(&result).map_err(|error| binding_core::Failure::Callback(format!("the row of the function: {error:?}").into()))
    }))
}

/// What a case makes while it runs: the directory of its `path` values and the calls that no fixture row answers.
struct Run {
    directory: PathBuf,
    unexpected: Unexpected,
}

static RUNS: AtomicUsize = AtomicUsize::new(0);

impl Run {
    fn new() -> Result<Run, Failed> {
        let directory = std::env::temp_dir().join(format!(
            "polyspec-template-contract-cases-{}-{}",
            std::process::id(),
            RUNS.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&directory).map_err(|error| Failed::from(format!("{}: {error}", directory.display())))?;
        Ok(Run {
            directory,
            unexpected: Arc::new(Mutex::new(Vec::new())),
        })
    }

    /// A `path` value: a relative path inside the directory of the case (c6 1.5).
    fn path(&self, value: &Json) -> Result<PathBuf, Failed> {
        let path = text(value, "a path")?;
        if path.starts_with('/') || path.split('/').any(|part| part == "..") {
            return fail(format!("the path {path} leaves the directory of the case"));
        }
        Ok(self.directory.join(path))
    }

    fn loader(&self, value: &Json) -> Result<Box<dyn Loader>, Failed> {
        if let Some(callback) = key(value, "callback") {
            return Ok(Box::new(FixtureLoader(Rows::new(
                "loader.load",
                required(callback, "loader.load")?,
                &self.unexpected,
            )?)));
        }
        match text(required(value, "new")?, "new")?.as_str() {
            "fs_loader.new" => Ok(Box::new(FsLoader::new(self.path(required(required(value, "args")?, "root")?)?))),
            "map_loader.new" => Ok(Box::new(self.map_loader(value)?)),
            other => fail(format!("{other} makes no loader")),
        }
    }

    fn map_loader(&self, value: &Json) -> Result<MapLoader, Failed> {
        let mut loader = MapLoader::new();
        for step in steps(value) {
            let args = required(step, "args")?;
            match text(required(step, "call")?, "call")?.as_str() {
                "map_loader.set" => loader.set(&text(required(args, "name")?, "name")?, &text(required(args, "source")?, "source")?),
                "map_loader.set_ast" => loader
                    .set_ast(&text(required(args, "path")?, "path")?, template_of(required(args, "ast")?)?)
                    .map_err(|error| Failed::from(format!("the preparation failed: {error}")))?,
                other => return fail(format!("the runner prepares a map loader with no step {other}")),
            }
        }
        Ok(loader)
    }

    fn engine_options(&self, value: Option<&Json>) -> Result<EngineOptions<'static>, Failed> {
        let mut options = EngineOptions {
            artifact_refresh: Some(ArtifactRefresh::Dev),
            ..EngineOptions::default()
        };
        let Some(value) = value else {
            return Ok(options);
        };
        if let Some(loader) = key(value, "loader").filter(|loader| !loader.is_null()) {
            options.loader = Some(self.loader(loader)?);
        }
        if let Some(limits) = key(value, "limits").filter(|limits| !limits.is_null()) {
            options.limits = Some(Limits {
                iterations: uint(required(limits, "iterations")?, "iterations")?,
                depth: uint(required(limits, "depth")?, "depth")?,
                output_bytes: uint(required(limits, "output_bytes")?, "output_bytes")?,
                expression_depth: uint(required(limits, "expression_depth")?, "expression_depth")?,
            });
        }
        if let Some(delimiters) = key(value, "delimiters").filter(|delimiters| !delimiters.is_null()) {
            options.delimiters = Some(text(delimiters, "delimiters")?);
        }
        if let Some(refresh) = key(value, "artifact_refresh") {
            options.artifact_refresh = match text(refresh, "artifact_refresh")?.as_str() {
                "dev" => Some(ArtifactRefresh::Dev),
                "true" => Some(ArtifactRefresh::True),
                "false" => Some(ArtifactRefresh::False),
                other => return fail(format!("{other} is no artifact_refresh")),
            };
        }
        Ok(options)
    }

    /// The engine of an instance value `{"new": "engine.new", "args", "then"}`; a step that fails is a failed
    /// preparation, never the expected failure of the case (c6 1.1).
    fn engine(&self, value: &Json) -> Result<AstProgram, Failed> {
        if key(value, "new") != Some(&Json::String("engine.new".to_string())) {
            return fail(format!("{value} makes no engine"));
        }
        let options = self.engine_options(key(value, "args").and_then(|args| key(args, "options")))?;
        let mut engine = AstProgram::new(options).map_err(|error| Failed::from(format!("the preparation failed: {error}")))?;
        for step in steps(value) {
            let args = required(step, "args")?;
            let function = host_function(required(args, "host_function")?, &self.unexpected)?;
            match text(required(step, "call")?, "call")?.as_str() {
                "engine.register" => engine.register_function(&text(required(args, "name")?, "name")?, function),
                "engine.register_class" => engine.register_class_function(
                    &text(required(args, "class_name")?, "class_name")?,
                    &text(required(args, "method")?, "method")?,
                    function,
                ),
                other => return fail(format!("the runner prepares an engine with no step {other}")),
            }
            .map_err(|error| Failed::from(format!("the preparation failed: {error}")))?;
        }
        Ok(engine)
    }

    /// The bound map of an instance value of `bind` or `merge`.
    fn bound(&self, value: &Json) -> Result<BoundMap, Failed> {
        let args = required(value, "args")?;
        match text(required(value, "new")?, "new")?.as_str() {
            "bind" => {
                bind(&template_value(required(args, "value")?)?).map_err(|error| Failed::from(format!("the preparation failed: {error}")))
            }
            "merge" => Ok(merge(
                &self.bound(required(args, "first")?)?,
                &self.bound(required(args, "second")?)?,
            )),
            other => fail(format!("{other} makes no bound map")),
        }
    }

    fn render_options(&self, case: &Json) -> Result<RenderOptions, Failed> {
        let mut options = RenderOptions::default();
        let Some(value) = key(case, "options") else {
            return Ok(options);
        };
        if let Some(define) = key(value, "define") {
            let Some(pairs) = define.as_array() else {
                return fail(format!("define is no list of pairs: {define}"));
            };
            for pair in pairs {
                let entry = &pair[1];
                let field = |name: &str| match key(entry, name).filter(|field| !field.is_null()) {
                    Some(field) => text(field, name).map(Some),
                    None => Ok(None),
                };
                let data = match key(entry, "data").filter(|data| !data.is_null()) {
                    Some(data) => Some(DefineData::Value(template_value(data)?)),
                    None => None,
                };
                options.define.insert(
                    text(&pair[0], "a define id")?,
                    DefineInput {
                        template: field("template")?,
                        data,
                        html: field("html")?,
                    },
                );
            }
        }
        if let Some(env) = key(value, "env").filter(|env| !env.is_null()) {
            options.env = Some(Env {
                timezone: text(required(env, "timezone")?, "timezone")?,
                now: match required(env, "now")?.as_f64() {
                    Some(now) => now,
                    None => return fail("now is no number"),
                },
            });
        }
        Ok(options)
    }
}

impl Drop for Run {
    fn drop(&mut self) {
        // HR-87: the directory of the case does not outlive it; a directory that cannot be removed fails the run.
        std::fs::remove_dir_all(&self.directory).expect("the directory of the case is removed");
    }
}

fn steps(value: &Json) -> impl Iterator<Item = &Json> {
    key(value, "then").and_then(Json::as_array).into_iter().flatten()
}

/// The assign of a template_value: the value that the core takes is a map of values, null is no data (RT-4), and the
/// core has no entry for another value, so the runner refuses it.
fn assign_map(value: &Json) -> Result<OrderedMap, Failed> {
    match template_value(value)? {
        Value::Null => Ok(OrderedMap::new()),
        Value::Map(map) => Ok((*map).clone()),
        other => fail(format!("the core takes a map of values as assign, not {other:?}")),
    }
}

fn parse_options(case: &Json) -> Result<ParseOptions, Failed> {
    let delimiters = match key(case, "options")
        .and_then(|options| key(options, "delimiters"))
        .filter(|value| !value.is_null())
    {
        Some(delimiters) => Some(text(delimiters, "delimiters")?),
        None => None,
    };
    Ok(ParseOptions { delimiters })
}

/// The format options of a case; `indent` given as null keeps every line, and its text is an indent unit, which the
/// core validates (FMT-9).
fn format_options(case: &Json) -> Result<Result<FormatOptions, TemplateError>, Failed> {
    let mut options = FormatOptions::default();
    let Some(value) = key(case, "options") else {
        return Ok(Ok(options));
    };
    if let Some(name) = key(value, "name") {
        options.name = Some(text(name, "name")?);
    }
    if let Some(delimiters) = key(value, "delimiters").filter(|delimiters| !delimiters.is_null()) {
        options.delimiters = Some(text(delimiters, "delimiters")?);
    }
    if let Some(range) = key(value, "range").filter(|range| !range.is_null()) {
        options.range = Some(span_of(range)?);
    }
    if let Some(indent) = key(value, "indent") {
        options.indent = match indent.as_str() {
            Some(unit) => match IndentUnit::new(unit) {
                Ok(unit) => Some(unit),
                Err(error) => return Ok(Err(error)),
            },
            None => None,
        };
    }
    if let Some(blocks) = key(value, "template_blocks") {
        options.template_blocks = match text(blocks, "template_blocks")?.as_str() {
            "indent" => Some(TemplateBlocks::Indent),
            "flat" => Some(TemplateBlocks::Flat),
            other => return fail(format!("{other} is no template_blocks")),
        };
    }
    Ok(Ok(options))
}

/// What the member of a case gave: nothing, a value in the form of a case value, or a failure.
type Outcome = Result<Option<Json>, RenderError>;

fn kind_of<T>(result: Result<T, TemplateError>) -> Result<T, RenderError> {
    result.map_err(RenderError::Kind)
}

/// Runs the member of a group with the arguments of a case.
fn call(run: &Run, group: &str, case: &Json) -> Result<Outcome, Failed> {
    let arg = |name: &str| required(case, name);
    let name = |name: &str| text(required(case, name)?, name);
    let done = |result: Result<(), RenderError>| Ok(result.map(|()| None));
    let value = |result: Result<String, RenderError>| Ok(result.map(|text| Some(Json::String(text))));
    match group {
        "fs_loader.new" => {
            drop(FsLoader::new(run.path(arg("root")?)?));
            Ok(Ok(None))
        }
        "map_loader.new" => {
            drop(MapLoader::new());
            Ok(Ok(None))
        }
        "map_loader.set" => {
            run.map_loader(arg("receiver")?)?.set(&name("name")?, &name("source")?);
            Ok(Ok(None))
        }
        "map_loader.set_ast" => {
            let result = run.map_loader(arg("receiver")?)?.set_ast(&name("path")?, template_of(arg("ast")?)?);
            done(result.map_err(|message| RenderError::Callback(message.into())))
        }
        "map_loader.set_ast_lines" => {
            let lines = match arg("lines")?.as_array() {
                Some(lines) => lines.iter().map(|line| uint(line, "a line start")).collect::<Result<Vec<_>, _>>()?,
                None => return fail("lines is no list"),
            };
            let result = run
                .map_loader(arg("receiver")?)?
                .set_ast_lines(&name("path")?, lines, template_of(arg("ast")?)?);
            done(result.map_err(|message| RenderError::Callback(message.into())))
        }
        "engine.new" => done(kind_of(AstProgram::new(run.engine_options(key(case, "options"))?).map(drop))),
        "engine.register" => {
            let function = host_function(arg("host_function")?, &run.unexpected)?;
            done(kind_of(run.engine(arg("receiver")?)?.register_function(&name("name")?, function)))
        }
        "engine.register_class" => {
            let function = host_function(arg("host_function")?, &run.unexpected)?;
            done(kind_of(run.engine(arg("receiver")?)?.register_class_function(
                &name("class_name")?,
                &name("method")?,
                function,
            )))
        }
        "engine.render" => {
            let engine = run.engine(arg("receiver")?)?;
            let assign = match key(case, "assign") {
                Some(assign) => assign_map(assign)?,
                None => OrderedMap::new(),
            };
            value(engine.render_values(RenderTarget::Name(&name("name")?), assign, &run.render_options(case)?))
        }
        "engine.render_json" => {
            let engine = run.engine(arg("receiver")?)?;
            value(engine.render(
                RenderTarget::Name(&name("name")?),
                &json_value(arg("assign")?)?,
                &run.render_options(case)?,
            ))
        }
        "engine.render_bound" => {
            let engine = run.engine(arg("receiver")?)?;
            value(engine.render_bound(
                RenderTarget::Name(&name("name")?),
                &run.bound(arg("assign")?)?,
                &run.render_options(case)?,
            ))
        }
        "engine.load" => {
            let engine = run.engine(arg("receiver")?)?;
            done(engine.load(
                Io::for_generated_call(),
                RenderTarget::Name(&name("name")?),
                &run.render_options(case)?,
            ))
        }
        "engine.prepare" | "engine.prepare_bound" | "prepared_render.render" => prepared(run, group, case),
        "parse" => {
            let parsed = parse(&source_bytes(arg("source")?)?, &name("name")?, &parse_options(case)?);
            match parsed {
                Ok(template) => Ok(Ok(Some(case_template(&template)))),
                Err(error) => Ok(Err(RenderError::Kind(error))),
            }
        }
        "analyze" => match analyze(&source_bytes(arg("source")?)?, &name("name")?, &parse_options(case)?) {
            Ok(analysis) => Ok(Ok(Some(serde_json::json!({"ast": case_template(&analysis.ast),
                "tags": case_tags(&analysis.tags), "tokens": case_tokens(&analysis.tokens)})))),
            Err(error) => Ok(Err(RenderError::Kind(error))),
        },
        "analyze_prefix" => match analyze_prefix(&source_bytes(arg("source")?)?, &name("name")?, &parse_options(case)?) {
            Ok(analysis) => {
                let ast = match &analysis.ast {
                    Some(ast) => case_template(ast),
                    None => Json::Null,
                };
                let error = match &analysis.error {
                    Some(error) => serde_json::json!({"code": error.code.as_str(), "template": error.template, "line": error.line,
                        "col": error.col, "offset": error.offset, "end": error.end, "message": error.message}),
                    None => Json::Null,
                };
                Ok(Ok(Some(serde_json::json!({"ast": ast, "tags": case_tags(&analysis.tags),
                    "tokens": case_tokens(&analysis.tokens), "error": error}))))
            }
            Err(error) => Ok(Err(RenderError::Kind(error))),
        },
        "format" => {
            let formatted = match format_options(case)? {
                Ok(options) => format(&name("source")?, &options),
                Err(error) => Err(error),
            };
            Ok(kind_of(formatted).map(|formatted| Some(serde_json::json!({"text": formatted.text, "changed": formatted.changed}))))
        }
        "resolve_path" => value(kind_of(resolve_path(&name("current")?, &name("path")?))),
        "encode_template" => value(kind_of(encode_template(&template_of(arg("template")?)?))),
        "decode_template" => match decode_template(&name("json")?) {
            Ok(template) => Ok(Ok(Some(case_template(&template)))),
            Err(error) => Ok(Err(RenderError::Kind(error))),
        },
        "bind" => done(kind_of(bind(&template_value(arg("value")?)?).map(drop))),
        "merge" => {
            drop(merge(&run.bound(arg("first")?)?, &run.bound(arg("second")?)?));
            Ok(Ok(None))
        }
        other => fail(format!("the runner calls no member {other}")),
    }
}

/// The members of a prepared render, which borrows its engine: `engine.prepare` and `engine.prepare_bound` with their
/// `after` on the result, and `prepared_render.render` on a receiver that one of the two makes.
fn prepared(run: &Run, group: &str, case: &Json) -> Result<Outcome, Failed> {
    let (maker, source) = if group == "prepared_render.render" {
        let receiver = required(case, "receiver")?;
        (text(required(receiver, "new")?, "new")?, receiver)
    } else {
        (group.to_string(), case)
    };
    let args = if group == "prepared_render.render" {
        required(source, "args")?
    } else {
        case
    };
    let engine = run.engine(required(source, "receiver")?)?;
    let target = text(required(args, "name")?, "name")?;
    let options = run.render_options(args)?;
    let json;
    let bound;
    let made = match maker.as_str() {
        "engine.prepare" => {
            json = json_value(required(args, "assign")?)?;
            engine.prepare(Io::for_generated_call(), RenderTarget::Name(&target), &json, &options)
        }
        "engine.prepare_bound" => {
            bound = run.bound(required(args, "assign")?)?;
            engine.prepare_bound(Io::for_generated_call(), RenderTarget::Name(&target), &bound, &options)
        }
        other => return fail(format!("{other} makes no prepared render")),
    };
    if group == "prepared_render.render" {
        return match made {
            Ok(render) => Ok(render.render().map(|text| Some(Json::String(text)))),
            Err(error) => fail(format!("the preparation failed: {error}")),
        };
    }
    let render = match made {
        Ok(render) => render,
        Err(error) => return Ok(Err(error)),
    };
    for observation in key(case, "after").and_then(Json::as_array).into_iter().flatten() {
        if key(observation, "on") != Some(&Json::String("result".to_string()))
            || key(observation, "call") != Some(&Json::String("prepared_render.render".to_string()))
        {
            return fail(format!(
                "the runner observes only prepared_render.render on the result: {observation}"
            ));
        }
        let expected = required(observation, "result")?;
        match render.render() {
            Ok(text) if expected == &Json::String(text.clone()) => {}
            other => return fail(format!("after\n  actual {other:?}\nexpected {expected}")),
        }
    }
    Ok(Ok(None))
}

/// The expected result of a case as the runner writes a result: a template is read into the type of the core and
/// written from it, so a field that the case leaves out is null (CNF-19).
fn expected_result(group: &str, expected: &Json) -> Result<Json, Failed> {
    match group {
        "parse" | "decode_template" => Ok(case_template(&template_of(expected)?)),
        "analyze" | "analyze_prefix" => {
            let mut written = expected.clone();
            if let Some(ast) = optional(expected, "ast") {
                written["ast"] = case_template(&template_of(ast)?);
            }
            Ok(written)
        }
        _ => Ok(expected.clone()),
    }
}

/// Runs one case: its result equals `result`, or its failure has the kind and the category of `raises` (B-4), and no
/// fixture was called without a row.
fn run_case(group: &str, case: &Json) -> Result<(), Failed> {
    let run = Run::new()?;
    let outcome = call(&run, group, case)?;
    let unexpected = run.unexpected.lock().expect("the unexpected calls").clone();
    if !unexpected.is_empty() {
        return fail(format!("calls that no row of a fixture answers: {unexpected:?}"));
    }
    if key(case, "after").is_some() && !matches!(group, "engine.prepare" | "engine.prepare_bound") {
        return fail("the runner observes no after of this member");
    }
    match (outcome, key(case, "raises")) {
        (Ok(actual), None) => match (actual, key(case, "result")) {
            (None, None) => Ok(()),
            (Some(actual), Some(expected)) => {
                let expected = expected_result(group, expected)?;
                if json_equal(&actual, &expected) {
                    Ok(())
                } else {
                    fail(format!("result\n  actual {actual}\nexpected {expected}"))
                }
            }
            (actual, expected) => fail(format!("result\n  actual {actual:?}\nexpected {expected:?}")),
        },
        (Err(RenderError::Kind(error)), Some(raises)) => {
            let kind = error.code.as_str();
            let actual = serde_json::json!({"kind": kind, "status": null, "category": kind_category(kind)});
            if &actual == raises {
                Ok(())
            } else {
                fail(format!("raises\n  actual {actual} ({})\nexpected {raises}", error.message))
            }
        }
        (Ok(actual), Some(raises)) => fail(format!("the call gave {actual:?}, expected {raises}")),
        (Err(error), _) => fail(format!("the call failed: {error}")),
    }
}

/// A case that arms fault injection points (G-5, X-1): it arms them for the member of its group as a generated binding
/// test does, runs the case under the arming, and fails a fault that did not fire.
fn faulted(group: &str, case: &Json, faults: &Json) -> Result<(), Failed> {
    let id = binding_core::fault::arm(group, &faults.to_string()).map_err(|error| Failed::from(error.to_string()))?;
    let outcome = binding_core::fault::take(group).run(|| run_case(group, case));
    let left = binding_core::fault::left(id).map_err(|error| Failed::from(error.to_string()))?;
    if !left.is_empty() {
        return fail(format!("the faults of {} did not fire", left.join(", ")));
    }
    outcome
}

/// A case of the file: with its faults armed when it names any.
fn trial(group: &str, case: &Json) -> Result<(), Failed> {
    match key(case, "faults") {
        Some(faults) => faulted(group, case, faults),
        None => run_case(group, case),
    }
}

/// The children of a container of a case value, which the core asks for by the handle of the container.
enum Held {
    /// The items of a list, or the `[key, value]` pairs of a map.
    Items(Vec<Json>),
    /// `{"kind": "list", "repeat": n, "value": v}`: the lists that are still around the value, each the one item of
    /// the one around it.
    Nested(u64, Json),
}

/// A case value as a binding describes it to `value_in` (VAL-23): a scalar by its value and a container by a handle.
#[derive(Default)]
struct CaseHost {
    held: Vec<Held>,
    /// The first form of the case value that this runner does not read.
    problem: Option<String>,
}

impl CaseHost {
    fn hold(&mut self, held: Held) -> Handle {
        self.held.push(held);
        Handle::new(u64::try_from(self.held.len()).expect("a count of containers"))
    }

    fn held(&self, handle: Handle) -> Option<&Held> {
        match usize::try_from(handle.raw()) {
            Ok(number) => self.held.get(number.checked_sub(1)?),
            Err(_) => None,
        }
    }

    fn unread(&mut self, value: &Json) -> HostValue {
        self.problem.get_or_insert(format!("{value} is no case value of the alias"));
        HostValue::Null
    }

    fn describe(&mut self, value: &Json) -> HostValue {
        let kind = key(value, "kind").and_then(Json::as_str);
        let content = key(value, "value");
        match (kind, content) {
            (Some("null"), None) => HostValue::Null,
            (Some("bool"), Some(Json::Bool(flag))) => HostValue::Bool(*flag),
            (Some("int"), Some(Json::Number(number))) => match number.as_i64() {
                Some(number) => HostValue::Int(number),
                None => self.unread(value),
            },
            (Some("float"), Some(Json::Number(number))) => match number.as_f64() {
                Some(number) => HostValue::Float(number),
                None => self.unread(value),
            },
            (Some("float"), Some(Json::Object(form))) => match (form.len(), form.get("float").and_then(Json::as_str)) {
                (1, Some("nan")) => HostValue::Float(f64::NAN),
                (1, Some("inf")) => HostValue::Float(f64::INFINITY),
                (1, Some("-inf")) => HostValue::Float(f64::NEG_INFINITY),
                _ => self.unread(value),
            },
            (Some("number"), Some(Json::String(literal))) => HostValue::Number(literal.clone()),
            (Some("text"), Some(Json::String(text))) => HostValue::Text(HostText::Utf16(text.encode_utf16().collect())),
            // G-5 of binding: the text and then one code unit that no well-formed text holds, an unpaired surrogate.
            (Some("text"), Some(Json::Object(form))) => match (form.len(), form.get("ill_formed").and_then(Json::as_str)) {
                (1, Some(text)) => HostValue::Text(HostText::Utf16(text.encode_utf16().chain([0xD800]).collect())),
                _ => self.unread(value),
            },
            (Some("bytes"), Some(Json::Object(form))) => match (form.len(), form.get("hex").and_then(Json::as_str)) {
                (1, Some(hex)) if hex.len() % 2 == 0 && hex.bytes().all(|digit| digit.is_ascii_hexdigit()) => HostValue::Bytes(
                    (0..hex.len())
                        .step_by(2)
                        .map(|at| u8::from_str_radix(&hex[at..at + 2], 16).expect("two hex digits"))
                        .collect(),
                ),
                _ => self.unread(value),
            },
            (Some("list"), Some(inner)) if key(value, "repeat").is_some() => match key(value, "repeat").and_then(Json::as_u64) {
                Some(count) if count >= 1 => HostValue::List {
                    handle: self.hold(Held::Nested(count - 1, inner.clone())),
                    len: 1,
                },
                _ => self.unread(value),
            },
            (Some("list"), Some(Json::Array(items))) => HostValue::List {
                len: u64::try_from(items.len()).expect("a count of items"),
                handle: self.hold(Held::Items(items.clone())),
            },
            (Some("map"), Some(Json::Array(pairs))) => HostValue::Map {
                len: u64::try_from(pairs.len()).expect("a count of entries"),
                handle: self.hold(Held::Items(pairs.clone())),
            },
            _ => self.unread(value),
        }
    }
}

/// The child of a container at an index that the core asks for.
fn child(children: &[Json], index: u64) -> Option<Json> {
    match usize::try_from(index) {
        Ok(index) => children.get(index).cloned(),
        Err(_) => None,
    }
}

impl HostValues for CaseHost {
    fn item(&mut self, list: Handle, index: u64) -> Result<HostValue, Raised> {
        let item = match self.held(list) {
            Some(Held::Items(items)) => child(items, index),
            Some(Held::Nested(0, value)) => Some(value.clone()),
            Some(Held::Nested(left, value)) => {
                let around = Held::Nested(left - 1, value.clone());
                return Ok(HostValue::List {
                    handle: self.hold(around),
                    len: 1,
                });
            }
            None => None,
        };
        Ok(match item {
            Some(item) => self.describe(&item),
            None => self.unread(&Json::Null),
        })
    }

    fn entry(&mut self, map: Handle, index: u64) -> Result<(HostValue, HostValue), Raised> {
        let pair = match self.held(map) {
            Some(Held::Items(pairs)) => child(pairs, index),
            _ => None,
        };
        Ok(match pair.as_ref().and_then(Json::as_array).map(Vec::as_slice) {
            Some([Json::String(name), value]) => (
                HostValue::Text(HostText::Utf16(name.encode_utf16().collect())),
                self.describe(value),
            ),
            _ => (self.unread(&Json::Null), HostValue::Null),
        })
    }

    fn read(&mut self, value: Handle) -> Result<HostValue, Raised> {
        Ok(self.unread(&Json::String(format!("the handle {}", value.raw()))))
    }
}

/// A case of the value alias (U-7): `value_in` refuses its value with the kind of its `raises`.
fn alias_case(case: &Json) -> Result<(), Failed> {
    for name in case.as_object().into_iter().flat_map(serde_json::Map::keys) {
        if !matches!(name.as_str(), "id" | "note" | "rule" | "value" | "raises") {
            return fail(format!("a case of an alias has no key {name}"));
        }
    }
    let raises = required(case, "raises")?;
    let mut host = CaseHost::default();
    let value = host.describe(required(case, "value")?);
    let outcome = value_in(&mut host, value);
    if let Some(problem) = host.problem {
        return fail(problem);
    }
    match outcome {
        Err(RenderError::Kind(error)) => {
            let kind = error.code.as_str();
            let actual = serde_json::json!({"kind": kind, "status": null, "category": kind_category(kind)});
            if &actual == raises {
                Ok(())
            } else {
                fail(format!("raises\n  actual {actual} ({})\nexpected {raises}", error.message))
            }
        }
        Ok(value) => fail(format!("value_in gave {value:?}, expected {raises}")),
        Err(error) => fail(format!("value_in failed: {error}")),
    }
}

/// The variant of a kind is its words in UpperCamelCase (binding E-3).
fn variant_of(kind: &str) -> String {
    format!(
        "polyspec_template::ErrorCode::{}",
        kind.split('_')
            .map(|word| word[..1].to_uppercase() + &word[1..])
            .collect::<String>()
    )
}

/// The kinds that `value_in` returns (VAL-23), which the alias `template_value` names in `in_raises` (U-7).
const VALUE_IN_KINDS: [&str; 5] = [
    "data_number_range",
    "data_number_not_finite",
    "data_invalid_utf8",
    "data_unsupported_type",
    "data_depth",
];

/// `in_raises` of the alias names exactly the kinds of `value_in`, and each of them has a case of the alias.
fn in_raises_of_alias(in_raises: &[String], cases: &[Json]) -> Result<(), Failed> {
    let mut expected: Vec<String> = VALUE_IN_KINDS.iter().map(|kind| variant_of(kind)).collect();
    let mut declared = in_raises.to_vec();
    expected.sort();
    declared.sort();
    if declared != expected {
        return fail(format!("in_raises\n  actual {declared:?}\nexpected {expected:?}"));
    }
    for kind in VALUE_IN_KINDS {
        let raised = |case: &Json| key(case, "raises").and_then(|raises| key(raises, "kind")).and_then(Json::as_str) == Some(kind);
        if !cases.iter().any(raised) {
            return fail(format!("no case of the alias raises {kind}"));
        }
    }
    Ok(())
}

/// The kinds that the cases of a member raise are kinds of its `raises` in the contract; a case of another kind states
/// a failure that the contract does not give the member (E-5).
fn raises_of_member(member: &str, raises: &[String], cases: &[Json]) -> Result<(), Failed> {
    for case in cases {
        if let Some(kind) = key(case, "raises").and_then(|raises| key(raises, "kind")).and_then(Json::as_str) {
            let variant = variant_of(kind);
            if !raises.contains(&variant) {
                return fail(format!(
                    "a case of {member} raises {kind}, which the raises of the member do not name"
                ));
            }
        }
    }
    Ok(())
}

fn read(path: &[&str]) -> Json {
    let path = path.iter().fold(repo_root(), |path, part| path.join(part));
    let text = std::fs::read_to_string(&path)
        .map_err(|error| format!("{}: {error}", path.display()))
        .expect("the file is read");
    // A case of data_depth nests deeper than the 128 levels that serde_json reads by default.
    let mut reader = serde_json::Deserializer::from_str(&text);
    reader.disable_recursion_limit();
    serde::Deserialize::deserialize(&mut reader)
        .map_err(|error| format!("{}: {error}", path.display()))
        .expect("the file is JSON")
}

fn main() {
    let arguments = Arguments::from_args();
    let contract = read(&["packages", "rust", "interface.json"]);
    let file = read(&["contracts", "core-cases.json"]);
    let mut raises: HashMap<String, Vec<String>> = HashMap::new();
    for unit in contract["units"].as_array().expect("units") {
        for member in unit["members"].as_array().into_iter().flatten() {
            let kinds = member["raises"].as_array().into_iter().flatten();
            raises.insert(
                member["id"].as_str().expect("a member id").to_string(),
                kinds.map(|kind| kind.as_str().expect("a variant").to_string()).collect(),
            );
        }
    }
    let mut trials = Vec::new();
    let mut groups = Vec::new();
    // U-7: the value alias, whose cases a row of `cases` names by `alias`; without the row the trial reports it.
    let alias = "template_value";
    let alias_unit = contract["units"]
        .as_array()
        .expect("units")
        .iter()
        .find(|unit| unit["id"] == alias)
        .expect("the alias template_value");
    let in_raises: Vec<String> = alias_unit["in_raises"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|kind| kind.as_str().expect("a variant").to_string())
        .collect();
    let alias_cases: Vec<Json> = contract["cases"]
        .as_array()
        .expect("cases")
        .iter()
        .filter(|row| row["alias"] == alias)
        .flat_map(|row| {
            assert_eq!(row["file"], "contracts/core-cases.json", "the file of the cases of {alias}");
            assert_eq!(row["group"], alias, "the group of the cases of an alias has its id");
            match file[alias].as_array() {
                Some(cases) => cases.clone(),
                None => Vec::new(),
            }
        })
        .collect();
    {
        let cases = alias_cases.clone();
        trials.push(Trial::test(format!("in_raises::{alias}"), move || {
            in_raises_of_alias(&in_raises, &cases)
        }));
    }
    for case in alias_cases {
        let id = case["id"].as_str().expect("a case id").to_string();
        trials.push(Trial::test(format!("{alias}::{id}"), move || alias_case(&case)));
    }
    groups.push(alias.to_string());
    for row in contract["cases"].as_array().expect("cases") {
        if row.get("alias").is_some() {
            continue;
        }
        assert_eq!(
            row["file"], "contracts/core-cases.json",
            "the file of the cases of {}",
            row["member"]
        );
        let member = row["member"].as_str().expect("a member").to_string();
        let group = row["group"].as_str().expect("a group").to_string();
        assert_eq!(member, group, "a group of the case file has the id of its member");
        let Some(cases) = file[&group].as_array().cloned() else {
            panic!("the group {group} is not in the case file");
        };
        // HR-84: a member without a case checks nothing.
        assert!(!cases.is_empty(), "the group {group} has no case");
        let Some(kinds) = raises.get(&member).cloned() else {
            panic!("{member} is no member of the contract");
        };
        {
            let (member, cases) = (member.clone(), cases.clone());
            trials.push(Trial::test(format!("raises::{member}"), move || {
                raises_of_member(&member, &kinds, &cases)
            }));
        }
        for case in cases {
            let id = case["id"].as_str().expect("a case id").to_string();
            let group = group.clone();
            trials.push(Trial::test(format!("{group}::{id}"), move || trial(&group, &case)));
        }
        groups.push(group);
    }
    // A group of the file that no row of the contract names would run nowhere.
    for group in file.as_object().expect("the case file is an object").keys() {
        assert!(
            group == "comment" || groups.contains(group),
            "no row of cases names the group {group}"
        );
    }
    assert!(trials.len() >= 100, "expected the contract cases, found {}", trials.len());
    libtest_mimic::run(&arguments, trials).exit();
}
