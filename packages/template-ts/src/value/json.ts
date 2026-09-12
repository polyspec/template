// JSON text parser that preserves document order and applies the number rules of VAL-12.
import { firstInvalidUtf8, utf8Decoder } from '../escape.js';
import { BindError, checkNumber } from './bind.js';
import { MAX_SAFE } from './number.js';
import { type MapValue, type Value } from './value.js';

// The error that the JSON parser raises for text that is not JSON. It carries the byte offset of
// the character that ended the parse.
export class JsonSyntaxError extends Error {
  // Creates a syntax error at a byte offset of the JSON text.
  constructor(message: string, readonly offset: number) {
    super(message);
    this.name = 'JsonSyntaxError';
  }
}

// Parses JSON bytes. Invalid UTF-8 is reported as a BindError with code E_DATA_INVALID_UTF8.
export function parseJsonBytes(bytes: Uint8Array): Value {
  const invalid = firstInvalidUtf8(bytes);
  if (invalid >= 0) throw new BindError('E_DATA_INVALID_UTF8', `invalid UTF-8 at byte ${invalid}`);
  return parseJson(utf8Decoder.decode(bytes));
}

// Parses JSON text into a value. Object keys keep their document order and an integer literal
// outside the safe range raises a BindError (VAL-12).
export function parseJson(text: string): Value {
  const parser = new JsonParser(text);
  const value = parser.parseValue();
  parser.skipWhitespace();
  if (parser.index < text.length) parser.fail('unexpected character after the JSON value');
  return value;
}

class JsonParser {
  index = 0;

  constructor(private readonly text: string) {}

  fail(message: string): never {
    throw new JsonSyntaxError(`${message} at offset ${this.index}`, this.index);
  }

  skipWhitespace(): void {
    for (;;) {
      const code = this.text.charCodeAt(this.index);
      if (code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) this.index++;
      else return;
    }
  }

  parseValue(): Value {
    this.skipWhitespace();
    const char = this.text[this.index];
    switch (char) {
      case '{': return this.parseObject();
      case '[': return this.parseArray();
      case '"': return this.parseString();
      case 't': return this.parseWord('true', true);
      case 'f': return this.parseWord('false', false);
      case 'n': return this.parseWord('null', null);
      default:
        if (char === '-' || (char !== undefined && char >= '0' && char <= '9')) return this.parseNumber();
        return this.fail('unexpected character');
    }
  }

  private parseWord(word: string, value: Value): Value {
    if (this.text.startsWith(word, this.index)) {
      this.index += word.length;
      return value;
    }
    return this.fail(`expected ${word}`);
  }

  private parseObject(): MapValue {
    const map: MapValue = new Map();
    this.index++;
    this.skipWhitespace();
    if (this.text[this.index] === '}') {
      this.index++;
      return map;
    }
    for (;;) {
      this.skipWhitespace();
      if (this.text[this.index] !== '"') this.fail('expected a string key');
      const key = this.parseString();
      this.skipWhitespace();
      if (this.text[this.index] !== ':') this.fail('expected ":"');
      this.index++;
      const value = this.parseValue();
      map.set(key, value);
      this.skipWhitespace();
      const next = this.text[this.index];
      if (next === ',') {
        this.index++;
        continue;
      }
      if (next === '}') {
        this.index++;
        return map;
      }
      this.fail('expected "," or "}"');
    }
  }

  private parseArray(): Value[] {
    const list: Value[] = [];
    this.index++;
    this.skipWhitespace();
    if (this.text[this.index] === ']') {
      this.index++;
      return list;
    }
    for (;;) {
      list.push(this.parseValue());
      this.skipWhitespace();
      const next = this.text[this.index];
      if (next === ',') {
        this.index++;
        continue;
      }
      if (next === ']') {
        this.index++;
        return list;
      }
      this.fail('expected "," or "]"');
    }
  }

  private parseString(): string {
    this.index++;
    let result = '';
    let start = this.index;
    for (;;) {
      const char = this.text[this.index];
      if (char === undefined) this.fail('unterminated string');
      if (char === '"') {
        result += this.text.slice(start, this.index);
        this.index++;
        return result;
      }
      if (char === '\\') {
        result += this.text.slice(start, this.index);
        this.index++;
        const escape = this.text[this.index];
        switch (escape) {
          case '"': result += '"'; break;
          case '\\': result += '\\'; break;
          case '/': result += '/'; break;
          case 'b': result += '\b'; break;
          case 'f': result += '\f'; break;
          case 'n': result += '\n'; break;
          case 'r': result += '\r'; break;
          case 't': result += '\t'; break;
          case 'u': {
            const hex = this.text.slice(this.index + 1, this.index + 5);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail('invalid unicode escape');
            result += String.fromCharCode(parseInt(hex, 16));
            this.index += 4;
            break;
          }
          default:
            this.fail('invalid escape');
        }
        this.index++;
        start = this.index;
        continue;
      }
      if ((char.charCodeAt(0)) < 0x20) this.fail('control character in string');
      this.index++;
    }
  }

  private parseNumber(): number {
    const match = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(this.text.slice(this.index));
    if (!match) this.fail('invalid number');
    const literal = match[0];
    this.index += literal.length;
    const value = Number(literal);
    if (!Number.isFinite(value)) throw new BindError('E_DATA_NUMBER_NOT_FINITE', `number ${literal} is not finite`);
    const isIntegerLiteral = match[2] === undefined && match[3] === undefined;
    if (isIntegerLiteral && Math.abs(value) > MAX_SAFE) {
      throw new BindError('E_DATA_NUMBER_RANGE', `integer ${literal} is outside the safe range`);
    }
    return checkNumber(value);
  }
}
