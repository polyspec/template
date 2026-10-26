use polyspec_template::{
    BinaryOp, Comment, Expr, IfBranch, LiteralValue, LoopMetaField, MapEntry,
    Node, ScopeItem, Template, UnaryOp,
};

pub fn public_ast() -> Template {
    let literal = Expr::Literal { kind: "null".into(), value: LiteralValue::Null, span: [0, 0] };
    let _: Vec<MapEntry> = Vec::new();
    let _: Vec<ScopeItem> = Vec::new();
    let _: Vec<IfBranch> = Vec::new();
    let _: (UnaryOp, BinaryOp, LoopMetaField) = (UnaryOp::Not, BinaryOp::Add, LoopMetaField::Index);
    Template {
        name: "page.tpl".into(),
        body: vec![Node::Echo { expr: literal, span: [0, 0] }],
        comments: vec![Comment { value: "note".into(), span: [0, 0] }],
    }
}
