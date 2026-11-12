// JSON text parser that preserves document order and applies VAL-2, VAL-12 and VAL-20.
import { firstInvalidUtf8, utf8Decoder } from '../escape.js';
import { BindError, checkLevel, checkNumber, checkText } from './bind.js';
import { type MapValue, type Value } from './value.js';

// Parses JSON bytes. Invalid UTF-8 is reported as a BindError with code E_DATA_INVALID_UTF8.
export function parseJsonBytes(bytes: Uint8Array): Value {
  const invalid = firstInvalidUtf8(bytes);
  if (invalid >= 0) throw new BindError('E_DATA_INVALID_UTF8', `invalid UTF-8 at byte ${invalid}`);
  return parseJson(utf8Decoder.decode(bytes));
}

// Parses JSON text into a value. Object keys keep their document order. A number outside the
// binding range, an unpaired surrogate, nesting deeper than the limit and text that is not one JSON
// document raise a BindError at the first occurrence in document order (VAL-2, VAL-12, VAL-20).
export function parseJson(text: string): Value {
  checkText(text);
  const parser = new JsonParser(text);
  const value = parser.parseValue();
  parser.skipWhitespace();
  if (parser.index < text.length) parser.fail('unexpected character after the JSON value');
  return value;
}

class JsonParser {
  index = 0;
  private level = 0;

  constructor(private readonly text: string) {}

  // VAL-12: text that is not one JSON document is E_DATA_INVALID_JSON.
  fail(message: string): never {
    throw new BindError('E_DATA_INVALID_JSON', `${message} at offset ${this.index}`);
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
    checkLevel(++this.level);
    const map: MapValue = new Map();
    this.index++;
    this.skipWhitespace();
    if (this.text[this.index] === '}') {
      this.index++;
      this.level--;
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
        this.level--;
        return map;
      }
      this.fail('expected "," or "}"');
    }
  }

  private parseArray(): Value[] {
    checkLevel(++this.level);
    const list: Value[] = [];
    this.index++;
    this.skipWhitespace();
    if (this.text[this.index] === ']') {
      this.index++;
      this.level--;
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
        this.level--;
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
        return checkText(result);
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
    // The nearest double decides, whatever the spelling of the literal (VAL-2).
    return checkNumber(Number(literal));
  }
}
