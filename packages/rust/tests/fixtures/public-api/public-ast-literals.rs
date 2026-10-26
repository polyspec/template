use polyspec_template::{BinaryOp, LoopMetaField, UnaryOp};

pub fn binary_operators() -> [BinaryOp; 17] {
    use BinaryOp::*;
    [Add, Subtract, Multiply, Divide, Remainder, Equal, NotEqual,
     StrictEqual, StrictNotEqual, Less, Greater, LessEqual, GreaterEqual,
     And, Or, Coalesce, In]
}

pub fn unary_operators() -> [UnaryOp; 2] {
    [UnaryOp::Not, UnaryOp::Negate]
}

pub fn metadata_fields() -> [LoopMetaField; 6] {
    use LoopMetaField::*;
    [Index, Key, Value, Last, First, Size]
}
