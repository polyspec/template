// Host binding of JavaScript values (VAL-13), the number rule (VAL-2, VAL-3) and the depth limit (VAL-20).
import { MAX_SAFE } from './number.js';
import { NativeObject, SafeString, type MapValue, type Value } from './value.js';

export type BindErrorCode = 'E_DATA_NUMBER_RANGE' | 'E_DATA_NUMBER_NOT_FINITE' | 'E_DATA_UNSUPPORTED_TYPE' | 'E_DATA_INVALID_UTF8' | 'E_DATA_DEPTH';

/** The nesting depth limit of lists and maps (VAL-20). */
export const MAX_DEPTH = 64;

// The error that host binding raises for a value that has no template value (VAL-11).
export class BindError extends Error {
  // Creates a binding error with the code that the errors document lists.
  constructor(readonly code: BindErrorCode, message: string) {
    super(message);
    this.name = 'BindError';
  }
}

// VAL-2, VAL-3: a number is accepted when it is finite and its magnitude is at most 2^53 - 1.
export function checkNumber(value: number): number {
  if (!Number.isFinite(value)) throw new BindError('E_DATA_NUMBER_NOT_FINITE', 'number is not finite');
  if (Math.abs(value) > MAX_SAFE) throw new BindError('E_DATA_NUMBER_RANGE', `number ${value} is outside the safe range`);
  return value;
}

// VAL-13, VAL-17: a string or a map key must be well-formed UTF-16, so that it has a UTF-8 form.
export function checkText(text: string): string {
  for (let index = 0; index < text.length; index++) {
    const unit = text.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        index++;
        continue;
      }
      throw new BindError('E_DATA_INVALID_UTF8', 'string contains an unpaired surrogate');
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) throw new BindError('E_DATA_INVALID_UTF8', 'string contains an unpaired surrogate');
  }
  return text;
}

// VAL-20: fails when a list or map would be entered at a level greater than the limit; `level`
// counts the enclosing lists and maps, including the one being entered.
export function checkLevel(level: number): void {
  if (level > MAX_DEPTH) throw new BindError('E_DATA_DEPTH', `lists and maps nest deeper than ${MAX_DEPTH} levels`);
}

// Converts a JavaScript value into a template value.
export function bind(input: unknown): Value {
  return bindAt(input, 0);
}

function bindAt(input: unknown, level: number): Value {
  if (input === null || input === undefined) return null;
  switch (typeof input) {
    case 'boolean':
      return input;
    case 'number':
      return checkNumber(input);
    case 'bigint': {
      if (input > BigInt(MAX_SAFE) || input < -BigInt(MAX_SAFE)) {
        throw new BindError('E_DATA_NUMBER_RANGE', `integer ${input} is outside the safe range`);
      }
      return Number(input);
    }
    case 'string':
      return checkText(input);
    case 'object':
      break;
    default:
      throw new BindError('E_DATA_UNSUPPORTED_TYPE', `a ${typeof input} value has no binding`);
  }
  if (input instanceof SafeString) return checkText(input.text);
  if (input instanceof NativeObject) return input;
  if (input instanceof Date) throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'a Date value has no binding');
  if (Array.isArray(input)) {
    checkLevel(level + 1);
    return input.map(item => bindAt(item, level + 1));
  }
  if (input instanceof Map) {
    checkLevel(level + 1);
    const map: MapValue = new Map();
    for (const [key, value] of input) {
      if (typeof key !== 'string') throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'map key is not a string');
      map.set(checkText(key), bindAt(value, level + 1));
    }
    return map;
  }
  const prototype = Object.getPrototypeOf(input);
  if (prototype === Object.prototype || prototype === null) {
    checkLevel(level + 1);
    const map: MapValue = new Map();
    for (const key of Object.keys(input as object)) map.set(checkText(key), bindAt((input as Record<string, unknown>)[key], level + 1));
    return map;
  }
  return new NativeObject(input);
}

/** Binds a host value and requires the result to be a string-keyed template map. */
export function bindMap(input: unknown): MapValue {
  const value = bind(input);
  if (!(value instanceof Map)) throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'assign is not a map');
  return value;
}

/** VAL-20: whether the depth of a template value is at most `limit`; the walk stops below the limit. */
export function depthWithin(value: Value, limit: number): boolean {
  if (Array.isArray(value)) return limit > 0 && value.every(item => depthWithin(item, limit - 1));
  if (value instanceof Map) {
    if (limit === 0) return false;
    for (const item of value.values()) if (!depthWithin(item, limit - 1)) return false;
    return true;
  }
  return true;
}

/**
 * VAL-18: converts template values passed to host code into host values. A native object becomes
 * the original instance, also inside a list or map; other values keep their template form.
 */
export function hostArgument(value: Value): unknown {
  if (value instanceof NativeObject) return value.target;
  if (Array.isArray(value)) return value.some(containsObject) ? value.map(hostArgument) : value;
  if (value instanceof Map) {
    if (![...value.values()].some(containsObject)) return value;
    return new Map([...value].map(([key, item]) => [key, hostArgument(item)]));
  }
  return value;
}

function containsObject(value: Value): boolean {
  if (value instanceof NativeObject) return true;
  if (Array.isArray(value)) return value.some(containsObject);
  if (value instanceof Map) return [...value.values()].some(containsObject);
  return false;
}
