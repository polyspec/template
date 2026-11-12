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

export function argInteger(value: Value, name: string): number {
  return Math.trunc(argNumber(value, name));
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

