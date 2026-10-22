#!/usr/bin/env node
import type { Expr as SourceExpr, Span, Template } from '@polyspec/template';
import { typeManifestDocument, type TypeManifest } from '../packages/compiler/src/documents.mts';
import { lowerSourceGraph, type Expr, type LoweredTemplate, type Node, type NodeOf, type Program, type SourceGraph } from '../packages/compiler/src/ir.mts';

/** The source body of the template `name` of `graph`; fails when the graph has no such template. */
function sourceTemplate(graph: SourceGraph, name: string): Template {
  const template = graph.templates.get(name);
  if (!template) throw new Error(`the fixture graph has no template ${name}`);
  return template;
}

/** The lowered template `name` of `program`; fails when the program has no such template. */
function loweredTemplate(program: Program, name: string): LoweredTemplate {
  const template = program.templates.get(name);
  if (!template) throw new Error(`compiler IR has no template ${name}`);
  return template;
}

const lower = (graph: SourceGraph, manifest: TypeManifest): Program => lowerSourceGraph(graph, manifest);

const span: Span = [0, 0];
const literal = (value: string | number): SourceExpr => ({ type: 'Literal', kind: typeof value === 'number' ? 'number' : 'string', value, span });
const variable = (name: string): SourceExpr => ({ type: 'Var', name, span });
const template = (name: string, body: Template['body']): Template => ({ type: 'Template', name, body, comments: [] });
const graph: SourceGraph = {
  lines: new Map([['main.tpl', [0]], ['partial.tpl', [0]], ['card.tpl', [0]]]),
  templates: new Map([
    ['main.tpl', template('main.tpl', [
      { type: 'Text', value: 'begin', span },
      { type: 'Set', name: 'local', expr: variable('fallback'), span },
      { type: 'Echo', expr: literal('literal'), span },
      { type: 'Echo', expr: variable('local'), span },
      { type: 'Echo', expr: { type: 'Member', object: variable('page'), key: 'title', span }, span },
      { type: 'Echo', expr: { type: 'Index', object: variable('lookup'), index: literal('x'), span }, span },
      { type: 'Echo', expr: { type: 'Call', name: 'default', args: [variable('page'), variable('fallback')], span }, span },
      { type: 'Echo', expr: { type: 'Unary', op: '!', operand: variable('flag'), span }, span },
      { type: 'Echo', expr: { type: 'Binary', op: '==', left: variable('fallback'), right: literal('x'), span }, span },
      // oxlint-disable-next-line unicorn/no-thenable -- the Ternary node of contracts/schema/ast.schema.json names its branch then
      { type: 'Echo', expr: { type: 'Ternary', test: variable('flag'), then: literal('yes'), else: literal('no'), span }, span },
      { type: 'Echo', expr: { type: 'List', items: [literal(1), { type: 'Spread', expr: variable('numbers'), span }], span }, span },
      { type: 'Echo', expr: { type: 'Map', entries: [{ key: literal('x'), value: literal('y') }, { type: 'Spread', expr: variable('lookup'), span }], span }, span },
      { type: 'If', branches: [{ test: variable('flag'), body: [{ type: 'Text', value: 'true', span }], span }], else: [{ type: 'Text', value: 'false', span }], span },
      { type: 'For', name: 'row', iter: variable('rows'), body: [
        { type: 'Echo', expr: variable('row'), span },
        { type: 'Echo', expr: { type: 'LoopMeta', loop: 'row', field: 'index_', span }, span },
      ], empty: [{ type: 'Text', value: 'empty', span }], span },
      { type: 'Include', path: 'partial.tpl', span },
      { type: 'Block', id: 'content', path: 'card.tpl', scope: [{ name: 'label', expr: variable('fallback') }], span },
      { type: 'IfBlock', id: 'content', body: [{ type: 'Text', value: 'defined', span }], else: [{ type: 'Text', value: 'missing', span }], span },
    ])],
    ['partial.tpl', template('partial.tpl', [{ type: 'Echo', expr: variable('local'), span }])],
    ['card.tpl', template('card.tpl', [{ type: 'Text', value: 'card', span }])],
  ]),
};
const manifest: TypeManifest = {
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

const program = lower(graph, manifest);
if (loweredTemplate(program, 'main.tpl').lines[0] !== 0) throw new Error('compiler IR lost the source line index');
const nodeOps = new Set<string>();
const exprOps = new Set<string>();
/** The expressions directly inside a lowered expression. */
function operands(expr: Expr): Expr[] {
  switch (expr.op) {
    case 'literal': case 'root': case 'local': case 'loop-meta': return [];
    case 'to-value': return [expr.value];
    case 'member': return [expr.object];
    case 'index': return [expr.object, expr.index];
    case 'member-call': return [expr.object, ...expr.args];
    case 'class-call': case 'call': return expr.args;
    case 'unary': return [expr.operand];
    case 'binary': return [expr.left, expr.right];
    case 'ternary': return [expr.test, expr.consequent, expr.otherwise];
    case 'list': return expr.items.map(item => item.value);
    case 'map': return expr.entries.flatMap(entry => entry.spread ? [entry.value] : [entry.key, entry.value]);
  }
}
function visitExpr(expr: Expr): void {
  if (expr.span.length !== 2) throw new Error(`compiler IR expression ${expr.op} lost its source span`);
  exprOps.add(expr.op);
  for (const operand of operands(expr)) visitExpr(operand);
}
function visitNodes(nodes: Node[]): void {
  for (const node of nodes) {
    if (node.span.length !== 2) throw new Error(`compiler IR node ${node.op} lost its source span`);
    nodeOps.add(node.op);
    if (node.op === 'echo' || node.op === 'set') visitExpr(node.expr);
    if (node.op === 'for') {
      visitExpr(node.iter);
      visitNodes(node.body);
      if (node.empty) visitNodes(node.empty);
    }
    if (node.op === 'block') for (const input of node.inputs) if (input.scope) visitExpr(input.scope);
    if (node.op === 'if') {
      for (const branch of node.branches) { visitExpr(branch.test); visitNodes(branch.body); }
      if (node.otherwise) visitNodes(node.otherwise);
    }
    if (node.op === 'if-block') {
      visitNodes(node.body);
      if (node.otherwise) visitNodes(node.otherwise);
    }
  }
}
for (const template of program.templates.values()) visitNodes(template.body);
const expectedNodes = ['text', 'echo', 'set', 'if', 'for', 'include', 'block', 'if-block'];
const expectedExprs = ['literal', 'root', 'local', 'loop-meta', 'member', 'index', 'call', 'unary', 'binary', 'ternary', 'list', 'map'];
for (const op of expectedNodes) if (!nodeOps.has(op)) throw new Error(`compiler IR did not lower node ${op}`);
for (const op of expectedExprs) if (!exprOps.has(op)) throw new Error(`compiler IR did not lower expression ${op}`);
const include = loweredTemplate(program, 'main.tpl').body.find((node): node is NodeOf<'include'> => node.op === 'include');
if (include?.inputs[0]?.name !== 'local' || include.inputs[0].value.op !== 'local') throw new Error('compiler IR did not bind an include input from caller scope');

const invalid = structuredClone(graph);
sourceTemplate(invalid, 'partial.tpl').body = [{ type: 'Echo', expr: variable('undeclared'), span }];
try {
  lower(invalid, manifest);
  throw new Error('compiler IR accepted an undeclared variable');
} catch (error) {
  if (!String(error).includes('undeclared')) throw error;
}

const hostFunction = structuredClone(manifest);
const defaultFunction = hostFunction.functions.default;
if (!defaultFunction) throw new Error('the fixture manifest declares no function default');
defaultFunction.implementation = 'host';
const hostProgram = lower(graph, hostFunction);
if (hostProgram.functions.get('default')?.implementation !== 'host') throw new Error('compiler IR did not preserve a host function signature');

const dynamic = structuredClone(manifest);
dynamic.fields.page = 'any';
dynamic.fields.lookup = 'any';
dynamic.fields.rows = 'any';
lower(graph, dynamic);

const dynamicRoot = structuredClone(manifest);
dynamicRoot.root = 'any';
const dynamicRootGraph = structuredClone(graph);
sourceTemplate(dynamicRootGraph, 'main.tpl').body.push({ type: 'Echo', expr: variable('undeclared_dynamic'), span });
const dynamicRootProgram = lower(dynamicRootGraph, dynamicRoot);
if (!dynamicRootProgram.dynamicRoot) throw new Error('compiler IR lost the dynamic root contract');
const dynamicRootEcho = loweredTemplate(dynamicRootProgram, 'main.tpl').body.at(-1);
const dynamicRootExpr = dynamicRootEcho?.op === 'echo' ? dynamicRootEcho.expr : null;
if (dynamicRootExpr?.op !== 'root' || dynamicRootExpr.valueType.source !== 'any?') {
  throw new Error('compiler IR did not lower an undeclared dynamic root value as optional any');
}
if (dynamicRootExpr.scope !== true) throw new Error('compiler IR did not mark a dynamic variable as scope-aware');

const htmlDefinition = structuredClone(manifest);
htmlDefinition.defines.content = { optional: true, html: true };
const htmlGraph = structuredClone(graph);
const htmlTemplate = htmlGraph.templates.get('main.tpl');
if (!htmlTemplate) throw new Error('the fixture graph has no template main.tpl');
htmlTemplate.body = [{ type: 'Block', id: 'content', path: null, scope: [{ name: 'ignored', expr: variable('fallback') }], span }];
const htmlProgram = lower(htmlGraph, htmlDefinition);
const htmlBlock = loweredTemplate(htmlProgram, 'main.tpl').body[0];
if (htmlBlock?.op !== 'block' || htmlBlock.target !== null || htmlBlock.inputs.length !== 0) throw new Error('compiler IR passed scope data to an HTML definition');

// A type manifest reaches lowering through its schema, which rejects an unknown root contract or function implementation.
try {
  lower(graph, typeManifestDocument.parse({ ...manifest, root: 'DynamicAssign' }, 'the fixture manifest with the root DynamicAssign'));
  throw new Error('compiler IR accepted an unknown root contract');
} catch (error) {
  if (!String(error).includes('/root must be equal to one of the allowed values')) throw error;
}

try {
  const custom = { implementation: 'remote', args: ['string'], returns: 'string' };
  lower(graph, typeManifestDocument.parse({ ...manifest, functions: { ...manifest.functions, custom } }, 'the fixture manifest with the function custom'));
  throw new Error('compiler IR accepted an unknown function implementation');
} catch (error) {
  if (!String(error).includes('/functions/custom/implementation must be equal to one of the allowed values')) throw error;
}

// EXP-24 and EXP-31: `+` never gives null, and `a ?? b` is b when a is null, so it is optional only when b is. In the
// examples/page case a local set to `meta.og_image ?? links.assets + '/og.png'` under a dynamic root is the required input of
// an include.
const member = (object: SourceExpr, key: string): SourceExpr => ({ type: 'Member', object, key, span });
const ogImage: SourceExpr = {
  type: 'Binary', op: '??', left: member(variable('meta'), 'og_image'),
  right: { type: 'Binary', op: '+', left: member(variable('links'), 'assets'), right: literal('/og.png'), span }, span,
};
const pageGraph: SourceGraph = {
  lines: new Map([['main.tpl', [0]], ['head.tpl', [0]]]),
  templates: new Map([
    ['main.tpl', template('main.tpl', [{ type: 'Set', name: 'og_image', expr: ogImage, span }, { type: 'Include', path: 'head.tpl', span }])],
    ['head.tpl', template('head.tpl', [{ type: 'Echo', expr: variable('og_image'), span }])],
  ]),
};
const pageManifest: TypeManifest = { ...structuredClone(dynamicRoot), fields: {}, defines: {}, templates: { 'head.tpl': { og_image: 'any' } } };
const pageSet = loweredTemplate(lower(pageGraph, pageManifest), 'main.tpl').body.find((node): node is NodeOf<'set'> => node.op === 'set');
if (pageSet?.expr.valueType.source !== 'any') throw new Error(`compiler IR typed the og_image of examples/page as ${pageSet?.expr.valueType.source ?? 'no set'}, not any`);

process.stdout.write('compiler IR: all variants and source spans lowered; typed and dynamic roots plus host signatures accepted; invalid declarations rejected\n');
