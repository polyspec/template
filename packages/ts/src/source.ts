// Template source: UTF-8 validation, BOM removal and the mapping from string indexes to byte offsets (LEX-1, LEX-2, LEX-16).
import { elementAt } from './checked.js';
import { errorAt, lineIndexOf, positionOf, type ErrorCode, type LineIndex } from './errors.js';
import { firstInvalidUtf8, firstUnpairedSurrogate, utf8Encoder } from './escape.js';

// BOM removal belongs to the constructor, so decoding keeps any subsequent BOM.
const sourceDecoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

// One template source. It validates the UTF-8, removes a byte order mark and maps the string
// indexes that the lexer uses to the byte offsets that spans and error positions report
// (LEX-1, LEX-2, LEX-16).
export class Source {
  readonly text: string;
  readonly lines: LineIndex;
  // byteOffset[i] is the byte offset of the UTF-16 code unit i; byteOffset[text.length] is the byte length.
  private readonly byteOffset: Uint32Array;

  private constructor(readonly name: string, readonly bytes: Uint8Array) {
    this.text = sourceDecoder.decode(bytes);
    this.lines = lineIndexOf(bytes);
    this.byteOffset = new Uint32Array(this.text.length + 1);
    let offset = 0;
    for (let i = 0; i < this.text.length; i++) {
      this.byteOffset[i] = offset;
      const code = this.text.charCodeAt(i);
      if (code < 0x80) offset += 1;
      else if (code < 0x800) offset += 2;
      else if (code >= 0xd800 && code <= 0xdbff) {
        offset += 4;
        i++;
        this.byteOffset[i] = offset;
      } else offset += 3;
    }
    this.byteOffset[this.text.length] = offset;
  }

  // Reads a source from bytes. Invalid UTF-8 raises E_LEX_INVALID_UTF8 at the first invalid byte.
  static fromBytes(name: string, input: Uint8Array): Source {
    const captured = new Uint8Array(input);
    const invalid = firstInvalidUtf8(captured);
    if (invalid >= 0) {
      throw errorAt('E_LEX_INVALID_UTF8', name, lineIndexOf(captured), [invalid, invalid + 1], `invalid UTF-8 byte at offset ${invalid}`);
    }
    const bytes = captured.length >= 3 && captured[0] === 0xef && captured[1] === 0xbb && captured[2] === 0xbf ? captured.subarray(3) : captured;
    return new Source(name, bytes);
  }

  // Reads a source from text, rejecting unpaired UTF-16 surrogates.
  static fromText(name: string, text: string): Source {
    const invalid = firstUnpairedSurrogate(text);
    if (invalid >= 0) {
      const prefix = utf8Encoder.encode(text.slice(0, invalid));
      throw errorAt('E_LEX_INVALID_UTF8', name, lineIndexOf(prefix), [prefix.length, prefix.length + 1], 'source contains an unpaired surrogate');
    }
    const stripped = text.startsWith('﻿') ? text.slice(1) : text;
    return new Source(name, utf8Encoder.encode(stripped));
  }

  // Returns the byte offset of a string index.
  byteAt(index: number): number {
    return elementAt(this.byteOffset, index);
  }

  // Returns the byte span of a range of string indexes.
  span(start: number, end: number): [number, number] {
    if (start > end) throw new RangeError("source range is reversed");
    return [this.byteAt(start), this.byteAt(end)];
  }
  /** Number of native UTF-16 indexes, excluding the end position (LEX-24). */
  get length(): number { return this.text.length; }

  /** Builds byte offsets of line starts. */
  static lineIndex(bytes: Uint8Array): LineIndex { return lineIndexOf(bytes); }

  /** Maps a byte offset to a one-based line and byte column. */
  static position(lines: LineIndex, offset: number): [number, number] {
    const { line, col } = positionOf(lines, offset);
    return [line, col];
  }

  /** Creates a template error at a supplied byte span, including an EOF span. */
  error(code: ErrorCode, start: number, end: number, message: string) {
    return errorAt(code, this.name, this.lines, [start, end], message);
  }

}
