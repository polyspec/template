// Package entry: parser, engine, loaders, values and errors.
import type { Template } from './ast.js';
import { analyzeTemplate, analyzeTemplatePrefix, parseTemplate, type PrefixAnalysis, type SyntaxTag, type SyntaxToken } from './parser/parser.js';
import { DEFAULT_DELIMITERS, parseDelimiters, type Delimiters } from './parser/scanner.js';
import { AstProgramCore, type EngineOptions, type RenderOptions } from './render/engine.js';
import type { ParsedTemplate } from './render/context.js';
import { internalBoundary } from './errors.js';
import { Source } from './source.js';

// The exports of the render-only entry (render.ts) are exported here too; this entry adds the parser and the engine with it.
export * from './render.js';
export type { Comment } from './ast.js';
export { PathError } from './loader.js';
export type { ArtifactRefresh } from './render/engine.js';
export type { Delimiters } from './parser/scanner.js';
export type { PrefixAnalysis, SyntaxTag, SyntaxToken } from './parser/parser.js';
export { Source } from './source.js';
export { PageCache, type PageCacheTTL } from './page-cache.js';

// What `parse` accepts besides the source and the name.
export interface ParseOptions {
  delimiters?: string;
}

/** A delimiters option that is not a delimiter pair: an invalid argument of parse and analyze, not an error of the source. */
export class DelimiterOptionError extends RangeError {
  override name = 'DelimiterOptionError';
}

function delimitersOf(value: string | undefined): Delimiters {
  if (value === undefined) return DEFAULT_DELIMITERS;
  const delimiters = parseDelimiters(value);
  if (delimiters === null) throw new DelimiterOptionError(`${JSON.stringify(value)} is not a delimiter pair`);
  return delimiters;
}

// RT-2: parses one template source without loading other templates.
export function parse(source: string | Uint8Array, name: string, options: ParseOptions = {}): Template {
  const delimiters = delimitersOf(options.delimiters);
  return internalBoundary(name, () => parseWithLines(source, name, delimiters).ast);
}

/**
 * Parses a template and returns the tag ranges and expression tokens the parser accepted before its first error,
 * with that error, or every tag and token and a null error when the source parses. Editors use it while a
 * text is being typed and does not parse.
 */
export function analyzePrefix(source: string | Uint8Array, name: string, options: ParseOptions = {}): PrefixAnalysis {
  const delimiters = delimitersOf(options.delimiters);
  return internalBoundary(name, () => analyzeTemplatePrefix(typeof source === 'string' ? Source.fromText(name, source) : Source.fromBytes(name, source), delimiters));
}

/** Parses a template once and returns its AST with exact parser-owned tag ranges. */
export function analyze(source: string | Uint8Array, name: string, options: ParseOptions = {}): { ast: Template; tags: readonly SyntaxTag[]; tokens: readonly SyntaxToken[] } {
  const delimiters = delimitersOf(options.delimiters);
  return internalBoundary(name, () => analyzeTemplate(typeof source === 'string' ? Source.fromText(name, source) : Source.fromBytes(name, source), delimiters));
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
