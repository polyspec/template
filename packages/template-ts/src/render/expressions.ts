// Expression evaluation (docs/spec/expressions.md).
import type { Binary, Expr, Span } from '../ast.js';
import type { TemplateError } from '../errors.js';
import { FunctionError, toNumber, type FunctionContext } from '../functions/index.js';
import { BindError, bind } from '../value/bind.js';
import { stringify, StringifyError } from '../value/stringify.js';
import {
  compareValues, isString, isTruthy, looseEquals, strictEquals, textOf, typeOf, type MapValue, type Value,
} from '../value/value.js';
import type { Frame, RenderContext } from './context.js';

const EXPRESSION_DEPTH_LIMIT = 64;

export class Evaluator {
  private depth = 0;

  constructor(private readonly context: RenderContext) {}

  private fail(frame: Frame, span: Span, code: TemplateError['code'], message: string): TemplateError {
    return this.context.fail(code, frame, span, message);
  }

  evaluate(expr: Expr, frame: Frame): Value {
    this.depth++;
    if (this.depth > EXPRESSION_DEPTH_LIMIT) {
      throw this.fail(frame, expr.span, 'E_RUNTIME_LIMIT', `expression nesting exceeds ${EXPRESSION_DEPTH_LIMIT}`);
    }
    try {
      return this.evaluateNode(expr, frame);
    } finally {
      this.depth--;
    }
  }

  private evaluateNode(expr: Expr, frame: Frame): Value {
    switch (expr.type) {
      case 'Literal':
        return expr.value;
      case 'Var':
        return frame.lookup(expr.name);
      case 'LoopMeta': {
        const meta = frame.loopMeta(expr.loop);
        if (!meta) throw this.fail(frame, expr.span, 'E_RUNTIME_UNKNOWN_LOOP', `${expr.loop} is not an active loop variable`);
        switch (expr.field) {
          case 'index_': return meta.index;
          case 'key_': return meta.key;
          case 'value_': return meta.value;
          case 'first_': return meta.first;
          case 'last_': return meta.last;
          case 'size_': return meta.size;
        }
        return null;
      }
      case 'Member':
        return lookup(this.evaluate(expr.object, frame), expr.key);
      case 'Index':
        return lookup(this.evaluate(expr.object, frame), this.evaluate(expr.index, frame));
      case 'Call':
        return this.call(expr.name, expr.args.map(arg => this.evaluate(arg, frame)), frame, expr.span);
      case 'Unary': {
        const operand = this.evaluate(expr.operand, frame);
        if (expr.op === '!') return !isTruthy(operand);
        return this.finite(-this.number(operand, frame, expr.span), frame, expr.span);
      }
      case 'Binary':
        return this.binary(expr, frame);
      case 'Ternary': {
        const test = this.evaluate(expr.test, frame);
        if (expr.then === null) return isTruthy(test) ? test : this.evaluate(expr.else, frame);
        return isTruthy(test) ? this.evaluate(expr.then, frame) : this.evaluate(expr.else, frame);
      }
      case 'List': {
        const list: Value[] = [];
        for (const item of expr.items) {
          if (item.type === 'Spread') {
            const spread = this.evaluate(item.expr, frame);
            if (!Array.isArray(spread)) throw this.fail(frame, item.span, 'E_RUNTIME_TYPE', 'spread in a list requires a list');
            list.push(...spread);
          } else {
            list.push(this.evaluate(item, frame));
          }
        }
        return list;
      }
      case 'Map': {
        const map: MapValue = new Map();
        for (const entry of expr.entries) {
          if ('type' in entry) {
            const spread = this.evaluate(entry.expr, frame);
            if (!(spread instanceof Map)) throw this.fail(frame, entry.span, 'E_RUNTIME_TYPE', 'spread in a map requires a map');
            for (const [key, value] of spread) map.set(key, value);
          } else {
            const key = this.stringify(this.evaluate(entry.key, frame), frame, entry.key.span);
            map.set(key, this.evaluate(entry.value, frame));
          }
        }
        return map;
      }
    }
  }

  private binary(expr: Binary, frame: Frame): Value {
    switch (expr.op) {
      case '&&': {
        const left = this.evaluate(expr.left, frame);
        return isTruthy(left) ? isTruthy(this.evaluate(expr.right, frame)) : false;
      }
      case '||': {
        const left = this.evaluate(expr.left, frame);
        return isTruthy(left) ? true : isTruthy(this.evaluate(expr.right, frame));
      }
      case '??': {
        const left = this.evaluate(expr.left, frame);
        return left !== null ? left : this.evaluate(expr.right, frame);
      }
      default:
        break;
    }
    const left = this.evaluate(expr.left, frame);
    const right = this.evaluate(expr.right, frame);
    const span = expr.span;
    switch (expr.op) {
      case '+':
        if (isCollection(left) || isCollection(right)) throw this.fail(frame, span, 'E_RUNTIME_STRINGIFY', 'a list or map cannot be converted to text');
        if (isString(left) || isString(right)) return this.stringify(left, frame, span) + this.stringify(right, frame, span);
        return this.finite(this.number(left, frame, span) + this.number(right, frame, span), frame, span);
      case '-':
        return this.finite(this.number(left, frame, span) - this.number(right, frame, span), frame, span);
      case '*':
        return this.finite(this.number(left, frame, span) * this.number(right, frame, span), frame, span);
      case '/': {
        const divisor = this.number(right, frame, span);
        if (divisor === 0) throw this.fail(frame, span, 'E_RUNTIME_DIV_ZERO', 'division by zero');
        return this.finite(this.number(left, frame, span) / divisor, frame, span);
      }
      case '%': {
        const dividend = this.number(left, frame, span);
        const divisor = this.number(right, frame, span);
        if (!Number.isInteger(dividend) || !Number.isInteger(divisor)) {
          throw this.fail(frame, span, 'E_RUNTIME_TYPE', '% requires integer operands');
        }
        if (divisor === 0) throw this.fail(frame, span, 'E_RUNTIME_DIV_ZERO', 'division by zero');
        return dividend % divisor;
      }
      case '==':
        return looseEquals(left, right);
      case '!=':
        return !looseEquals(left, right);
      case '===':
        return strictEquals(left, right);
      case '!==':
        return !strictEquals(left, right);
      case '<':
      case '>':
      case '<=':
      case '>=': {
        const order = compareValues(left, right);
        if (order === null) throw this.fail(frame, span, 'E_RUNTIME_COMPARE', `${typeOf(left)} and ${typeOf(right)} have no order`);
        return expr.op === '<' ? order < 0 : expr.op === '>' ? order > 0 : expr.op === '<=' ? order <= 0 : order >= 0;
      }
      case 'in': {
        if (Array.isArray(right)) return right.some(item => looseEquals(item, left));
        if (right instanceof Map) return right.has(this.stringify(left, frame, span));
        if (isString(right)) return textOf(right).includes(this.stringify(left, frame, span));
        throw this.fail(frame, span, 'E_RUNTIME_TYPE', 'in requires a list, map or string on the right');
      }
      default:
        throw this.fail(frame, span, 'E_RUNTIME_TYPE', `unknown operator ${expr.op}`);
    }
  }

  private number(value: Value, frame: Frame, span: Span): number {
    try {
      return toNumber(value);
    } catch (error) {
      if (error instanceof FunctionError) throw this.fail(frame, span, error.code, error.message);
      throw error;
    }
  }

  private finite(value: number, frame: Frame, span: Span): number {
    if (!Number.isFinite(value)) throw this.fail(frame, span, 'E_RUNTIME_TYPE', 'arithmetic result is not finite');
    return value;
  }

  stringify(value: Value, frame: Frame, span: Span): string {
    try {
      return stringify(value);
    } catch (error) {
      if (error instanceof StringifyError) throw this.fail(frame, span, 'E_RUNTIME_STRINGIFY', error.message);
      throw error;
    }
  }

  private call(name: string, args: Value[], frame: Frame, span: Span): Value {
    const functionContext: FunctionContext = { env: this.context.env };
    const builtin = this.context.services.builtins.get(name);
    if (builtin) {
      if (args.length < builtin.min || args.length > builtin.max) {
        throw this.fail(frame, span, 'E_RUNTIME_ARITY', `${name} accepts ${builtin.min === builtin.max ? builtin.min : `${builtin.min} to ${builtin.max}`} arguments, got ${args.length}`);
      }
      try {
        return builtin.call(args, functionContext);
      } catch (error) {
        if (error instanceof FunctionError) throw this.fail(frame, span, error.code, error.message);
        throw error;
      }
    }
    const host = this.context.services.functions.get(name);
    if (!host) throw this.fail(frame, span, 'E_RUNTIME_UNKNOWN_FUNCTION', `${name} is not a function`);
    let result: unknown;
    try {
      result = host(args, functionContext);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw this.fail(frame, span, 'E_RUNTIME_HOST_FUNCTION', `${name} failed: ${message}`);
    }
    try {
      return bind(result);
    } catch (error) {
      if (error instanceof BindError) throw this.fail(frame, span, error.code, error.message);
      throw error;
    }
  }
}

function isCollection(value: Value): boolean {
  return Array.isArray(value) || value instanceof Map;
}

// EXP-19 lookup.
export function lookup(container: Value, key: Value): Value {
  if (container instanceof Map) {
    if (isString(key)) return container.get(textOf(key)) ?? null;
    if (typeof key === 'number' && Number.isInteger(key)) return container.get(String(key)) ?? null;
    return null;
  }
  if (Array.isArray(container)) {
    let index: number | null = null;
    if (typeof key === 'number' && Number.isInteger(key)) index = key;
    else if (isString(key) && /^(0|[1-9][0-9]*)$/.test(textOf(key))) index = Number(textOf(key));
    if (index === null || index < 0 || index >= container.length) return null;
    return container[index] as Value;
  }
  return null;
}
