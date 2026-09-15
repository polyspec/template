// AST node types as defined in docs/spec/ast.md.

// Byte offsets of a node in its source, as the pair [start, end) of AST-2.
export type Span = [number, number];

// The parsed form of one template file, the result of `parse` (AST-1).
export interface Template {
  type: 'Template';
  name: string;
  body: Node[];
}

// A statement node of a template body. The `type` field selects the member (AST-3).
export type Node = Text | Echo | If | For | Set | Include | Block | IfBlock;

export interface Text { type: 'Text'; value: string; span: Span }
export interface Echo { type: 'Echo'; expr: Expr; span: Span }
export interface IfBranch { test: Expr; body: Node[]; span: Span }
export interface If { type: 'If'; branches: IfBranch[]; else: Node[] | null; span: Span }
export interface For { type: 'For'; name: string; iter: Expr; body: Node[]; empty: Node[] | null; span: Span }
export interface Set { type: 'Set'; name: string; expr: Expr; span: Span }
export interface Include { type: 'Include'; path: string; span: Span }
export interface ScopeItem { name: string; expr: Expr }
export interface Block { type: 'Block'; id: string | null; path: string | null; scope: ScopeItem[]; span: Span }
export interface IfBlock { type: 'IfBlock'; id: string; body: Node[]; else: Node[] | null; span: Span }

// An expression node of a tag. The `type` field selects the member (AST-4).
export type Expr = Literal | Var | LoopMeta | Member | MemberCall | ClassCall | Index | Call | Unary | Binary | Ternary | List | MapLiteral;

export type LiteralKind = 'null' | 'bool' | 'number' | 'string';
export interface Literal { type: 'Literal'; kind: LiteralKind; value: null | boolean | number | string; span: Span }
export interface Var { type: 'Var'; name: string; span: Span }
export type LoopMetaField = 'index_' | 'key_' | 'value_' | 'last_' | 'first_' | 'size_';
export interface LoopMeta { type: 'LoopMeta'; loop: string; field: LoopMetaField; span: Span }
export interface Member { type: 'Member'; object: Expr; key: string; span: Span }
export interface MemberCall { type: 'MemberCall'; object: Expr; method: string; args: Expr[]; span: Span }
export interface ClassCall { type: 'ClassCall'; className: string; method: string; args: Expr[]; span: Span }
export interface Index { type: 'Index'; object: Expr; index: Expr; span: Span }
export interface Call { type: 'Call'; name: string; args: Expr[]; span: Span }
export type UnaryOp = '!' | '-';
export interface Unary { type: 'Unary'; op: UnaryOp; operand: Expr; span: Span }
export type BinaryOp =
  | '+' | '-' | '*' | '/' | '%'
  | '==' | '!=' | '===' | '!=='
  | '<' | '>' | '<=' | '>='
  | '&&' | '||' | '??' | 'in';
export interface Binary { type: 'Binary'; op: BinaryOp; left: Expr; right: Expr; span: Span }
export interface Ternary { type: 'Ternary'; test: Expr; then: Expr | null; else: Expr; span: Span }
export interface Spread { type: 'Spread'; expr: Expr; span: Span }
export interface List { type: 'List'; items: (Expr | Spread)[]; span: Span }
export interface MapEntry { key: Expr; value: Expr }
export interface MapLiteral { type: 'Map'; entries: (MapEntry | Spread)[]; span: Span }

export const LOOP_META_FIELDS: readonly LoopMetaField[] = ['index_', 'key_', 'value_', 'last_', 'first_', 'size_'];

export function isLoopMetaField(name: string): name is LoopMetaField {
  return (LOOP_META_FIELDS as readonly string[]).includes(name);
}
