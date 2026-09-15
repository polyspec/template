// Render-only entry: renders parsed templates (AST JSON) without the lexer and parser.
export type { Template, Node, Expr, Span } from './ast.js';
export { TemplateError, type ErrorCode, type ErrorObject } from './errors.js';
export { NativeObject, SafeString, type Value, type MapValue, type ListValue } from './value/value.js';
export { bind, bindMap, BindError } from './value/bind.js';
export { parseJson, parseJsonBytes, JsonSyntaxError } from './value/json.js';
export { MapLoader, resolvePath, type Loader, type LoadResult } from './loader.js';
export { AstProgramCore as AstProgram, Engine, type EngineOptions, type Program, type RenderOptions, type DefineInput } from './render/engine.js';
export { Frame, RenderContext, Scope } from './render/context.js';
export { RuntimeBindings } from './render/runtime-bindings.js';
export { RuntimeEnvironment } from './render/runtime-environment.js';
export type { Limits } from './render/context.js';
export type { HostFunction, Env, FunctionContext } from './functions/index.js';
