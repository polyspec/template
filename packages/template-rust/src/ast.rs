//! AST node types as defined in docs/spec/ast.md, serialized to the schema shape.

use crate::error::Span;
use serde::{Deserialize, Serialize};

/// A unary operator (AST-4).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum UnaryOp {
    /// Logical negation.
    #[serde(rename = "!")]
    Not,
    /// Arithmetic negation.
    #[serde(rename = "-")]
    Negate,
}

/// A binary operator (AST-4).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BinaryOp {
    /// Addition or concatenation.
    #[serde(rename = "+")]
    Add,
    /// Subtraction.
    #[serde(rename = "-")]
    Subtract,
    /// Multiplication.
    #[serde(rename = "*")]
    Multiply,
    /// Division.
    #[serde(rename = "/")]
    Divide,
    /// Remainder.
    #[serde(rename = "%")]
    Remainder,
    /// Loose equality.
    #[serde(rename = "==")]
    Equal,
    /// Loose inequality.
    #[serde(rename = "!=")]
    NotEqual,
    /// Strict equality.
    #[serde(rename = "===")]
    StrictEqual,
    /// Strict inequality.
    #[serde(rename = "!==")]
    StrictNotEqual,
    /// Less than.
    #[serde(rename = "<")]
    Less,
    /// Greater than.
    #[serde(rename = ">")]
    Greater,
    /// Less than or equal.
    #[serde(rename = "<=")]
    LessEqual,
    /// Greater than or equal.
    #[serde(rename = ">=")]
    GreaterEqual,
    /// Logical and.
    #[serde(rename = "&&")]
    And,
    /// Logical or.
    #[serde(rename = "||")]
    Or,
    /// Null coalescing.
    #[serde(rename = "??")]
    Coalesce,
    /// Membership.
    #[serde(rename = "in")]
    In,
}

impl BinaryOp {
    /// The operator as it is written in a template.
    pub fn as_str(self) -> &'static str {
        match self {
            BinaryOp::Add => "+",
            BinaryOp::Subtract => "-",
            BinaryOp::Multiply => "*",
            BinaryOp::Divide => "/",
            BinaryOp::Remainder => "%",
            BinaryOp::Equal => "==",
            BinaryOp::NotEqual => "!=",
            BinaryOp::StrictEqual => "===",
            BinaryOp::StrictNotEqual => "!==",
            BinaryOp::Less => "<",
            BinaryOp::Greater => ">",
            BinaryOp::LessEqual => "<=",
            BinaryOp::GreaterEqual => ">=",
            BinaryOp::And => "&&",
            BinaryOp::Or => "||",
            BinaryOp::Coalesce => "??",
            BinaryOp::In => "in",
        }
    }

    /// The operator of a source token, or None when the token is not a binary operator.
    pub fn from_text(text: &str) -> Option<BinaryOp> {
        Some(match text {
            "+" => BinaryOp::Add,
            "-" => BinaryOp::Subtract,
            "*" => BinaryOp::Multiply,
            "/" => BinaryOp::Divide,
            "%" => BinaryOp::Remainder,
            "==" => BinaryOp::Equal,
            "!=" => BinaryOp::NotEqual,
            "===" => BinaryOp::StrictEqual,
            "!==" => BinaryOp::StrictNotEqual,
            "<" => BinaryOp::Less,
            ">" => BinaryOp::Greater,
            "<=" => BinaryOp::LessEqual,
            ">=" => BinaryOp::GreaterEqual,
            "&&" => BinaryOp::And,
            "||" => BinaryOp::Or,
            "??" => BinaryOp::Coalesce,
            "in" => BinaryOp::In,
            _ => return None,
        })
    }
}

/// The root of a parsed template.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename = "Template")]
pub struct Template {
    /// Template name given to the parser.
    pub name: String,
    /// Statement nodes.
    pub body: Vec<Node>,
}

/// Statement nodes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
#[allow(missing_docs)]
pub enum Node {
    Text {
        value: String,
        span: Span,
    },
    Echo {
        expr: Expr,
        span: Span,
    },
    If {
        branches: Vec<IfBranch>,
        #[serde(rename = "else")]
        r#else: Option<Vec<Node>>,
        span: Span,
    },
    For {
        name: String,
        iter: Expr,
        body: Vec<Node>,
        empty: Option<Vec<Node>>,
        span: Span,
    },
    Set {
        name: String,
        expr: Expr,
        span: Span,
    },
    Include {
        path: String,
        span: Span,
    },
    Block {
        id: Option<String>,
        path: Option<String>,
        scope: Vec<ScopeItem>,
        span: Span,
    },
    IfBlock {
        id: String,
        body: Vec<Node>,
        #[serde(rename = "else")]
        r#else: Option<Vec<Node>>,
        span: Span,
    },
}

impl Node {
    /// Byte span of the node.
    pub fn span(&self) -> Span {
        match self {
            Node::Text { span, .. }
            | Node::Echo { span, .. }
            | Node::If { span, .. }
            | Node::For { span, .. }
            | Node::Set { span, .. }
            | Node::Include { span, .. }
            | Node::Block { span, .. }
            | Node::IfBlock { span, .. } => *span,
        }
    }
}

/// One branch of an `If` node.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct IfBranch {
    /// Condition.
    pub test: Expr,
    /// Body rendered when the condition is truthy.
    pub body: Vec<Node>,
    /// Span of the opening tag.
    pub span: Span,
}

/// A scope item of a block tag.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScopeItem {
    /// Name bound inside the block.
    pub name: String,
    /// Value expression evaluated in the calling scope.
    pub expr: Expr,
}

/// Literal value of a `Literal` node.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(untagged)]
#[allow(missing_docs)]
pub enum LiteralValue {
    Null,
    Bool(bool),
    Number(f64),
    String(String),
}

impl Serialize for LiteralValue {
    // AST-7: a number literal serializes as a JSON number; an integer within the safe range is
    // written without a fraction, other numbers with their shortest round-trip representation.
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            LiteralValue::Null => serializer.serialize_none(),
            LiteralValue::Bool(value) => serializer.serialize_bool(*value),
            LiteralValue::Number(value) if value.fract() == 0.0 && value.abs() <= 9007199254740991.0 => {
                serializer.serialize_i64(*value as i64)
            }
            LiteralValue::Number(value) => serializer.serialize_f64(*value),
            LiteralValue::String(value) => serializer.serialize_str(value),
        }
    }
}

/// Loop meta fields.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[allow(missing_docs)]
pub enum LoopMetaField {
    #[serde(rename = "index_")]
    Index,
    #[serde(rename = "key_")]
    Key,
    #[serde(rename = "value_")]
    Value,
    #[serde(rename = "last_")]
    Last,
    #[serde(rename = "first_")]
    First,
    #[serde(rename = "size_")]
    Size,
}

impl LoopMetaField {
    /// The field of a loop meta name, or None.
    pub fn from_name(name: &str) -> Option<LoopMetaField> {
        match name {
            "index_" => Some(LoopMetaField::Index),
            "key_" => Some(LoopMetaField::Key),
            "value_" => Some(LoopMetaField::Value),
            "last_" => Some(LoopMetaField::Last),
            "first_" => Some(LoopMetaField::First),
            "size_" => Some(LoopMetaField::Size),
            _ => None,
        }
    }
}

/// Entry of a map literal.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
#[allow(missing_docs)]
pub enum MapEntry {
    Entry { key: Expr, value: Expr },
    Spread(Expr),
}

/// Expression nodes. `Spread` appears only inside `List` items and `Map` entries.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
#[allow(missing_docs)]
pub enum Expr {
    Literal {
        kind: String,
        value: LiteralValue,
        span: Span,
    },
    Var {
        name: String,
        span: Span,
    },
    LoopMeta {
        r#loop: String,
        field: LoopMetaField,
        span: Span,
    },
    Member {
        object: Box<Expr>,
        key: String,
        span: Span,
    },
    Index {
        object: Box<Expr>,
        index: Box<Expr>,
        span: Span,
    },
    Call {
        name: String,
        args: Vec<Expr>,
        span: Span,
    },
    Unary {
        op: UnaryOp,
        operand: Box<Expr>,
        span: Span,
    },
    Binary {
        op: BinaryOp,
        left: Box<Expr>,
        right: Box<Expr>,
        span: Span,
    },
    Ternary {
        test: Box<Expr>,
        then: Option<Box<Expr>>,
        r#else: Box<Expr>,
        span: Span,
    },
    List {
        items: Vec<Expr>,
        span: Span,
    },
    Map {
        entries: Vec<MapEntry>,
        span: Span,
    },
    Spread {
        expr: Box<Expr>,
        span: Span,
    },
}

impl Expr {
    /// Byte span of the expression.
    pub fn span(&self) -> Span {
        match self {
            Expr::Literal { span, .. }
            | Expr::Var { span, .. }
            | Expr::LoopMeta { span, .. }
            | Expr::Member { span, .. }
            | Expr::Index { span, .. }
            | Expr::Call { span, .. }
            | Expr::Unary { span, .. }
            | Expr::Binary { span, .. }
            | Expr::Ternary { span, .. }
            | Expr::List { span, .. }
            | Expr::Map { span, .. }
            | Expr::Spread { span, .. } => *span,
        }
    }
}
