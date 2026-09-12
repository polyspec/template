// Template source: UTF-8 validation, BOM removal and the mapping from string indexes to byte offsets (LEX-1, LEX-2, LEX-16).
import { errorAt, lineIndexOf, type LineIndex } from './errors.js';
import { firstInvalidUtf8, utf8Decoder, utf8Encoder } from './escape.js';

// One template source. It validates the UTF-8, removes a byte order mark and maps the string
// indexes that the lexer uses to the byte offsets that spans and error positions report
// (LEX-1, LEX-2, LEX-16).
export class Source {
  readonly text: string;
  readonly lines: LineIndex;
  // byteOffset[i] is the byte offset of the UTF-16 code unit i; byteOffset[text.length] is the byte length.
  private readonly byteOffset: Uint32Array;

  private constructor(readonly name: string, readonly bytes: Uint8Array) {
    this.text = utf8Decoder.decode(bytes);
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
    const invalid = firstInvalidUtf8(input);
    if (invalid >= 0) {
      throw errorAt('E_LEX_INVALID_UTF8', name, lineIndexOf(input), [invalid, invalid + 1], `invalid UTF-8 byte at offset ${invalid}`);
    }
    const bytes = input.length >= 3 && input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf ? input.subarray(3) : input;
    return new Source(name, bytes);
  }

  // Reads a source from a string, which is already valid UTF-8.
  static fromText(name: string, text: string): Source {
    const stripped = text.startsWith('﻿') ? text.slice(1) : text;
    return new Source(name, utf8Encoder.encode(stripped));
  }

  // Returns the byte offset of a string index.
  byteAt(index: number): number {
    return this.byteOffset[index] as number;
  }

  // Returns the byte span of a range of string indexes.
  span(start: number, end: number): [number, number] {
    return [this.byteAt(start), this.byteAt(end)];
  }
}
