// Host binding of JavaScript values (VAL-13) and safe integer checks (VAL-2, VAL-3).
import { MAX_SAFE } from './number.js';
import { SafeString, type MapValue, type Value } from './value.js';

export type BindErrorCode = 'E_DATA_NUMBER_RANGE' | 'E_DATA_NUMBER_NOT_FINITE' | 'E_DATA_UNSUPPORTED_TYPE' | 'E_DATA_INVALID_UTF8';

// The error that host binding raises for a value that has no template value (VAL-11).
export class BindError extends Error {
  // Creates a binding error with the code that the errors document lists.
  constructor(readonly code: BindErrorCode, message: string) {
    super(message);
    this.name = 'BindError';
  }
}

// VAL-3, VAL-13: a JavaScript number is accepted when it is finite.
export function checkNumber(value: number): number {
  if (!Number.isFinite(value)) throw new BindError('E_DATA_NUMBER_NOT_FINITE', 'number is not finite');
  return value;
}

// Converts a JavaScript value into a template value.
export function bind(input: unknown): Value {
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
      return input;
    case 'object':
      break;
    default:
      throw new BindError('E_DATA_UNSUPPORTED_TYPE', `a ${typeof input} value has no binding`);
  }
  if (input instanceof SafeString) return input.text;
  if (Array.isArray(input)) return input.map(bind);
  if (input instanceof Map) {
    const map: MapValue = new Map();
    for (const [key, value] of input) {
      if (typeof key !== 'string') throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'map key is not a string');
      map.set(key, bind(value));
    }
    return map;
  }
  const prototype = Object.getPrototypeOf(input);
  if (prototype === Object.prototype || prototype === null) {
    const map: MapValue = new Map();
    for (const key of Object.keys(input as object)) map.set(key, bind((input as Record<string, unknown>)[key]));
    return map;
  }
  throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'object has no binding');
}

/** Binds a host value and requires the result to be a string-keyed template map. */
export function bindMap(input: unknown): MapValue {
  const value = bind(input);
  if (!(value instanceof Map)) throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'assign is not a map');
  return value;
}
