// Expression evaluation (docs/spec/expressions.md).
import type { Binary, Expr } from '../ast.js';
import { type MapValue, type Value } from '../value/value.js';
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
      case 'MemberCall':
      case 'ClassCall':
        throw this.runtime.error(frame, expr.span, 'E_RUNTIME_UNKNOWN_FUNCTION', 'object and class function calls are not implemented');
      case 'Index':
        return this.runtime.index(this.evaluate(expr.object, frame), this.evaluate(expr.index, frame));
      case 'Call':
        return this.runtime.call(expr.name, expr.args.map(arg => this.evaluate(arg, frame)), frame, expr.span);
      case 'Unary': {
        const operand = this.evaluate(expr.operand, frame);
        return this.runtime.unary(expr.op, operand, frame, expr.span);
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
            list.push(...this.runtime.listSpread(this.evaluate(item.expr, frame), frame, item.span));
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
            for (const [key, value] of this.runtime.mapSpread(this.evaluate(entry.expr, frame), frame, entry.span)) map.set(key, value);
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
    return this.runtime.binary(expr.op, left, right, frame, expr.span);
  }

}
