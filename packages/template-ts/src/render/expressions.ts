// Expression evaluation (docs/spec/expressions.md).
import type { Binary, Expr } from '../ast.js';
import {
  isString, textOf, type MapValue, type Value,
} from '../value/value.js';
import { Scope, type Frame, type RenderContext } from './context.js';
import { RuntimeBindings } from './runtime-bindings.js';

export class Evaluator {
  private depth = 0;
  private scope = new Scope();

  constructor(context: RenderContext, readonly runtime = new RuntimeBindings(context)) {}

  evaluate(expr: Expr, frame: Frame, scope?: Scope): Value {
    if (scope) this.scope = scope;
    this.depth++;
    this.runtime.limit('expression', this.depth, frame, expr.span);
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
        return this.scope.lookup(frame, expr.name);
      case 'LoopMeta': {
        const meta = this.scope.loopMeta(expr.loop);
        if (!meta) throw this.runtime.error(frame, expr.span, 'E_RUNTIME_UNKNOWN_LOOP', `${expr.loop} is not an active loop variable`);
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
        return this.runtime.member(this.evaluate(expr.object, frame), expr.key);
      case 'Index':
        return this.runtime.index(this.evaluate(expr.object, frame), this.evaluate(expr.index, frame));
      case 'Call':
        return this.runtime.call(expr.name, expr.args.map(arg => this.evaluate(arg, frame)), frame, expr.span);
      case 'Unary': {
        const operand = this.evaluate(expr.operand, frame);
        if (expr.op === '!') return !this.runtime.truthy(operand);
        return this.runtime.finite(-this.runtime.number(operand, frame, expr.span), frame, expr.span);
      }
      case 'Binary':
        return this.binary(expr, frame);
      case 'Ternary': {
        const test = this.evaluate(expr.test, frame);
        if (expr.then === null) return this.runtime.truthy(test) ? test : this.evaluate(expr.else, frame);
        return this.runtime.truthy(test) ? this.evaluate(expr.then, frame) : this.evaluate(expr.else, frame);
      }
      case 'List': {
        const list: Value[] = [];
        for (const item of expr.items) {
          if (item.type === 'Spread') {
            const spread = this.evaluate(item.expr, frame);
            if (!Array.isArray(spread)) throw this.runtime.error(frame, item.span, 'E_RUNTIME_TYPE', 'spread in a list requires a list');
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
            if (!(spread instanceof Map)) throw this.runtime.error(frame, entry.span, 'E_RUNTIME_TYPE', 'spread in a map requires a map');
            for (const [key, value] of spread) map.set(key, value);
          } else {
            const key = this.runtime.stringify(this.evaluate(entry.key, frame), frame, entry.key.span);
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
        return this.runtime.truthy(left) ? this.runtime.truthy(this.evaluate(expr.right, frame)) : false;
      }
      case '||': {
        const left = this.evaluate(expr.left, frame);
        return this.runtime.truthy(left) ? true : this.runtime.truthy(this.evaluate(expr.right, frame));
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
        if (isCollection(left) || isCollection(right)) throw this.runtime.error(frame, span, 'E_RUNTIME_STRINGIFY', 'a list or map cannot be converted to text');
        if (isString(left) || isString(right)) return this.runtime.stringify(left, frame, span) + this.runtime.stringify(right, frame, span);
        return this.runtime.finite(this.runtime.number(left, frame, span) + this.runtime.number(right, frame, span), frame, span);
      case '-':
        return this.runtime.finite(this.runtime.number(left, frame, span) - this.runtime.number(right, frame, span), frame, span);
      case '*':
        return this.runtime.finite(this.runtime.number(left, frame, span) * this.runtime.number(right, frame, span), frame, span);
      case '/': {
        const divisor = this.runtime.number(right, frame, span);
        if (divisor === 0) throw this.runtime.error(frame, span, 'E_RUNTIME_DIV_ZERO', 'division by zero');
        return this.runtime.finite(this.runtime.number(left, frame, span) / divisor, frame, span);
      }
      case '%': {
        const dividend = this.runtime.number(left, frame, span);
        const divisor = this.runtime.number(right, frame, span);
        if (!Number.isInteger(dividend) || !Number.isInteger(divisor)) {
          throw this.runtime.error(frame, span, 'E_RUNTIME_TYPE', '% requires integer operands');
        }
        if (divisor === 0) throw this.runtime.error(frame, span, 'E_RUNTIME_DIV_ZERO', 'division by zero');
        return dividend % divisor;
      }
      case '==':
        return this.runtime.equal(left, right, false);
      case '!=':
        return !this.runtime.equal(left, right, false);
      case '===':
        return this.runtime.equal(left, right, true);
      case '!==':
        return !this.runtime.equal(left, right, true);
      case '<':
      case '>':
      case '<=':
      case '>=': {
        const order = this.runtime.compare(left, right, frame, span);
        return expr.op === '<' ? order < 0 : expr.op === '>' ? order > 0 : expr.op === '<=' ? order <= 0 : order >= 0;
      }
      case 'in': {
        if (Array.isArray(right)) return right.some(item => this.runtime.equal(item, left, false));
        if (right instanceof Map) return right.has(this.runtime.stringify(left, frame, span));
        if (isString(right)) return textOf(right).includes(this.runtime.stringify(left, frame, span));
        throw this.runtime.error(frame, span, 'E_RUNTIME_TYPE', 'in requires a list, map or string on the right');
      }
      default:
        throw this.runtime.error(frame, span, 'E_RUNTIME_TYPE', `unknown operator ${expr.op}`);
    }
  }

}

function isCollection(value: Value): boolean {
  return Array.isArray(value) || value instanceof Map;
}
