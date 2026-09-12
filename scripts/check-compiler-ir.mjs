#!/usr/bin/env node
import { lowerSourceGraph } from '../tools/compiler/ir.mjs';

const span = [0, 0];
const literal = (kind, value) => ({ type: 'Literal', kind, value, span });
const variable = name => ({ type: 'Var', name, span });
const graph = {
  lines: new Map([['main.tpl', [0]], ['partial.tpl', [0]], ['card.tpl', [0]]]),
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
    ['partial.tpl', { type: 'Template', name: 'partial.tpl', body: [{ type: 'Echo', expr: variable('local'), span }] }],
    ['card.tpl', { type: 'Template', name: 'card.tpl', body: [{ type: 'Text', value: 'card', span }] }],
  ]),
};
const manifest = {
  schema: 3,
  root: 'Assign',
  entry: 'main.tpl',
  fields: {
    flag: 'boolean', fallback: 'string', page: 'Page?', lookup: 'map<string,string>', numbers: 'list<number>', rows: 'list<Row>',
  },
  records: { Page: { title: 'string?' }, Row: { name: 'string' }, Slot: { template: 'string?', html: 'string?' } },
  defines: { content: { template: 'card.tpl', optional: true, html: true } },
  functions: { default: { implementation: 'builtin', args: ['any', 'any'], returns: 'any' } },
  templates: { 'partial.tpl': { local: 'string' }, 'card.tpl': { label: 'string' } },
};

const program = lowerSourceGraph(graph, manifest);
if (program.templates.get('main.tpl').lines[0] !== 0) throw new Error('compiler IR lost the source line index');
const nodeOps = new Set();
const exprOps = new Set();
function visitExpr(expr) {
  if (!Array.isArray(expr.span) || expr.span.length !== 2) throw new Error(`compiler IR expression ${expr.op} lost its source span`);
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
    if (!Array.isArray(node.span) || node.span.length !== 2) throw new Error(`compiler IR node ${node.op} lost its source span`);
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
const include = program.templates.get('main.tpl').body.find(node => node.op === 'include');
if (include?.inputs?.[0]?.name !== 'local' || include.inputs[0].value.op !== 'local') throw new Error('compiler IR did not bind an include input from caller scope');

const invalid = structuredClone(graph);
invalid.templates.get('partial.tpl').body[0].expr.name = 'undeclared';
try {
  lowerSourceGraph(invalid, manifest);
  throw new Error('compiler IR accepted an undeclared variable');
} catch (error) {
  if (!String(error).includes('undeclared')) throw error;
}

const hostFunction = structuredClone(manifest);
hostFunction.functions.default.implementation = 'host';
const hostProgram = lowerSourceGraph(graph, hostFunction);
if (hostProgram.functions.get('default').implementation !== 'host') throw new Error('compiler IR did not preserve a host function signature');

const dynamic = structuredClone(manifest);
dynamic.fields.page = 'any';
dynamic.fields.lookup = 'any';
dynamic.fields.rows = 'any';
lowerSourceGraph(graph, dynamic);

const dynamicRoot = structuredClone(manifest);
dynamicRoot.root = 'any';
const dynamicRootGraph = structuredClone(graph);
dynamicRootGraph.templates.get('main.tpl').body.push({ type: 'Echo', expr: variable('undeclared_dynamic'), span });
const dynamicRootProgram = lowerSourceGraph(dynamicRootGraph, dynamicRoot);
if (!dynamicRootProgram.dynamicRoot) throw new Error('compiler IR lost the dynamic root contract');
const dynamicRootExpr = dynamicRootProgram.templates.get('main.tpl').body.at(-1)?.expr;
if (dynamicRootExpr?.op !== 'root' || dynamicRootExpr.valueType.source !== 'any?') {
  throw new Error('compiler IR did not lower an undeclared dynamic root value as optional any');
}
if (dynamicRootExpr.scope !== true) throw new Error('compiler IR did not mark a dynamic variable as scope-aware');

const htmlDefinition = structuredClone(manifest);
htmlDefinition.defines.content = { optional: true, html: true };
const htmlGraph = structuredClone(graph);
htmlGraph.templates.get('main.tpl').body = [{ type: 'Block', id: 'content', path: null, scope: [{ name: 'ignored', expr: variable('fallback') }], span }];
const htmlProgram = lowerSourceGraph(htmlGraph, htmlDefinition);
const htmlBlock = htmlProgram.templates.get('main.tpl').body[0];
if (htmlBlock.target !== null || htmlBlock.inputs.length !== 0) throw new Error('compiler IR passed scope data to an HTML definition');

const invalidRoot = structuredClone(manifest);
invalidRoot.root = 'DynamicAssign';
try {
  lowerSourceGraph(graph, invalidRoot);
  throw new Error('compiler IR accepted an unknown root contract');
} catch (error) {
  if (!String(error).includes('Assign or any')) throw error;
}

const unsupportedFunction = structuredClone(manifest);
unsupportedFunction.functions.custom = { implementation: 'remote', args: ['string'], returns: 'string' };
try {
  lowerSourceGraph(graph, unsupportedFunction);
  throw new Error('compiler IR accepted an unknown function implementation');
} catch (error) {
  if (!String(error).includes('builtin or host')) throw error;
}

process.stdout.write('compiler IR: all variants and source spans lowered; typed and dynamic roots plus host signatures accepted; invalid declarations rejected\n');
