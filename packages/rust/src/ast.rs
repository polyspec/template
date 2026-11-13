//! AST node types as defined in docs/spec/ast.md; `ast_json` reads and writes their JSON form (AST-7).

use crate::error::Span;

/// A unary operator (AST-4).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UnaryOp {
    /// Logical negation.
    Not,
    /// Arithmetic negation.
    Negate,
}

impl UnaryOp {
    /// The operator token.
    pub fn as_str(self) -> &'static str {
        match self {
            UnaryOp::Not => "!",
            UnaryOp::Negate => "-",
        }
    }
}

/// A binary operator (AST-4).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BinaryOp {
    /// Addition or concatenation.
    Add,
    /// Subtraction.
    Subtract,
    /// Multiplication.
    Multiply,
    /// Division.
    Divide,
    /// Remainder.
    Remainder,
    /// Loose equality.
    Equal,
    /// Loose inequality.
    NotEqual,
    /// Strict equality.
    StrictEqual,
    /// Strict inequality.
    StrictNotEqual,
    /// Less than.
    Less,
    /// Greater than.
    Greater,
    /// Less than or equal.
    LessEqual,
    /// Greater than or equal.
    GreaterEqual,
    /// Logical and.
    And,
    /// Logical or.
    Or,
    /// Null coalescing.
    Coalesce,
    /// Membership.
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
#[derive(Debug, Clone, PartialEq)]
pub struct Template {
    /// Template name given to the parser.
    pub name: String,
    /// Statement nodes.
    pub body: Vec<Node>,
    /// Comments of the template in source order (AST-9).
    pub comments: Vec<Comment>,
}

/// A comment of the template, listed in `Template::comments` (AST-9).
#[derive(Debug, Clone, PartialEq)]
pub struct Comment {
    /// Source text between the sigil `*` and the `*` of the terminator.
    pub value: String,
    /// Span of the comment tag, including a wrapper.
    pub span: Span,
}

/// Statement nodes.
#[derive(Debug, Clone, PartialEq)]
pub enum Node {
    /// Literal text between tags (AST-1).
    Text {
        /// The text, with escapes and standalone lines applied.
        value: String,
        /// From the first to the last source byte that contributes to the value.
        span: Span,
    },
    /// An echo tag `{= expr}`.
    Echo {
        /// The echoed expression.
        expr: Expr,
        /// The tag.
        span: Span,
    },
    /// A conditional `{? test}` with its `{:? test}` branches and an optional `{:}` branch.
    If {
        /// The branches in source order, each with its condition and body.
        branches: Vec<IfBranch>,
        /// The body of the `{:}` branch, or None.
        r#else: Option<Vec<Node>>,
        /// From the opening tag to the end of the closing tag.
        span: Span,
    },
    /// A loop `{@ name = iter}` with an optional `{:}` branch for an empty iterable.
    For {
        /// The loop variable.
        name: String,
        /// The iterated expression.
        iter: Expr,
        /// The body rendered for each entry.
        body: Vec<Node>,
        /// The body rendered when the iterable has no entry, or None.
        empty: Option<Vec<Node>>,
        /// From the opening tag to the end of the closing tag.
        span: Span,
    },
    /// An assignment `{= name = expr}` to a local variable.
    Set {
        /// The assigned variable.
        name: String,
        /// The assigned expression.
        expr: Expr,
        /// The tag.
        span: Span,
    },
    /// An include tag `{+ path}`.
    Include {
        /// The included path as written in the tag.
        path: String,
        /// The tag.
        span: Span,
    },
    /// A block tag `{# id path scope}`.
    Block {
        /// The identifier of the template definition, or None.
        id: Option<String>,
        /// The template path, or None.
        path: Option<String>,
        /// The scope arguments of the tag.
        scope: Vec<ScopeItem>,
        /// The tag.
        span: Span,
    },
    /// An if-block `{?# id}` that renders its body when the definition `id` is registered.
    IfBlock {
        /// The identifier of the template definition.
        id: String,
        /// The body rendered when the definition is registered.
        body: Vec<Node>,
        /// The body of the `{:}` branch, or None.
        r#else: Option<Vec<Node>>,
        /// From the opening tag to the end of the closing tag.
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
#[derive(Debug, Clone, PartialEq)]
pub struct IfBranch {
    /// Condition.
    pub test: Expr,
    /// Body rendered when the condition is truthy.
    pub body: Vec<Node>,
    /// Span of the opening tag.
    pub span: Span,
}

/// A scope item of a block tag.
#[derive(Debug, Clone, PartialEq)]
pub struct ScopeItem {
    /// Name bound inside the block.
    pub name: String,
    /// Value expression evaluated in the calling scope.
    pub expr: Expr,
}

/// Literal value of a `Literal` node.
#[derive(Debug, Clone, PartialEq)]
pub enum LiteralValue {
    /// `null`.
    Null,
    /// `true` or `false`.
    Bool {
        /// The value.
        value: bool,
    },
    /// A number.
    Number {
        /// The value.
        value: f64,
    },
    /// The decoded string.
    String {
        /// The value.
        value: String,
    },
}

/// Loop meta fields.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LoopMetaField {
    /// `index_`: the position of the entry, from 0.
    Index,
    /// `key_`: the key of the entry.
    Key,
    /// `value_`: the value of the entry.
    Value,
    /// `last_`: whether the entry is the last one.
    Last,
    /// `first_`: whether the entry is the first one.
    First,
    /// `size_`: the number of entries.
    Size,
}

impl LoopMetaField {
    /// The name of the field in the source and the AST.
    pub fn name(self) -> &'static str {
        match self {
            LoopMetaField::Index => "index_",
            LoopMetaField::Key => "key_",
            LoopMetaField::Value => "value_",
            LoopMetaField::Last => "last_",
            LoopMetaField::First => "first_",
            LoopMetaField::Size => "size_",
        }
    }

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
#[derive(Debug, Clone, PartialEq)]
pub enum MapEntry {
    /// An entry `key => value`.
    Entry {
        /// The key expression.
        key: Expr,
        /// The value expression.
        value: Expr,
    },
    /// A spread `...expr` of a map.
    Spread {
        /// The spread expression.
        expr: Expr,
    },
}

/// Expression nodes. `Spread` appears only inside `List` items and `Map` entries.
#[derive(Debug, Clone, PartialEq)]
pub enum Expr {
    /// A literal.
    Literal {
        /// `null`, `bool`, `number` or `string`.
        kind: String,
        /// The value of the literal.
        value: LiteralValue,
        /// The literal in the source.
        span: Span,
    },
    /// A variable.
    Var {
        /// The name of the variable.
        name: String,
        /// The name in the source.
        span: Span,
    },
    /// A loop meta `loop.field_` of an enclosing loop.
    LoopMeta {
        /// The loop variable that names the loop.
        r#loop: String,
        /// The meta field.
        field: LoopMetaField,
        /// The expression in the source.
        span: Span,
    },
    /// A member `object.key`; `a.0` has the key `"0"`.
    Member {
        /// The object expression.
        object: Box<Expr>,
        /// The member name.
        key: String,
        /// The expression in the source.
        span: Span,
    },
    /// A call of a declared method of an assigned object.
    MemberCall {
        /// The object expression.
        object: Box<Expr>,
        /// The method name.
        method: String,
        /// The argument expressions.
        args: Vec<Expr>,
        /// The expression in the source.
        span: Span,
    },
    /// A call `Class::method(args)` of a declared logical class function.
    ClassCall {
        /// The class name.
        class_name: String,
        /// The method name.
        method: String,
        /// The argument expressions.
        args: Vec<Expr>,
        /// The expression in the source.
        span: Span,
    },
    /// An index `object[index]`.
    Index {
        /// The object expression.
        object: Box<Expr>,
        /// The index expression.
        index: Box<Expr>,
        /// The expression in the source.
        span: Span,
    },
    /// A function call `name(args)`, also written as a pipe.
    Call {
        /// The function name.
        name: String,
        /// The argument expressions.
        args: Vec<Expr>,
        /// The expression in the source.
        span: Span,
    },
    /// A unary operation `!` or `-`.
    Unary {
        /// The operator.
        op: UnaryOp,
        /// The operand.
        operand: Box<Expr>,
        /// The expression in the source.
        span: Span,
    },
    /// A binary operation.
    Binary {
        /// The operator.
        op: BinaryOp,
        /// The left operand.
        left: Box<Expr>,
        /// The right operand.
        right: Box<Expr>,
        /// The expression in the source.
        span: Span,
    },
    /// A conditional `test ? then : else`, or `test ?: else`.
    Ternary {
        /// The condition.
        test: Box<Expr>,
        /// The value when the condition is truthy, or None for `?:`.
        then: Option<Box<Expr>>,
        /// The value when the condition is falsy.
        r#else: Box<Expr>,
        /// The expression in the source.
        span: Span,
    },
    /// A list literal.
    List {
        /// The items, each an expression or a `Spread`.
        items: Vec<Expr>,
        /// The expression in the source.
        span: Span,
    },
    /// A map literal.
    Map {
        /// The entries, each `key => value` or a `Spread`.
        entries: Vec<MapEntry>,
        /// The expression in the source.
        span: Span,
    },
    /// A spread `...expr` inside a list or map literal.
    Spread {
        /// The spread expression.
        expr: Box<Expr>,
        /// The expression in the source.
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
            | Expr::MemberCall { span, .. }
            | Expr::ClassCall { span, .. }
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
