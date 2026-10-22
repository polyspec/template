// The types that the compiler IR gives `??` and `+` (EXP-24, EXP-31): `a ?? b` is optional only when b is, and `+` never gives null.
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Expr, Span } from '@polyspec/template';
import type { TypeManifest } from '../../packages/compiler/src/documents.mts';
import { lowerSourceGraph, type NodeOf, type SourceGraph } from '../../packages/compiler/src/ir.mts';

const span: Span = [0, 0];
const variable = (name: string): Expr => ({ type: 'Var', name, span });
const member = (name: string, key: string): Expr => ({ type: 'Member', object: variable(name), key, span });
const binary = (op: '??' | '+', left: Expr, right: Expr): Expr => ({ type: 'Binary', op, left, right, span });
const manifest: TypeManifest = { schema: 3, root: 'any', entry: 'main.tpl', fields: {}, records: {}, defines: {}, functions: {}, templates: {} };

/** The type of a local set to `expr` in a template of a dynamic root, where a variable and its members are optional any. */
function typeOf(expr: Expr): string {
  const graph: SourceGraph = {
    lines: new Map([['main.tpl', [0]]]),
    templates: new Map([['main.tpl', { type: 'Template', name: 'main.tpl', comments: [], body: [{ type: 'Set', name: 'local', expr, span }] }]]),
  };
  const set = lowerSourceGraph(graph, manifest).templates.get('main.tpl')?.body.find((node): node is NodeOf<'set'> => node.op === 'set');
  assert.ok(set, 'the template sets the local');
  return set.expr.valueType.source;
}

test('a ?? b is optional only when b is (EXP-31)', () => {
  assert.equal(typeOf(member('a', 'x')), 'any?');
  assert.equal(typeOf(binary('??', member('a', 'x'), member('b', 'y'))), 'any?');
  assert.equal(typeOf(binary('??', member('a', 'x'), binary('+', member('b', 'y'), { type: 'Literal', kind: 'string', value: '/x', span }))), 'any');
});

test('a + b never gives null (EXP-24)', () => {
  assert.equal(typeOf(binary('+', member('a', 'x'), member('b', 'y'))), 'any');
});
