// escape, raw, json, url, nl2br, str, type (FUN-10, FUN-11, FUN-18, FUN-19, FUN-26 to FUN-30).
import { defined } from '../checked.js';
import { escapeHtml } from '../escape.js';
import { numberToString } from '../value/number.js';
import { NativeObject, SafeString, typeOf, type Value } from '../value/value.js';
import { argString, safe, stringifyArg, typeError, type BuiltIn } from './helpers.js';

function jsonString(text: string): string {
  let result = '"';
  for (const char of text) {
    // A control character is one UTF-16 unit, so the first unit decides the test below.
    const code = char.charCodeAt(0);
    switch (char) {
      case '"': result += '\\"'; break;
      case '\\': result += '\\\\'; break;
      case '\n': result += '\\n'; break;
      case '\r': result += '\\r'; break;
      case '\t': result += '\\t'; break;
      case '\b': result += '\\b'; break;
      case '\f': result += '\\f'; break;
      case '<': result += '\\u003c'; break;
      case '>': result += '\\u003e'; break;
      case '&': result += '\\u0026'; break;
      case ' ': result += '\\u2028'; break;
      case ' ': result += '\\u2029'; break;
      default:
        if (code < 0x20) result += '\\u' + code.toString(16).padStart(4, '0');
        else result += char;
    }
  }
  return result + '"';
}

export function toJson(value: Value): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return numberToString(value);
  if (typeof value === 'string') return jsonString(value);
  if (value instanceof SafeString) return jsonString(value.text);
  // FUN-26: a native object is opaque (VAL-19) and has no JSON text.
  if (value instanceof NativeObject) throw typeError('json does not accept a native object');
  if (Array.isArray(value)) return '[' + value.map(toJson).join(',') + ']';
  const parts: string[] = [];
  for (const [key, entry] of value) parts.push(jsonString(key) + ':' + toJson(entry));
  return '{' + parts.join(',') + '}';
}

export function percentEncode(text: string): string {
  return encodeURIComponent(text).replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());
}

export const encodingFunctions: Record<string, BuiltIn> = {
  escape: { min: 1, max: 1, call: ([v]) => safe(escapeHtml(stringifyArg(defined(v, 'the argument of escape')))) },
  raw: { min: 1, max: 1, call: ([v]) => safe(stringifyArg(defined(v, 'the argument of raw'))) },
  json: { min: 1, max: 1, call: ([v]) => toJson(defined(v, 'the argument of json')) },
  url: { min: 1, max: 1, call: ([v]) => percentEncode(stringifyArg(defined(v, 'the argument of url'))) },
  nl2br: { min: 1, max: 1, call: ([v]) => argString(defined(v, 'the argument of nl2br'), 'nl2br').replace(/\r\n|\n/g, match => (match === '\n' ? '<br>\n' : '<br>\n')) },
  str: { min: 1, max: 1, call: ([v]) => stringifyArg(defined(v, 'the argument of str')) },
  type: { min: 1, max: 1, call: ([v]) => typeOf(defined(v, 'the argument of type')) },
};
