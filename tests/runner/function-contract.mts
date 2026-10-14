#!/usr/bin/env node
import assert from 'node:assert/strict';
import type { Expr, Template } from '@polyspec/template';
import type { TypeManifest } from '../../packages/compiler/src/documents.mts';
import { lowerSourceGraph, type SourceGraph } from '../../packages/compiler/src/ir.mts';

function graph(name: string, call: { name: string; args: Expr[] }): SourceGraph {
  const ast: Template = { type: 'Template', name, body: [{ type: 'Echo', expr: { type: 'Call', name: call.name, args: call.args, span: [0, 1] }, span: [0, 1] }], comments: [] };
  return { templates: new Map([[name, ast]]), lines: new Map([[name, [0]]]) };
}

const base: TypeManifest = { schema: 3, root: 'any', entry: 'arity.tpl', fields: {}, records: {}, defines: {}, templates: { 'arity.tpl': {} }, functions: { now: { implementation: 'builtin', args: [], returns: 'number' }, min: { implementation: 'builtin', args: [], minArgs: 1, maxArgs: -1, returns: 'number' } } };
const literal = (value: number | string): Expr => ({ type: 'Literal', kind: typeof value === 'number' ? 'number' : 'string', value, span: [0, 1] });
assert.throws(() => lowerSourceGraph(graph('arity.tpl', { name: 'now', args: [literal(1)] }), base), /now expects 0 arguments/);
assert.throws(() => lowerSourceGraph(graph('arity.tpl', { name: 'min', args: [] }), base), /min expects 1-∞ arguments/);
assert.doesNotThrow(() => lowerSourceGraph(graph('arity.tpl', { name: 'min', args: [literal(1), literal(2), literal(3)] }), base));
process.stdout.write('function contract: zero and variadic arity are enforced at compile time\n');
