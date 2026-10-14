#!/usr/bin/env node
import { lowerSourceGraph } from '../packages/compiler/ir.mjs';

// The source nodes of the canonical AST (contracts/schema/ast.schema.json) that the fixture graph builds.
interface SourceExpr {
  type: string;
  span: number[];
  [field: string]: unknown;
}

interface SourceNode {
  type: string;
  span: number[];
  expr?: SourceExpr;
  [field: string]: unknown;
}

interface SourceGraph {
  lines: Map<string, number[]>;
  templates: Map<string, { type: 'Template'; name: string; body: SourceNode[] }>;
}

interface TypeManifest {
  schema: number;
  root: string;
  entry: string;
  fields: Record<string, string>;
  records: Record<string, Record<string, string>>;
  defines: Record<string, { template?: string; optional: boolean; html: boolean }>;
  functions: Record<string, { implementation: string; args: string[]; returns: string }>;
  templates: Record<string, Record<string, string>>;
}

// The parts of the typed program of packages/compiler/ir.mjs that this check reads.
interface IrExpr {
  op: string;
  span: unknown;
  valueType?: { source: string };
  scope?: unknown;
  [field: string]: unknown;
}

interface IrNode {
  op: string;
  span: unknown;
  expr?: IrExpr;
  iter?: IrExpr;
  scope?: { expr: IrExpr }[];
  branches?: { test: IrExpr; body: IrNode[] }[];
  body?: IrNode[];
  empty?: IrNode[];
  otherwise?: IrNode[];
  inputs?: { name: string; value: IrExpr }[];
  target?: unknown;
}

interface IrProgram {
  templates: Map<string, { lines: number[]; body: IrNode[] }>;
  functions: Map<string, { implementation: string }>;
  dynamicRoot: boolean;
}

/** The source body of the template `name` of `graph`; fails when the graph has no such template. */
function sourceBody(graph: SourceGraph, name: string): SourceNode[] {
  const template = graph.templates.get(name);
  if (!template) throw new Error(`the fixture graph has no template ${name}`);
  return template.body;
}

/** The lowered template `name` of `program`; fails when the program has no such template. */
function loweredTemplate(program: IrProgram, name: string): { lines: number[]; body: IrNode[] } {
  const template = program.templates.get(name);
  if (!template) throw new Error(`compiler IR has no template ${name}`);
  return template;
}

const lower = (graph: SourceGraph, manifest: TypeManifest): IrProgram => lowerSourceGraph(graph, manifest);

const span = [0, 0];
const literal = (kind: string, value: string | number): SourceExpr => ({ type: 'Literal', kind, value, span });
const variable = (name: string): SourceExpr => ({ type: 'Var', name, span });
const graph: SourceGraph = {
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
      // oxlint-disable-next-line unicorn/no-thenable -- the Ternary node of contracts/schema/ast.schema.json names its branch then
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
/** Whether `value` is a lowered expression: an object with an op. */
function isExpr(value: unknown): value is IrExpr {
  return typeof value === 'object' && value !== null && 'op' in value && Boolean(value.op);
}
function visitExpr(expr: IrExpr): void {
  if (!Array.isArray(expr.span) || expr.span.length !== 2) throw new Error(`compiler IR expression ${expr.op} lost its source span`);
  exprOps.add(expr.op);
  for (const value of Object.values(expr)) {
    if (isExpr(value)) visitExpr(value);
    else if (Array.isArray(value)) for (const item of value) {
      if (isExpr(item)) visitExpr(item);
      if (typeof item === 'object' && item !== null) {
        if ('value' in item && isExpr(item.value)) visitExpr(item.value);
        if ('key' in item && isExpr(item.key)) visitExpr(item.key);
      }
    }
  }
}
function visitNodes(nodes: IrNode[]): void {
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
const include = loweredTemplate(program, 'main.tpl').body.find(node => node.op === 'include');
if (include?.inputs?.[0]?.name !== 'local' || include.inputs[0].value.op !== 'local') throw new Error('compiler IR did not bind an include input from caller scope');

const invalid = structuredClone(graph);
const invalidExpr = sourceBody(invalid, 'partial.tpl')[0]?.expr;
if (!invalidExpr) throw new Error('the fixture template partial.tpl has no expression to change');
invalidExpr.name = 'undeclared';
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
sourceBody(dynamicRootGraph, 'main.tpl').push({ type: 'Echo', expr: variable('undeclared_dynamic'), span });
const dynamicRootProgram = lower(dynamicRootGraph, dynamicRoot);
if (!dynamicRootProgram.dynamicRoot) throw new Error('compiler IR lost the dynamic root contract');
const dynamicRootExpr = loweredTemplate(dynamicRootProgram, 'main.tpl').body.at(-1)?.expr;
if (dynamicRootExpr?.op !== 'root' || dynamicRootExpr.valueType?.source !== 'any?') {
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
if (htmlBlock?.target !== null || htmlBlock.inputs?.length !== 0) throw new Error('compiler IR passed scope data to an HTML definition');

const invalidRoot = structuredClone(manifest);
invalidRoot.root = 'DynamicAssign';
try {
  lower(graph, invalidRoot);
  throw new Error('compiler IR accepted an unknown root contract');
} catch (error) {
  if (!String(error).includes('Assign or any')) throw error;
}

const unsupportedFunction = structuredClone(manifest);
unsupportedFunction.functions.custom = { implementation: 'remote', args: ['string'], returns: 'string' };
try {
  lower(graph, unsupportedFunction);
  throw new Error('compiler IR accepted an unknown function implementation');
} catch (error) {
  if (!String(error).includes('builtin or host')) throw error;
}

process.stdout.write('compiler IR: all variants and source spans lowered; typed and dynamic roots plus host signatures accepted; invalid declarations rejected\n');
