#!/usr/bin/env node
import { lowerSourceGraph } from '../tools/compiler/ir.mjs';

const span = [0, 0];
const literal = (kind, value) => ({ type: 'Literal', kind, value, span });
const variable = name => ({ type: 'Var', name, span });
const graph = {
  templates: new Map([
    ['main.tpl', { type: 'Template', name: 'main.tpl', body: [
      { type: 'Text', value: 'begin', span },
      { type: 'Set', name: 'local', expr: variable('fallback'), span },
      { type: 'Echo', expr: literal('string', 'literal'), span },
      { type: 'Echo', expr: variable('local'), span },
      { type: 'Echo', expr: { type: 'Member', object: variable('page'), key: 'title', span }, span },
      { type: 'Echo', expr: { type: 'Index', object: variable('lookup'), index: literal('string', 'x'), span }, span },
      { type: 'Echo', expr: { type: 'Call', name: 'default', args: [variable('page'), variable('fallback')], span }, span },
      { type: 'Echo', expr: { type: 'Unary', op: '!', operand: variable('flag'), span }, span },
      { type: 'Echo', expr: { type: 'Binary', op: '==', left: variable('fallback'), right: literal('string', 'x'), span }, span },
      { type: 'Echo', expr: { type: 'Ternary', test: variable('flag'), then: literal('string', 'yes'), else: literal('string', 'no'), span }, span },
      { type: 'Echo', expr: { type: 'List', items: [literal('number', 1), { type: 'Spread', expr: variable('numbers'), span }], span }, span },
      { type: 'Echo', expr: { type: 'Map', entries: [{ key: literal('string', 'x'), value: literal('string', 'y') }, { type: 'Spread', expr: variable('lookup'), span }], span }, span },
      { type: 'If', branches: [{ test: variable('flag'), body: [{ type: 'Text', value: 'true', span }], span }], else: [{ type: 'Text', value: 'false', span }], span },
      { type: 'For', name: 'row', iter: variable('rows'), body: [
        { type: 'Echo', expr: variable('row'), span },
        { type: 'Echo', expr: { type: 'LoopMeta', loop: 'row', field: 'index_', span }, span },
      ], empty: [{ type: 'Text', value: 'empty', span }], span },
      { type: 'Include', path: 'partial.tpl', span },
      { type: 'Block', id: 'content', path: 'card.tpl', scope: [{ name: 'label', expr: variable('fallback') }], span },
      { type: 'IfBlock', id: 'content', body: [{ type: 'Text', value: 'defined', span }], else: [{ type: 'Text', value: 'missing', span }], span },
    ] }],
    ['partial.tpl', { type: 'Template', name: 'partial.tpl', body: [{ type: 'Echo', expr: variable('fallback'), span }] }],
    ['card.tpl', { type: 'Template', name: 'card.tpl', body: [{ type: 'Text', value: 'card', span }] }],
  ]),
};
const manifest = {
  schema: 2,
  entry: 'main.tpl',
  fields: {
    flag: 'boolean', fallback: 'string', page: 'Page?', lookup: 'map<string,string>', numbers: 'list<number>', rows: 'list<Row>',
  },
  records: { Page: { title: 'string?' }, Row: { name: 'string' }, Slot: { template: 'string?', html: 'string?' } },
  defines: { content: 'Slot?' },
  functions: { default: { args: ['any', 'any'], returns: 'any' } },
};

const program = lowerSourceGraph(graph, manifest);
const nodeOps = new Set();
const exprOps = new Set();
function visitExpr(expr) {
  exprOps.add(expr.op);
  for (const value of Object.values(expr)) {
    if (value?.op) visitExpr(value);
    else if (Array.isArray(value)) for (const item of value) {
      if (item?.op) visitExpr(item);
      if (item?.value?.op) visitExpr(item.value);
      if (item?.key?.op) visitExpr(item.key);
    }
  }
}
function visitNodes(nodes) {
  for (const node of nodes) {
    nodeOps.add(node.op);
    if (node.expr) visitExpr(node.expr);
    if (node.iter) visitExpr(node.iter);
    for (const item of node.scope ?? []) visitExpr(item.expr);
    for (const branch of node.branches ?? []) { visitExpr(branch.test); visitNodes(branch.body); }
    if (node.body) visitNodes(node.body);
    if (node.empty) visitNodes(node.empty);
    if (node.otherwise) visitNodes(node.otherwise);
  }
}
for (const template of program.templates.values()) visitNodes(template.body);
const expectedNodes = ['text', 'echo', 'set', 'if', 'for', 'include', 'block', 'if-block'];
const expectedExprs = ['literal', 'root', 'local', 'loop-meta', 'member', 'index', 'call', 'unary', 'binary', 'ternary', 'list', 'map'];
for (const op of expectedNodes) if (!nodeOps.has(op)) throw new Error(`compiler IR did not lower node ${op}`);
for (const op of expectedExprs) if (!exprOps.has(op)) throw new Error(`compiler IR did not lower expression ${op}`);

const invalid = structuredClone(graph);
invalid.templates.get('partial.tpl').body[0].expr.name = 'undeclared';
try {
  lowerSourceGraph(invalid, manifest);
  throw new Error('compiler IR accepted an undeclared variable');
} catch (error) {
  if (!String(error).includes('undeclared')) throw error;
}

process.stdout.write('compiler IR: all node and expression variants lowered; invalid symbols rejected\n');
