// Value types, safe strings, truthiness, equality and ordering as defined in
// docs/spec/data-model.md and docs/spec/expressions.md.

// A string that the echo tag writes without HTML escaping (VAL-6). The functions `raw` and
// `escape` produce one.
export class SafeString {
  // Wraps text that the echo tag writes as it is.
  constructor(readonly text: string) {}
}

/** A native assigned object whose public members and methods are visible to templates. */
export class NativeObject {
  constructor(readonly target: object) {}
}

// An ordered sequence of values (VAL-1).
export type ListValue = Value[];
// An ordered sequence of entries with string keys. Iteration follows insertion order (VAL-4).
export type MapValue = Map<string, Value>;
// A value that a template operates on (VAL-1).
export type Value = null | boolean | number | string | SafeString | ListValue | MapValue | NativeObject;

export type ValueType = 'null' | 'bool' | 'number' | 'string' | 'list' | 'map' | 'object';

export function typeOf(value: Value): ValueType {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string' || value instanceof SafeString) return 'string';
  if (Array.isArray(value)) return 'list';
  if (value instanceof NativeObject) return 'object';
  return 'map';
}

export function isString(value: Value): value is string | SafeString {
  return typeof value === 'string' || value instanceof SafeString;
}

export function textOf(value: string | SafeString): string {
  return typeof value === 'string' ? value : value.text;
}

// Number of Unicode code points of a string.
export function codePointLength(text: string): number {
  let count = 0;
  const iterator = text[Symbol.iterator]();
  while (!iterator.next().done) count++;
  return count;
}

export function codePoints(text: string): string[] {
  return Array.from(text);
}

// Compares two strings by code point sequence; returns a negative, zero or positive number.
export function compareCodePoints(a: string, b: string): number {
  const ia = a[Symbol.iterator]();
  const ib = b[Symbol.iterator]();
  for (;;) {
    const ra = ia.next();
    const rb = ib.next();
    if (ra.done && rb.done) return 0;
    if (ra.done) return -1;
    if (rb.done) return 1;
    const ca = (ra.value as string).codePointAt(0) as number;
    const cb = (rb.value as string).codePointAt(0) as number;
    if (ca !== cb) return ca < cb ? -1 : 1;
  }
}

// EXP-33: falsy values.
export function isTruthy(value: Value): boolean {
  if (value === null || value === false) return false;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.length > 0;
  if (value instanceof SafeString) return value.text.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'boolean') return value;
  if (value instanceof NativeObject) return true;
  return value instanceof Map ? value.size > 0 : true;
}

const numberGrammar = /^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$/;

function trimAscii(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && isAsciiSpace(text.charCodeAt(start))) start++;
  while (end > start && isAsciiSpace(text.charCodeAt(end - 1))) end--;
  return text.slice(start, end);
}

function isAsciiSpace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0d || code === 0x0a;
}

// Returns the numeric value of a string under the conversion grammar of EXP-23, or null.
export function parseNumericString(text: string): number | null {
  const trimmed = trimAscii(text);
  if (!numberGrammar.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

// EXP-34 and EXP-35.
export function looseEquals(a: Value, b: Value): boolean {
  const ta = typeOf(a);
  const tb = typeOf(b);
  if (ta === tb) return sameTypeEquals(a, b, ta);
  if (ta === 'number' && tb === 'string') {
    const n = parseNumericString(textOf(b as string | SafeString));
    return n !== null && n === (a as number);
  }
  if (ta === 'string' && tb === 'number') {
    const n = parseNumericString(textOf(a as string | SafeString));
    return n !== null && n === (b as number);
  }
  return false;
}

// EXP-37.
export function strictEquals(a: Value, b: Value): boolean {
  const ta = typeOf(a);
  return ta === typeOf(b) && sameTypeEquals(a, b, ta);
}

function sameTypeEquals(a: Value, b: Value, type: ValueType): boolean {
  switch (type) {
    case 'null':
      return true;
    case 'bool':
    case 'number':
      return a === b;
    case 'string':
      return textOf(a as string | SafeString) === textOf(b as string | SafeString);
    case 'list': {
      const la = a as ListValue;
      const lb = b as ListValue;
      return la.length === lb.length && la.every((item, index) => looseEquals(item, lb[index] as Value));
    }
    case 'map': {
      const ma = a as MapValue;
      const mb = b as MapValue;
      if (ma.size !== mb.size) return false;
      for (const [key, value] of ma) {
        if (!mb.has(key) || !looseEquals(value, mb.get(key) as Value)) return false;
      }
      return true;
    }
    case 'object':
      return a === b;
  }
}

// EXP-38: returns a negative, zero or positive number, or null when the pair has no order.
export function compareValues(a: Value, b: Value): number | null {
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
  if (isString(a) && isString(b)) return compareCodePoints(textOf(a), textOf(b));
  return null;
}
