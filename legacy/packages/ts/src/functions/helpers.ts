// Argument helpers and the error type shared by the function groups.
import type { ErrorCode } from '../errors.js';
import { stringify, StringifyError } from '../value/stringify.js';
import { isString, parseNumericString, SafeString, textOf, typeOf, type Value } from '../value/value.js';

// The render environment: the fixed time zone offset and the time that `now` returns (FUN-39,
// FUN-42).
export interface Env {
  timezone: string;
  now: number;
}

// What a function receives besides its arguments.
export interface FunctionContext {
  env: Env;
}

export class FunctionError extends Error {
  constructor(readonly code: ErrorCode, message: string) {
    super(message);
    this.name = 'FunctionError';
  }
}

export interface BuiltIn {
  min: number;
  max: number;
  call(args: Value[], context: FunctionContext): Value;
}

export function typeError(message: string): FunctionError {
  return new FunctionError('E_RUNTIME_TYPE', message);
}

// Argument helpers shared by the function groups.
export function argString(value: Value, name: string): string {
  if (!isString(value)) throw typeError(`${name} requires a string, got ${typeOf(value)}`);
  return textOf(value);
}

export function argList(value: Value, name: string): Value[] {
  if (!Array.isArray(value)) throw typeError(`${name} requires a list, got ${typeOf(value)}`);
  return value;
}

// EXP-23 to_number.
export function toNumber(value: Value): number {
  if (value === null) return 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value;
  if (isString(value)) {
    const parsed = parseNumericString(textOf(value));
    if (parsed === null) throw typeError(`${JSON.stringify(textOf(value))} is not a number`);
    return parsed;
  }
  throw typeError(`a ${typeOf(value)} is not a number`);
}

export function argNumber(value: Value, _name: string): number {
  return toNumber(value);
}

/** FUN-50: an integer argument has no fractional part (runtime_type) and a magnitude of at most 2^53 − 1 (runtime_limit); it is never truncated. */
export function argInteger(value: Value, name: string): number {
  const number = argNumber(value, name);
  if (!Number.isInteger(number)) throw typeError(`${number} is not an integer`);
  if (Math.abs(number) > Number.MAX_SAFE_INTEGER) throw new FunctionError('E_RUNTIME_LIMIT', `${number} is outside the integer range of an argument`);
  return number;
}

/** FUN-50: a count is an integer argument that is not negative (runtime_type). */
export function argCount(value: Value, name: string): number {
  const count = argInteger(value, name);
  if (count < 0) throw typeError(`${count} is not a count`);
  return count;
}

export function stringifyArg(value: Value): string {
  try {
    return stringify(value);
  } catch (error) {
    if (error instanceof StringifyError) throw new FunctionError('E_RUNTIME_STRINGIFY', error.message);
    throw error;
  }
}

export function safe(text: string): SafeString {
  return new SafeString(text);
}

