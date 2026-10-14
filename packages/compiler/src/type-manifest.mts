import { join, posix } from 'node:path';
import type { Expr, Node, Template } from '@polyspec/template';
import { functionContractDocument, type DefinitionDeclaration, type FunctionSignature, type TypeManifest } from './documents.mts';
import { packageRoot } from './package-root.mts';

const functionContracts = new Map(functionContractDocument.read(join(packageRoot, 'functions.json')).canonical.map(signature => [signature.name, signature]));

function resolveTemplate(from: string, target: string): string {
  const joined = target.startsWith('/') ? target.slice(1) : posix.join(posix.dirname(from), target);
  return posix.normalize(joined);
}

/** The expressions directly inside an expression, in the order of its fields. */
function subexpressions(expression: Expr): Expr[] {
  switch (expression.type) {
    case 'Literal':
    case 'Var':
    case 'LoopMeta':
      return [];
    case 'Member': return [expression.object];
    case 'MemberCall': return [expression.object, ...expression.args];
    case 'ClassCall':
    case 'Call':
      return expression.args;
    case 'Index': return [expression.object, expression.index];
    case 'Unary': return [expression.operand];
    case 'Binary': return [expression.left, expression.right];
    case 'Ternary': return expression.then === null ? [expression.test, expression.else] : [expression.test, expression.then, expression.else];
    case 'List': return expression.items.map(item => item.type === 'Spread' ? item.expr : item);
    case 'Map': return expression.entries.flatMap(entry => 'type' in entry ? [entry.expr] : [entry.key, entry.value]);
  }
}

/** The expressions of a statement node outside its nested bodies: its expression, iterable and block scope. */
function nodeExpressions(node: Node): Expr[] {
  switch (node.type) {
    case 'Echo':
    case 'Set':
      return [node.expr];
    case 'For': return [node.iter];
    case 'Block': return node.scope.map(item => item.expr);
    case 'Text':
    case 'If':
    case 'Include':
    case 'IfBlock':
      return [];
  }
}

function visitExpression(expression: Expr, functions: Set<string>): void {
  if (expression.type === 'Call') functions.add(expression.name);
  for (const item of subexpressions(expression)) visitExpression(item, functions);
}

/** The definitions, template inputs and functions that a source graph declares, collected from its templates. */
interface State {
  defines: Record<string, DefinitionDeclaration>;
  templates: Record<string, Record<string, string>>;
  functions: Set<string>;
}

/** The inputs of a template in the state, created when the template has none yet. */
function inputsOf(state: State, template: string): Record<string, string> {
  const inputs = state.templates[template] ?? {};
  state.templates[template] = inputs;
  return inputs;
}

function visitNodes(nodes: Node[], template: string, state: State): void {
  for (const node of nodes) {
    if (node.type === 'Block') {
      const target = node.path === null ? null : resolveTemplate(template, node.path);
      if (node.id !== null) {
        const current = state.defines[node.id] ?? {};
        state.defines[node.id] = { ...current, ...(target === null ? {} : { template: target }), optional: true };
      }
      if (target !== null && node.scope.length > 0) {
        const inputs = inputsOf(state, target);
        for (const input of node.scope) inputs[input.name] = 'any';
      }
    } else if (node.type === 'IfBlock') {
      state.defines[node.id] ??= { optional: true, html: true };
    }
    for (const expression of nodeExpressions(node)) visitExpression(expression, state.functions);
    if (node.type === 'For' || node.type === 'IfBlock') visitNodes(node.body, template, state);
    if ((node.type === 'If' || node.type === 'IfBlock') && node.else !== null) visitNodes(node.else, template, state);
    if (node.type === 'For' && node.empty !== null) visitNodes(node.empty, template, state);
    if (node.type === 'If') {
      for (const branch of node.branches) {
        visitExpression(branch.test, state.functions);
        visitNodes(branch.body, template, state);
      }
    }
  }
}

function expressionVariables(expression: Expr, locals: Set<string>, output: Set<string>): void {
  if (expression.type === 'Var' && !locals.has(expression.name)) output.add(expression.name);
  for (const item of subexpressions(expression)) expressionVariables(item, locals, output);
}

function templateRequirements(nodes: Node[], template: string, required: Set<string>, includes: Set<string>, inherited = new Set<string>()): void {
  const locals = new Set(inherited);
  for (const node of nodes) {
    for (const expression of nodeExpressions(node)) expressionVariables(expression, locals, required);
    if (node.type === 'Set') locals.add(node.name);
    if (node.type === 'Include') includes.add(resolveTemplate(template, node.path));
    if (node.type === 'For') {
      templateRequirements(node.body, template, required, includes, new Set(locals).add(node.name));
      if (node.empty !== null) templateRequirements(node.empty, template, required, includes, locals);
    } else {
      if (node.type === 'IfBlock') templateRequirements(node.body, template, required, includes, locals);
      if ((node.type === 'If' || node.type === 'IfBlock') && node.else !== null) templateRequirements(node.else, template, required, includes, locals);
    }
    if (node.type === 'If') for (const branch of node.branches) {
      expressionVariables(branch.test, locals, required);
      templateRequirements(branch.body, template, required, includes, locals);
    }
  }
}

/** Whether a value is a JSON object, not null or a list. */
const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Derives a dynamic input contract from parsed source and request definitions: `define` holds the definitions of a
 * request by id, each a template name or an object with `template` and `data`, or with `html`.
 */
export function deriveTypeManifest(templates: Iterable<[string, Template]>, define: Record<string, unknown> = {}): TypeManifest {
  const state: State = { defines: {}, templates: {}, functions: new Set() };
  // The variables that each template reads from its caller, and the templates that it includes.
  const requirements = new Map<string, { required: Set<string>; includes: Set<string> }>();
  for (const [name, ast] of templates) {
    inputsOf(state, name);
    visitNodes(ast.body, name, state);
    const required = new Set<string>();
    const includes = new Set<string>();
    templateRequirements(ast.body, name, required, includes);
    requirements.set(name, { required, includes });
  }
  // An included template that is not in the graph requires nothing.
  let changed = true;
  while (changed) {
    changed = false;
    for (const { required, includes } of requirements.values()) {
      for (const dependency of includes) {
        for (const field of requirements.get(dependency)?.required ?? []) if (!required.has(field)) {
          required.add(field);
          changed = true;
        }
      }
    }
  }
  for (const [name, { required: fields }] of requirements) if (name !== 'input.tpl') {
    const inputs = inputsOf(state, name);
    for (const field of fields) inputs[field] ??= 'any';
  }
  for (const [id, input] of Object.entries(define)) {
    if (typeof input === 'string') state.defines[id] = { template: input, optional: true };
    else if (isObject(input) && 'html' in input && typeof input.html === 'string') state.defines[id] = { optional: true, html: true };
    else if (isObject(input) && 'template' in input && typeof input.template === 'string') {
      state.defines[id] = { template: input.template, optional: true };
      const fields = 'data' in input && isObject(input.data) ? Object.keys(input.data) : [];
      if (fields.length > 0) {
        const inputs = inputsOf(state, input.template);
        for (const field of fields) inputs[field] = 'any';
      }
    }
  }
  for (const definition of Object.values(state.defines)) {
    if (definition.template === undefined && definition.html !== true) definition.html = true;
  }
  const functions = Object.fromEntries([...state.functions].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)).map((name): [string, FunctionSignature] => {
    const contract = functionContracts.get(name);
    if (!contract) return [name, { implementation: 'builtin', args: [], minArgs: 0, maxArgs: -1, returns: 'any', runtimeArity: true }];
    return [name, {
      implementation: 'builtin',
      args: [],
      minArgs: contract.minArgs,
      maxArgs: contract.maxArgs,
      returns: contract.returns,
      runtimeArity: true,
    }];
  }));
  return {
    schema: 3,
    root: 'any',
    entry: 'input.tpl',
    fields: {},
    records: {},
    defines: state.defines,
    functions,
    templates: state.templates,
  };
}
