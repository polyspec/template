// Shared runtime value, function and error semantics for AST and generated programs.
import type { Span } from '../ast.js';
import { TemplateError } from '../errors.js';
import { escapeHtml } from '../escape.js';
import { builtins, FunctionError, toNumber, type FunctionContext } from '../functions/index.js';
import { BindError, bind } from '../value/bind.js';
import { stringify as stringifyValue, StringifyError } from '../value/stringify.js';
import {
  NativeObject, SafeString, compareValues, isString, isTruthy, looseEquals, strictEquals, textOf, typeOf,
  type Value,
} from '../value/value.js';
import type { Frame, RenderContext } from './context.js';

export type RuntimeLimit = 'expression' | 'iteration';

/** One implementation of the observable value semantics used by both compiler modes. */
export class RuntimeBindings {
  /** Binds observable value semantics to one render context. */
  constructor(private readonly context: RenderContext) {}

  /** Applies template truthiness. */
  truthy(value: Value): boolean {
    return isTruthy(value);
  }

  /** Applies an eager unary operator at its source span. */
  unary(operator: string, operand: Value, frame: Frame, span: Span): Value {
    if (operator === '!') return !this.truthy(operand);
    if (operator === '-') return this.finite(-this.number(operand, frame, span), frame, span);
    throw this.error(frame, span, 'E_RUNTIME_TYPE', `unknown operator ${operator}`);
  }

  /** Applies an eager binary operator at its source span. */
  binary(operator: string, left: Value, right: Value, frame: Frame, span: Span): Value {
    switch (operator) {
      case '+':
        if (Array.isArray(left) || left instanceof Map || Array.isArray(right) || right instanceof Map) {
          throw this.error(frame, span, 'E_RUNTIME_STRINGIFY', 'a list or map cannot be converted to text');
        }
        if (isString(left) || isString(right)) return this.stringify(left, frame, span) + this.stringify(right, frame, span);
        return this.finite(this.number(left, frame, span) + this.number(right, frame, span), frame, span);
      case '-': return this.finite(this.number(left, frame, span) - this.number(right, frame, span), frame, span);
      case '*': return this.finite(this.number(left, frame, span) * this.number(right, frame, span), frame, span);
      case '/': {
        const divisor = this.number(right, frame, span);
        if (divisor === 0) throw this.error(frame, span, 'E_RUNTIME_DIV_ZERO', 'division by zero');
        return this.finite(this.number(left, frame, span) / divisor, frame, span);
      }
      case '%': {
        const dividend = this.number(left, frame, span);
        const divisor = this.number(right, frame, span);
        if (!Number.isInteger(dividend) || !Number.isInteger(divisor)) throw this.error(frame, span, 'E_RUNTIME_TYPE', '% requires integer operands');
        if (divisor === 0) throw this.error(frame, span, 'E_RUNTIME_DIV_ZERO', 'division by zero');
        return dividend % divisor;
      }
      case '==': return this.equal(left, right, false);
      case '!=': return !this.equal(left, right, false);
      case '===': return this.equal(left, right, true);
      case '!==': return !this.equal(left, right, true);
      case '<': case '>': case '<=': case '>=': {
        const order = this.compare(left, right, frame, span);
        return operator === '<' ? order < 0 : operator === '>' ? order > 0 : operator === '<=' ? order <= 0 : order >= 0;
      }
      case 'in':
        if (Array.isArray(right)) return right.some(item => this.equal(item, left, false));
        if (right instanceof Map) return right.has(this.stringify(left, frame, span));
        if (isString(right)) return textOf(right).includes(this.stringify(left, frame, span));
        throw this.error(frame, span, 'E_RUNTIME_TYPE', 'in requires a list, map or string on the right');
      default: throw this.error(frame, span, 'E_RUNTIME_TYPE', `unknown operator ${operator}`);
    }
  }

  /** Converts a template scalar to text and reports collection failures at the source span. */
  stringify(value: Value, frame: Frame, span: Span): string {
    try {
      return stringifyValue(value);
    } catch (error) {
      if (error instanceof StringifyError) throw this.error(frame, span, 'E_RUNTIME_STRINGIFY', error.message);
      throw error;
    }
  }

  /** Escapes an echo value while preserving explicitly safe text. */
  escape(value: Value, frame: Frame, span: Span): string {
    return value instanceof SafeString ? value.text : escapeHtml(this.stringify(value, frame, span));
  }

  /** Converts a template value to a number using the common numeric rules. */
  number(value: Value, frame: Frame, span: Span): number {
    try {
      return toNumber(value);
    } catch (error) {
      if (error instanceof FunctionError) throw this.error(frame, span, error.code, error.message);
      throw error;
    }
  }

  /** Rejects a non-finite arithmetic result. */
  finite(value: number, frame: Frame, span: Span): number {
    if (!Number.isFinite(value)) throw this.error(frame, span, 'E_RUNTIME_TYPE', 'arithmetic result is not finite');
    return value;
  }

  /** Applies loose or strict template equality. */
  equal(left: Value, right: Value, strict: boolean): boolean {
    return strict ? strictEquals(left, right) : looseEquals(left, right);
  }

  /** Orders two compatible template values or reports a positioned comparison error. */
  compare(left: Value, right: Value, frame: Frame, span: Span): number {
    const order = compareValues(left, right);
    if (order === null) throw this.error(frame, span, 'E_RUNTIME_COMPARE', `${typeOf(left)} and ${typeOf(right)} have no order`);
    return order;
  }

  /** Reads a fixed member from a template collection. */
  member(container: Value, key: string): Value {
    if (container instanceof NativeObject) {
      const target = container.target as Record<string, unknown>;
      if (!(key in target)) return null;
      return bind(target[key]);
    }
    return this.index(container, key);
  }

  /** Calls a public method on an assigned native object. */
  memberCall(container: Value, method: string, args: Value[], frame: Frame, span: Span): Value {
    if (!(container instanceof NativeObject)) throw this.error(frame, span, 'E_RUNTIME_UNKNOWN_FUNCTION', `${method} is not a function`);
    const target = container.target as Record<string, unknown>;
    const candidate = target[method];
    if (typeof candidate !== 'function') throw this.error(frame, span, 'E_RUNTIME_UNKNOWN_FUNCTION', `${method} is not a function`);
    try {
      return bind(Reflect.apply(candidate, container.target, args));
    } catch (error) {
      if (error instanceof TemplateError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw this.error(frame, span, 'E_RUNTIME_HOST_FUNCTION', `${method} failed: ${message}`);
    }
  }

  /** Calls a registered logical class function. */
  classCall(className: string, method: string, args: Value[], frame: Frame, span: Span): Value {
    const fn = this.context.services.classFunction(className, method);
    if (!fn) throw this.error(frame, span, 'E_RUNTIME_UNKNOWN_FUNCTION', `${className}::${method} is not a function`);
    try {
      return bind(fn(args, { env: this.context.env }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw this.error(frame, span, 'E_RUNTIME_HOST_FUNCTION', `${className}::${method} failed: ${message}`);
    }
  }

  /** Reads a dynamic list position or map key. */
  index(container: Value, key: Value): Value {
    if (container instanceof Map) {
      if (isString(key)) return container.get(textOf(key)) ?? null;
      if (typeof key === 'number' && Number.isInteger(key)) return container.get(String(key)) ?? null;
      return null;
    }
    if (Array.isArray(container)) {
      let position: number | null = null;
      if (typeof key === 'number' && Number.isInteger(key)) position = key;
      else if (isString(key) && /^(0|[1-9][0-9]*)$/.test(textOf(key))) position = Number(textOf(key));
      if (position === null || position < 0 || position >= container.length) return null;
      return container[position] as Value;
    }
    if (container instanceof NativeObject && isString(key)) return this.member(container, textOf(key));
    return null;
  }

  /** Converts a nullable list or map into ordered loop entries. */
  entries(value: Value, frame: Frame, span: Span): [Value, Value][] {
    if (value === null) return [];
    if (Array.isArray(value)) return value.map((item, index) => [index, item]);
    if (value instanceof Map) return [...value.entries()];
    throw this.error(frame, span, 'E_RUNTIME_TYPE', 'loop requires a list, a map or null');
  }

  /** Validates and expands one list spread operand. */
  listSpread(value: Value, frame: Frame, span: Span): Value[] {
    if (!Array.isArray(value)) throw this.error(frame, span, 'E_RUNTIME_TYPE', 'spread in a list requires a list');
    return value;
  }

  /** Validates and expands one map spread operand. */
  mapSpread(value: Value, frame: Frame, span: Span): Map<string, Value> {
    if (!(value instanceof Map)) throw this.error(frame, span, 'E_RUNTIME_TYPE', 'spread in a map requires a map');
    return value;
  }

  /** Calls a built-in or registered host function with shared arity and binding behavior. */
  call(name: string, args: Value[], frame: Frame, span: Span): Value {
    const functionContext: FunctionContext = { env: this.context.env };
    const builtin = builtins.get(name);
    if (builtin) {
      if (args.length < builtin.min || args.length > builtin.max) {
        const accepts = builtin.min === builtin.max ? builtin.min : `${builtin.min} to ${builtin.max}`;
        throw this.error(frame, span, 'E_RUNTIME_ARITY', `${name} accepts ${accepts} arguments, got ${args.length}`);
      }
      try {
        return builtin.call(args, functionContext);
      } catch (error) {
        if (error instanceof FunctionError) throw this.error(frame, span, error.code, error.message);
        throw error;
      }
    }
    const host = this.context.services.hostFunction(name);
    if (!host) throw this.error(frame, span, 'E_RUNTIME_UNKNOWN_FUNCTION', `${name} is not a function`);
    let result: unknown;
    try {
      result = host(args, functionContext);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw this.error(frame, span, 'E_RUNTIME_HOST_FUNCTION', `${name} failed: ${message}`);
    }
    try {
      return bind(result);
    } catch (error) {
      if (error instanceof BindError) throw this.error(frame, span, error.code, error.message);
      throw error;
    }
  }

  /** Enforces an expression-depth or loop-iteration limit. */
  limit(kind: RuntimeLimit, count: number, frame: Frame, span: Span): void {
    const limits = this.context.services.limits();
    const maximum = kind === 'expression' ? limits.expressionDepth : limits.iterations;
    if (count <= maximum) return;
    const message = kind === 'expression'
      ? `expression nesting exceeds ${maximum}`
      : `loop iterations exceed ${maximum}`;
    throw this.error(frame, span, 'E_RUNTIME_LIMIT', message);
  }

  /** Creates one positioned runtime error through the active render context. */
  error(frame: Frame, span: Span, code: TemplateError['code'], message: string): TemplateError {
    return this.context.fail(code, frame, span, message);
  }
}
