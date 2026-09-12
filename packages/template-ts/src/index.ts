// Package entry: parser, engine, loaders, values and errors.
import type { Template } from './ast.js';
import { parseTemplate } from './parser/parser.js';
import { DEFAULT_DELIMITERS, parseDelimiters, type Delimiters } from './parser/scanner.js';
import { AstProgramCore, type EngineOptions, type RenderOptions } from './render/engine.js';
import type { ParsedTemplate } from './render/context.js';
import { Source } from './source.js';

export type { Template, Node, Expr, Span } from './ast.js';
export { TemplateError, type ErrorCode, type ErrorObject } from './errors.js';
export { SafeString, type Value, type MapValue, type ListValue } from './value/value.js';
export { bind, BindError } from './value/bind.js';
export { parseJson, parseJsonBytes, JsonSyntaxError } from './value/json.js';
export { MapLoader, resolvePath, type Loader, type LoadResult } from './loader.js';
export type { ArtifactRefresh, EngineOptions, Program, RenderOptions, DefineInput } from './render/engine.js';
export { Engine } from './render/engine.js';
export type { Limits } from './render/context.js';
export type { HostFunction, Env, FunctionContext } from './functions/index.js';
export type { Delimiters } from './parser/scanner.js';
export { Source } from './source.js';
export { PageCache, type PageCacheTTL } from './page-cache.js';

// What `parse` accepts besides the source and the name.
export interface ParseOptions {
  delimiters?: string;
}

function delimitersOf(value: string | undefined): Delimiters {
  if (value === undefined) return DEFAULT_DELIMITERS;
  const delimiters = parseDelimiters(value);
  if (delimiters === null) throw new Error(`${JSON.stringify(value)} is not a delimiter pair`);
  return delimiters;
}

// RT-2: parses one template source without loading other templates.
export function parse(source: string | Uint8Array, name: string, options: ParseOptions = {}): Template {
  return parseWithLines(source, name, delimitersOf(options.delimiters)).ast;
}

function parseWithLines(source: string | Uint8Array, name: string, delimiters: Delimiters): ParsedTemplate {
  const parsed = typeof source === 'string' ? Source.fromText(name, source) : Source.fromBytes(name, source);
  return { ast: parseTemplate(parsed, delimiters), lines: parsed.lines };
}

// An engine that parses the sources its loader returns. The render-only entry point exports an
// engine that takes parsed templates instead.
export class AstProgram extends AstProgramCore {
  // Creates an engine with the parser attached.
  constructor(options: EngineOptions = {}) {
    super({ ...options, parse: parseWithLines });
  }
}

export type { ParsedTemplate };
export type { PreparedRender } from './render/engine.js';
export type { RenderOptions as EngineRenderOptions };
