// upper, lower, trim, replace, split, truncate, contains, starts_with, ends_with (FUN-12, FUN-13).
import { codePointLength, codePoints, looseEquals, isString, textOf, type Value } from '../value/value.js';
import { argInteger, argString, typeError, type BuiltIn } from './helpers.js';

function asciiUpper(text: string): string {
  return text.replace(/[a-z]/g, char => String.fromCharCode(char.charCodeAt(0) - 32));
}

function asciiLower(text: string): string {
  return text.replace(/[A-Z]/g, char => String.fromCharCode(char.charCodeAt(0) + 32));
}

function trimChars(text: string, chars: string): string {
  const set = new Set(codePoints(chars));
  const points = codePoints(text);
  let start = 0;
  let end = points.length;
  while (start < end && set.has(points[start] as string)) start++;
  while (end > start && set.has(points[end - 1] as string)) end--;
  return points.slice(start, end).join('');
}

export const stringFunctions: Record<string, BuiltIn> = {
  upper: { min: 1, max: 1, call: ([s]) => asciiUpper(argString(s as Value, 'upper')) },
  lower: { min: 1, max: 1, call: ([s]) => asciiLower(argString(s as Value, 'lower')) },
  trim: {
    min: 1,
    max: 2,
    call: ([s, chars]) => trimChars(argString(s as Value, 'trim'), chars === undefined ? ' \t\r\n' : argString(chars, 'trim')),
  },
  replace: {
    min: 3,
    max: 3,
    call: ([s, from, to]) => {
      const text = argString(s as Value, 'replace');
      const search = argString(from as Value, 'replace');
      const replacement = argString(to as Value, 'replace');
      return search === '' ? text : text.split(search).join(replacement);
    },
  },
  split: {
    min: 2,
    max: 2,
    call: ([s, sep]) => {
      const text = argString(s as Value, 'split');
      const separator = argString(sep as Value, 'split');
      if (separator === '') throw typeError('split requires a non-empty separator');
      return text.split(separator);
    },
  },
  truncate: {
    min: 2,
    max: 3,
    call: ([s, n, suffix]) => {
      const text = argString(s as Value, 'truncate');
      const limit = argInteger(n as Value, 'truncate');
      const tail = suffix === undefined ? '...' : argString(suffix, 'truncate');
      const points = codePoints(text);
      return points.length > limit ? points.slice(0, Math.max(0, limit)).join('') + tail : text;
    },
  },
  contains: {
    min: 2,
    max: 2,
    call: ([h, n]) => {
      const haystack = h as Value;
      const needle = n as Value;
      if (isString(haystack)) {
        if (!isString(needle)) throw typeError('contains requires a string needle for a string haystack');
        return textOf(haystack).includes(textOf(needle));
      }
      if (Array.isArray(haystack)) return haystack.some(item => looseEquals(item, needle));
      throw typeError('contains requires a string or a list');
    },
  },
  starts_with: { min: 2, max: 2, call: ([s, p]) => argString(s as Value, 'starts_with').startsWith(argString(p as Value, 'starts_with')) },
  ends_with: { min: 2, max: 2, call: ([s, p]) => argString(s as Value, 'ends_with').endsWith(argString(p as Value, 'ends_with')) },
  length: {
    min: 1,
    max: 1,
    call: ([v]) => {
      const value = v as Value;
      if (value === null) return 0;
      if (isString(value)) return codePointLength(textOf(value));
      if (Array.isArray(value)) return value.length;
      if (value instanceof Map) return value.size;
      throw typeError('length requires a string, list, map or null');
    },
  },
};
