#!/usr/bin/env node
import assert from 'node:assert/strict';
import { lowerSourceGraph } from '../../tools/compiler/ir.mjs';

function graph(name, call) {
  const ast = { type: 'Template', name, body: [{ type: 'Echo', expr: { type: 'Call', name: call.name, args: call.args, span: [0, 1] }, span: [0, 1] }] };
  return { templates: new Map([[name, ast]]), lines: new Map([[name, [0]]]) };
}

const base = { schema: 3, root: 'any', entry: 'arity.tpl', fields: {}, records: {}, defines: {}, templates: { 'arity.tpl': {} }, functions: { now: { implementation: 'builtin', args: [], returns: 'number' }, min: { implementation: 'builtin', args: [], minArgs: 1, maxArgs: -1, returns: 'number' } } };
const literal = value => ({ type: 'Literal', kind: typeof value === 'number' ? 'number' : 'string', value, span: [0, 1] });
assert.throws(() => lowerSourceGraph(graph('arity.tpl', { name: 'now', args: [literal(1)] }), base), /now expects 0 arguments/);
assert.throws(() => lowerSourceGraph(graph('arity.tpl', { name: 'min', args: [] }), base), /min expects 1-∞ arguments/);
assert.doesNotThrow(() => lowerSourceGraph(graph('arity.tpl', { name: 'min', args: [literal(1), literal(2), literal(3)] }), base));
process.stdout.write('function contract: zero and variadic arity are enforced at compile time\n');
