// The parser of the language service: the Rust core through the WebAssembly binding of @polyspec/template, the one build
// that runs wherever Node.js runs. The binding gives every range in UTF-8 bytes, as it does in every target; the tags and
// the tokens leave this module in UTF-16 string indexes, the unit of the text of an editor (EDT-10). The spans of the AST
// and the offsets of an error stay byte ranges (ERR-2).
import * as core from '@polyspec/template/wasm';

export type { Node, Template } from '@polyspec/template/wasm';

/** The parse options that the language service passes on. */
export interface ParseOptions {
  delimiters?: string;
}

/** A tag of a source, with string indexes. */
export interface SyntaxTag {
  kind: core.SyntaxTag['kind'];
  echo: boolean;
  start: number;
  end: number;
  bodyStart: number;
  bodyEnd: number;
}

/** A classified token of a tag, with string indexes. */
export interface SyntaxToken {
  kind: core.SyntaxToken['kind'];
  start: number;
  end: number;
}

/** The error of a source as the parser records it (ERR-1): `offset` and `end` are bytes, `col` is a byte column (ERR-2). */
export interface SourceErrorObject {
  code: string;
  line: number;
  col: number;
  offset: number;
  end: number;
  message: string;
}

/** The tags, tokens and AST of a source that parses. */
export interface Analysis {
  ast: core.Template;
  tags: SyntaxTag[];
  tokens: SyntaxToken[];
}

/** The tags and tokens before the first error of a source, with its AST when it has no error. */
export interface PrefixAnalysis {
  ast: core.Template | null;
  tags: SyntaxTag[];
  tokens: SyntaxToken[];
  error: SourceErrorObject | null;
}

/** A source that does not parse: the kind of the error and its position. */
export class SourceError extends Error implements SourceErrorObject {
  readonly code: string;
  readonly line: number;
  readonly col: number;
  readonly offset: number;
  readonly end: number;

  constructor(error: SourceErrorObject) {
    super(error.message);
    this.name = 'SourceError';
    this.code = error.code;
    this.line = error.line;
    this.col = error.col;
    this.offset = error.offset;
    this.end = error.end;
  }
}

/** A delimiters option that names no delimiter pair (LEX-21, LEX-22). */
export class DelimiterError extends Error {
  constructor(message: string, options: ErrorOptions) {
    super(message, options);
    this.name = 'DelimiterError';
  }
}

/** A path that leaves the root of its loader (RT-8). */
export class OutsideRootError extends Error {
  constructor(message: string, options: ErrorOptions) {
    super(message, options);
    this.name = 'OutsideRootError';
  }
}

const utf8Length = (code: number): number => (code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4);

// The string index of each byte offset of `text`. An offset inside a character is the index after it, as indexOfByte
// gives it. A text of ASCII has the same number at both.
function indexer(text: string): (offset: number) => number {
  let bytes = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.codePointAt(index) ?? 0;
    bytes += utf8Length(code);
    if (code >= 0x10000) index++;
  }
  if (bytes === text.length) return offset => offset;
  const indexes = new Uint32Array(bytes + 1);
  let at = 0;
  for (let index = 0; index < text.length;) {
    const code = text.codePointAt(index) ?? 0;
    const next = index + (code >= 0x10000 ? 2 : 1);
    const width = utf8Length(code);
    indexes[at] = index;
    for (let inside = 1; inside < width; inside++) indexes[at + inside] = next;
    at += width;
    index = next;
  }
  indexes[bytes] = text.length;
  return offset => indexes[Math.min(Math.max(offset, 0), bytes)] ?? text.length;
}

// The position of a byte offset of `bytes`, as the parser counts it (ERR-2).
function positionAt(bytes: Uint8Array, offset: number): { line: number; col: number } {
  let line = 1;
  let lineStart = 0;
  for (let index = 0; index < offset; index++) {
    if (bytes[index] === 0x0a) {
      line++;
      lineStart = index + 1;
    }
  }
  return { line, col: offset - lineStart + 1 };
}

// A text that holds a surrogate without its pair names no Unicode text, so the binding refuses it before the core reads
// it, without a position. The position is one of the text of the host, so the language service finds it (LEX-17).
function checkText(text: string): void {
  let bytes = 0;
  for (let index = 0; index < text.length; index++) {
    const unit = text.charCodeAt(index);
    const high = unit >= 0xd800 && unit <= 0xdbff;
    const low = unit >= 0xdc00 && unit <= 0xdfff;
    const next = text.charCodeAt(index + 1);
    if (low || (high && !(next >= 0xdc00 && next <= 0xdfff))) {
      const position = positionAt(new TextEncoder().encode(text.slice(0, index)), bytes);
      throw new SourceError({ code: 'lex_invalid_utf8', ...position, offset: bytes, end: bytes + 1, message: 'source contains an unpaired surrogate' });
    }
    if (high) {
      bytes += 4;
      index++;
    } else {
      bytes += utf8Length(unit);
    }
  }
}

// The offset of the first byte of `bytes` that is not UTF-8 (LEX-17), or -1.
function invalidByte(bytes: Uint8Array): number {
  for (let index = 0; index < bytes.length;) {
    const lead = bytes[index] ?? 0;
    const width = lead < 0x80 ? 1 : lead >= 0xc2 && lead <= 0xdf ? 2 : lead >= 0xe0 && lead <= 0xef ? 3 : lead >= 0xf0 && lead <= 0xf4 ? 4 : 0;
    if (width === 0) return index;
    for (let inside = 1; inside < width; inside++) {
      const byte = bytes[index + inside];
      if (byte === undefined) return index;
      // The second byte bounds the code point: no overlong form, no surrogate and nothing above U+10FFFF.
      const low = inside === 1 && lead === 0xe0 ? 0xa0 : inside === 1 && lead === 0xf0 ? 0x90 : 0x80;
      const high = inside === 1 && lead === 0xed ? 0x9f : inside === 1 && lead === 0xf4 ? 0x8f : 0xbf;
      if (byte < low || byte > high) return index;
    }
    index += width;
  }
  return -1;
}

// Runs a call of the core. An error that the language service names by its own class leaves as that class; every other
// error of the binding passes unchanged.
function call<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof core.TemplateValueError && error.kind === 'argument_delimiters') throw new DelimiterError(error.message, { cause: error });
    if (error instanceof core.TemplateValueError && error.kind === 'load_outside_root') throw new OutsideRootError(error.message, { cause: error });
    throw error;
  }
}

/** The tags and tokens before the first error of `source` (EDT-11). A source that is no Unicode text is a SourceError. */
export function analyzePrefix(source: string, name: string, options: ParseOptions = {}): PrefixAnalysis {
  checkText(source);
  const result = call(() => core.analyzePrefix(source, name, options));
  const at = indexer(source);
  const error = result.error ?? null;
  return {
    ast: result.ast ?? null,
    tags: Array.from(result.tags, tag => ({ kind: tag.kind, echo: tag.echo, start: at(tag.start), end: at(tag.end), bodyStart: at(tag.bodyStart), bodyEnd: at(tag.bodyEnd) })),
    tokens: Array.from(result.tokens, token => ({ kind: token.kind, start: at(token.start), end: at(token.end) })),
    error: error === null ? null : { code: error.code, line: error.line, col: error.col, offset: error.offset, end: error.end, message: error.message },
  };
}

/** The tags, tokens and AST of `source` (EDT-10). A source that does not parse is a SourceError with its position. */
export function analyze(source: string, name: string, options: ParseOptions = {}): Analysis {
  const { ast, tags, tokens, error } = analyzePrefix(source, name, options);
  if (error !== null) throw new SourceError(error);
  if (ast === null) throw new Error(`${name}: the core gave no AST and no error`);
  return { ast, tags, tokens };
}

/** The AST of `source`. Bytes that are not UTF-8 are a SourceError at the first such byte (LEX-17). */
export function parse(source: string | Uint8Array, name: string, options: ParseOptions = {}): core.Template {
  if (typeof source === 'string') return analyze(source, name, options).ast;
  const offset = invalidByte(source);
  if (offset >= 0) {
    throw new SourceError({ code: 'lex_invalid_utf8', ...positionAt(source, offset), offset, end: offset + 1, message: `invalid UTF-8 byte at offset ${offset}` });
  }
  return analyze(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(source), name, options).ast;
}

/** The name of `path` as the template `current` writes it (RT-8). A path that leaves the root is an OutsideRootError. */
export function resolvePath(current: string, path: string): string {
  return call(() => core.resolvePath(current, path));
}
