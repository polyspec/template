// The parser of the compiler: the Rust core through the WebAssembly entry of @polyspec/template, the one build that runs
// wherever Node.js runs. This module is the only one that imports that entry. The AST leaves it in the form that the
// renderer of @polyspec/template/render reads: the core writes its AST as the canonical text (AST-10), which is one format
// for every implementation, and decodeTemplate of the renderer reads that text.
import * as core from '@polyspec/template/wasm';
import { decodeTemplate, type Template } from '@polyspec/template/render';

/** The parse options that the compiler passes on. */
export interface ParseOptions {
  delimiters?: string | null;
}

/**
 * A source that does not parse, with the fields of the error object of the core (ERR-1): `offset` and `end` are bytes and
 * `col` is a byte column (ERR-2). `code` is the name of the kind in the API of the renderer, `E_` and the kind in
 * capitals, as TemplateError of @polyspec/template/render names its codes.
 */
export class SourceError extends Error {
  readonly code: string;
  readonly template: string;
  readonly line: number;
  readonly col: number;
  readonly offset: number;
  readonly end: number;

  /** The error of the error object `found` of the core, whose `code` is the kind. */
  constructor(found: core.TemplateErrorObject, cause: unknown) {
    super(found.message, { cause });
    this.name = 'SourceError';
    this.code = `E_${found.code.toUpperCase()}`;
    ({ template: this.template, line: this.line, col: this.col, offset: this.offset, end: this.end } = found);
  }
}

/** A delimiters option that names no delimiter pair (LEX-21, LEX-22). */
export class DelimiterError extends Error {
  constructor(message: string, options: ErrorOptions) {
    super(message, options);
    this.name = 'DelimiterError';
  }
}

// The offset of the first byte of `bytes` that is not UTF-8 (LEX-17), or -1. The binding refuses such a source with the
// kind alone, so the compiler finds the position.
function invalidByte(bytes: Uint8Array): number {
  let index = 0;
  while (index < bytes.length) {
    const lead = bytes[index] ?? 0;
    let width = 0;
    if (lead < 0x80) width = 1;
    else if (lead >= 0xc2 && lead <= 0xdf) width = 2;
    else if (lead >= 0xe0 && lead <= 0xef) width = 3;
    else if (lead >= 0xf0 && lead <= 0xf4) width = 4;
    if (width === 0 || index + width > bytes.length) return index;
    // The second byte bounds the code point: no overlong form, no surrogate and nothing above U+10FFFF.
    const second = bytes[index + 1] ?? 0;
    if (lead === 0xe0 && second < 0xa0 || lead === 0xed && second > 0x9f || lead === 0xf0 && second < 0x90 || lead === 0xf4 && second > 0x8f) return index;
    for (let inside = 1; inside < width; inside++) if (((bytes[index + inside] ?? 0) & 0xc0) !== 0x80) return index;
    index += width;
  }
  return -1;
}

// The error of bytes that are not UTF-8, at the first such byte with its line and its byte column (ERR-2).
function invalidUtf8(bytes: Uint8Array, offset: number, name: string, cause: unknown): SourceError {
  let line = 1;
  let lineStart = 0;
  for (let index = 0; index < offset; index++) {
    if (bytes[index] !== 0x0a) continue;
    line++;
    lineStart = index + 1;
  }
  return new SourceError({ code: 'lex_invalid_utf8', template: name, line, col: offset - lineStart + 1, offset, end: offset + 1, message: `invalid UTF-8 byte at offset ${offset}` }, cause);
}

/**
 * The AST of the bytes `source` of the template `name`. A source that does not parse is a SourceError with the position
 * that the core records: an error that the binding throws holds its kind alone, so the position is the one of the error
 * object of the prefix analysis of the same source.
 */
export function parse(source: Uint8Array, name: string, options: ParseOptions = {}): Template {
  const coreOptions: core.ParseOptions = options.delimiters === undefined || options.delimiters === null ? {} : { delimiters: options.delimiters };
  let ast: core.Template;
  try {
    ast = core.parse(source, name, coreOptions);
  } catch (error) {
    if (!(error instanceof core.TemplateValueError)) throw error;
    if (error.kind === 'argument_delimiters') throw new DelimiterError(error.message, { cause: error });
    if (error.kind === 'lex_invalid_utf8') {
      const offset = invalidByte(source);
      if (offset < 0) throw error;
      throw invalidUtf8(source, offset, name, error);
    }
    const found = core.analyzePrefix(source, name, coreOptions).error ?? null;
    if (found === null) throw error;
    throw new SourceError(found, error);
  }
  return decodeTemplate(core.encodeTemplate(ast));
}
