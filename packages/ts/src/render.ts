// Render-only entry: renders parsed templates (AST JSON) without the lexer and parser.
export type { Template, Node, Expr, Span, Comment, Text, Echo, IfBranch, If, For, Set as SetNode, Include, ScopeItem, Block, IfBlock, LiteralKind, Literal, Var, LoopMetaField, LoopMeta as LoopMetaExpression, Member, MemberCall, ClassCall, Index, Call, Unary, Binary, Ternary, List, MapLiteral, Spread, MapEntry, UnaryOp, BinaryOp } from './ast.js';
export { decodeTemplate, AstDecodeError } from './decode.js';
export { TemplateError, internalBoundary, type ErrorCode, type ErrorObject } from './errors.js';
export { NativeObject, SafeString, type Value, type MapValue, type ListValue } from './value/value.js';
export { bindValue, bindMap, bindData, checkText, BindError } from './value/bind.js';
export { bind, merge } from './value/bound-operations.js';
export type { BoundMap } from './value/bound.js';
export { parseJson, parseJsonBytes } from './value/json.js';
export { MapLoader, resolvePath, type Loader, type LoadResult } from './loader.js';
export { AstProgramCore as AstProgram, Engine, type EngineOptions, type Program, type RenderOptions, type DefineInput } from './render/engine.js';
export { Frame, RenderContext, Scope } from './render/context.js';
export { RuntimeBindings } from './render/runtime-bindings.js';
export { RuntimeEnvironment } from './render/runtime-environment.js';
export type { Limits, RuntimeServices } from './render/context.js';
export type { HostFunction, Env, FunctionContext } from './functions/index.js';

// Named types reachable through the public loader and runtime signatures.
export type { BindErrorCode } from './value/bind.js';
export type { LoadedAst, LoadedSource } from './loader.js';
export type { LineIndex, Span as SourceSpan } from './errors.js';
export type { ParseFunction } from './render/engine.js';
export type { DefineEntry, LoopMeta as RuntimeLoopMeta } from './render/context.js';
export type { RuntimeLimit } from './render/runtime-bindings.js';
export type { Output } from './output.js';
