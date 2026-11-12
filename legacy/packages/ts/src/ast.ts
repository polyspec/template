// AST node types as defined in docs/spec/ast.md.

// Byte offsets of a node in its source, as the pair [start, end) of AST-2.
export type Span = [number, number];

// The parsed form of one template file, the result of `parse` (AST-1).
export interface Template {
  type: 'Template';
  name: string;
  body: Node[];
  comments: Comment[];
}

// A comment of the template, listed in `Template.comments` in source order (AST-9).
export interface Comment { type: 'Comment'; value: string; span: Span }

// A statement node of a template body. The `type` field selects the member (AST-3).
export type Node = Text | Echo | If | For | Set | Include | Block | IfBlock;

// Literal output text and its source byte span (AST-3).
export interface Text { type: 'Text'; value: string; span: Span }
// An output expression and its source byte span (AST-3).
export interface Echo { type: 'Echo'; expr: Expr; span: Span }
// A condition and the statements selected when it is truthy (AST-3).
export interface IfBranch { test: Expr; body: Node[]; span: Span }
// Conditional branches and an optional else body (AST-3).
export interface If { type: 'If'; branches: IfBranch[]; else: Node[] | null; span: Span }
// A loop binding, its iterable and its body or empty branch (AST-3).
export interface For { type: 'For'; name: string; iter: Expr; body: Node[]; empty: Node[] | null; span: Span }
// A local assignment and the expression it evaluates (AST-3).
export interface Set { type: 'Set'; name: string; expr: Expr; span: Span }
// A literal template path loaded during rendering (AST-3).
export interface Include { type: 'Include'; path: string; span: Span }
// A scoped argument supplied to a template block (AST-3).
export interface ScopeItem { name: string; expr: Expr }
// A template block reference with optional scoped arguments (AST-3).
export interface Block { type: 'Block'; id: string | null; path: string | null; scope: ScopeItem[]; span: Span }
// A named conditional block and its optional else body (AST-3).
export interface IfBlock { type: 'IfBlock'; id: string; body: Node[]; else: Node[] | null; span: Span }

// An expression node of a tag. The `type` field selects the member (AST-4).
export type Expr = Literal | Var | LoopMeta | Member | MemberCall | ClassCall | Index | Call | Unary | Binary | Ternary | List | MapLiteral;

// The scalar kind carried by an AST literal (AST-4).
export type LiteralKind = 'null' | 'bool' | 'number' | 'string';
// A scalar literal whose kind identifies its value (AST-4).
export interface Literal { type: 'Literal'; kind: LiteralKind; value: null | boolean | number | string; span: Span }
// A variable reference resolved from render scope (AST-4).
export interface Var { type: 'Var'; name: string; span: Span }
// The reserved loop metadata fields (AST-4).
export type LoopMetaField = 'index_' | 'key_' | 'value_' | 'last_' | 'first_' | 'size_';
// An expression selecting metadata of a named loop (AST-4).
export interface LoopMeta { type: 'LoopMeta'; loop: string; field: LoopMetaField; span: Span }
// A literal member lookup on an expression value (AST-4).
export interface Member { type: 'Member'; object: Expr; key: string; span: Span }
// An instance method call with positional arguments (AST-4).
export interface MemberCall { type: 'MemberCall'; object: Expr; method: string; args: Expr[]; span: Span }
// A registered class function call (AST-4).
export interface ClassCall { type: 'ClassCall'; className: string; method: string; args: Expr[]; span: Span }
// A computed member lookup on an expression value (AST-4).
export interface Index { type: 'Index'; object: Expr; index: Expr; span: Span }
// A named template function call (AST-4).
export interface Call { type: 'Call'; name: string; args: Expr[]; span: Span }
// The unary operators accepted by the expression grammar (AST-4).
export type UnaryOp = '!' | '-';
// A unary operator applied to its operand (AST-4).
export interface Unary { type: 'Unary'; op: UnaryOp; operand: Expr; span: Span }
// The binary operators accepted by the expression grammar (AST-4).
export type BinaryOp =
  | '+' | '-' | '*' | '/' | '%'
  | '==' | '!=' | '===' | '!=='
  | '<' | '>' | '<=' | '>='
  | '&&' | '||' | '??' | 'in';
// A binary operator and its left and right operands (AST-4).
export interface Binary { type: 'Binary'; op: BinaryOp; left: Expr; right: Expr; span: Span }
// A conditional expression, with null then for the abbreviated form (AST-4).
export interface Ternary { type: 'Ternary'; test: Expr; then: Expr | null; else: Expr; span: Span }
// An expression expanded into a containing list or map (AST-4).
export interface Spread { type: 'Spread'; expr: Expr; span: Span }
// A list expression containing values or spreads (AST-4).
export interface List { type: 'List'; items: (Expr | Spread)[]; span: Span }
// A key expression and its associated map value expression (AST-4).
export interface MapEntry { key: Expr; value: Expr }
// A map expression containing entries or spreads (AST-4).
export interface MapLiteral { type: 'Map'; entries: (MapEntry | Spread)[]; span: Span }

const LOOP_META_FIELDS: readonly LoopMetaField[] = ['index_', 'key_', 'value_', 'last_', 'first_', 'size_'];

export function isLoopMetaField(name: string): name is LoopMetaField {
  return (LOOP_META_FIELDS as readonly string[]).includes(name);
}
