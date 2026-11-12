// keys, values, first, last, reverse, slice, sort, join, range, default (FUN-14, FUN-15, FUN-31 to FUN-36).
import { defined } from '../checked.js';
import { compareValues, codePoints, isString, isTruthy, textOf, type Value } from '../value/value.js';
import { argInteger, argList, argNumber, argString, stringifyArg, typeError, FunctionError, type BuiltIn } from './helpers.js';

const RANGE_LIMIT = 1_000_000;

function lookupPath(value: Value, path: string): Value {
  let current = value;
  for (const segment of path.split('.')) {
    if (current instanceof Map) current = current.get(segment) ?? null;
    else if (Array.isArray(current) && /^(0|[1-9][0-9]*)$/.test(segment)) current = current[Number(segment)] ?? null;
    else return null;
  }
  return current;
}

function sortList(list: Value[], key: string | null): Value[] {
  const keyed = list.map(item => ({ item, sortKey: key === null ? item : lookupPath(item, key) }));
  const allNumbers = keyed.every(entry => typeof entry.sortKey === 'number');
  const allStrings = keyed.every(entry => isString(entry.sortKey));
  if (!allNumbers && !allStrings) throw typeError('sort requires all numbers or all strings');
  return keyed
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => {
      // The checks above leave only numbers or only strings, which always have an order.
      const order = compareValues(a.sortKey, b.sortKey);
      if (order === null) throw new TypeError('sort keys have no order');
      return order !== 0 ? order : a.index - b.index;
    })
    .map(entry => entry.item);
}

// The part of `items` from the start position over the optional length (FUN-14).
function sliceItems<T>(items: T[], start: Value | undefined, length: Value | undefined): T[] {
  let from = argInteger(defined(start, 'the slice start'), 'slice');
  if (from < 0) from = Math.max(0, from + items.length);
  if (from >= items.length) return [];
  let count = length === undefined ? items.length - from : argInteger(length, 'slice');
  if (count < 0) count = 0;
  return items.slice(from, from + count);
}

export const collectionFunctions: Record<string, BuiltIn> = {
  keys: {
    min: 1,
    max: 1,
    call: ([m]) => {
      const value = defined(m, 'the keys argument');
      if (value instanceof Map) return [...value.keys()];
      if (Array.isArray(value)) return value.map((_, index) => index);
      throw typeError('keys requires a map or a list');
    },
  },
  values: {
    min: 1,
    max: 1,
    call: ([m]) => {
      const value = defined(m, 'the values argument');
      if (value instanceof Map) return [...value.values()];
      if (Array.isArray(value)) return value;
      throw typeError('values requires a map or a list');
    },
  },
  first: {
    min: 1,
    max: 1,
    call: ([v]) => {
      const value = defined(v, 'the first argument');
      if (Array.isArray(value)) return value[0] ?? null;
      if (isString(value)) return codePoints(textOf(value))[0] ?? null;
      throw typeError('first requires a list or a string');
    },
  },
  last: {
    min: 1,
    max: 1,
    call: ([v]) => {
      const value = defined(v, 'the last argument');
      if (Array.isArray(value)) return value.at(-1) ?? null;
      if (isString(value)) return codePoints(textOf(value)).at(-1) ?? null;
      throw typeError('last requires a list or a string');
    },
  },
  reverse: {
    min: 1,
    max: 1,
    call: ([v]) => {
      const value = defined(v, 'the reverse argument');
      if (Array.isArray(value)) return [...value].reverse();
      if (isString(value)) return codePoints(textOf(value)).reverse().join('');
      throw typeError('reverse requires a list or a string');
    },
  },
  slice: {
    min: 2,
    max: 3,
    call: ([v, start, length]) => {
      const value = defined(v, 'the slice argument');
      if (Array.isArray(value)) return sliceItems(value, start, length);
      if (isString(value)) return sliceItems(codePoints(textOf(value)), start, length).join('');
      throw typeError('slice requires a list or a string');
    },
  },
  sort: {
    min: 1,
    max: 2,
    call: ([list, key]) => sortList(argList(defined(list, 'the sort argument'), 'sort'), key === undefined ? null : argString(key, 'sort')),
  },
  join: {
    min: 1,
    max: 2,
    call: ([list, sep]) =>
      argList(defined(list, 'the join argument'), 'join').map(stringifyArg).join(sep === undefined ? ',' : argString(sep, 'join')),
  },
  range: {
    min: 2,
    max: 3,
    call: ([from, to, step]) => {
      const start = argNumber(defined(from, 'the range start'), 'range');
      const end = argNumber(defined(to, 'the range end'), 'range');
      const increment = step === undefined ? 1 : argNumber(step, 'range');
      if (increment === 0) throw typeError('range requires a non-zero step');
      const count = Math.floor((end - start) / increment) + 1;
      if (count > RANGE_LIMIT) throw new FunctionError('E_RUNTIME_LIMIT', `range would produce more than ${RANGE_LIMIT} elements`);
      const result: Value[] = [];
      for (let i = 0; i < count; i++) result.push(start + i * increment);
      return result;
    },
  },
  default: {
    min: 2,
    max: 2,
    call: ([v, d]) => {
      const value = defined(v, 'the default value');
      return isTruthy(value) ? value : defined(d, 'the default fallback');
    },
  },
};
