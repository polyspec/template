import { posix } from 'node:path';

function resolveTemplate(from, target) {
  const joined = target.startsWith('/') ? target.slice(1) : posix.join(posix.dirname(from), target);
  return posix.normalize(joined);
}

function visitExpression(expression, functions) {
  if (!expression || typeof expression !== 'object') return;
  if (expression.type === 'Call') functions.add(expression.name);
  for (const [name, value] of Object.entries(expression)) {
    if (name === 'span' || name === 'type' || name === 'name') continue;
    if (Array.isArray(value)) value.forEach(item => visitExpression(item, functions));
    else visitExpression(value, functions);
  }
}

function visitNodes(nodes, template, state) {
  for (const node of nodes) {
    if (node.type === 'Block') {
      const target = node.path === null ? null : resolveTemplate(template, node.path);
      if (node.id !== null) {
        const current = state.defines[node.id] ?? {};
        state.defines[node.id] = { ...current, ...(target === null ? {} : { template: target }), optional: true };
      }
      if (target !== null && node.scope.length > 0) {
        state.templates[target] ??= {};
        for (const input of node.scope) state.templates[target][input.name] = 'any';
      }
    } else if (node.type === 'IfBlock') {
      state.defines[node.id] ??= { optional: true, html: true };
    }
    if (node.expr) visitExpression(node.expr, state.functions);
    if (node.iter) visitExpression(node.iter, state.functions);
    if (Array.isArray(node.scope)) node.scope.forEach(item => visitExpression(item.expr, state.functions));
    if (Array.isArray(node.body)) visitNodes(node.body, template, state);
    if (Array.isArray(node.else)) visitNodes(node.else, template, state);
    if (Array.isArray(node.empty)) visitNodes(node.empty, template, state);
    if (Array.isArray(node.branches)) {
      for (const branch of node.branches) {
        visitExpression(branch.test, state.functions);
        visitNodes(branch.body, template, state);
      }
    }
  }
}

function expressionVariables(expression, locals, output) {
  if (!expression || typeof expression !== 'object') return;
  if (expression.type === 'Var' && !locals.has(expression.name)) output.add(expression.name);
  for (const [name, value] of Object.entries(expression)) {
    if (name === 'span' || name === 'type' || name === 'name') continue;
    if (Array.isArray(value)) value.forEach(item => expressionVariables(item, locals, output));
    else expressionVariables(value, locals, output);
  }
}

function templateRequirements(nodes, template, required, includes, inherited = new Set()) {
  const locals = new Set(inherited);
  for (const node of nodes) {
    if (node.expr) expressionVariables(node.expr, locals, required);
    if (node.iter) expressionVariables(node.iter, locals, required);
    if (Array.isArray(node.scope)) node.scope.forEach(item => expressionVariables(item.expr, locals, required));
    if (node.type === 'Set') locals.add(node.name);
    if (node.type === 'Include') includes.add(resolveTemplate(template, node.path));
    if (node.type === 'For') {
      templateRequirements(node.body, template, required, includes, new Set(locals).add(node.name));
      if (Array.isArray(node.empty)) templateRequirements(node.empty, template, required, includes, locals);
    } else {
      if (Array.isArray(node.body)) templateRequirements(node.body, template, required, includes, locals);
      if (Array.isArray(node.else)) templateRequirements(node.else, template, required, includes, locals);
    }
    if (Array.isArray(node.branches)) for (const branch of node.branches) {
      expressionVariables(branch.test, locals, required);
      templateRequirements(branch.body, template, required, includes, locals);
    }
  }
}

/** Derives a dynamic input contract from parsed source and request definitions. */
export function deriveTypeManifest(templates, define = {}) {
  const state = { defines: {}, templates: {}, functions: new Set() };
  const requirements = new Map();
  const includes = new Map();
  for (const [name, ast] of templates) {
    state.templates[name] ??= {};
    visitNodes(ast.body, name, state);
    const required = new Set();
    const dependencies = new Set();
    templateRequirements(ast.body, name, required, dependencies);
    requirements.set(name, required);
    includes.set(name, dependencies);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, dependencies] of includes) for (const dependency of dependencies) {
      for (const field of requirements.get(dependency) ?? []) if (!requirements.get(name).has(field)) {
        requirements.get(name).add(field);
        changed = true;
      }
    }
  }
  for (const [name, fields] of requirements) if (name !== 'input.tpl') {
    for (const field of fields) state.templates[name][field] ??= 'any';
  }
  for (const [id, input] of Object.entries(define)) {
    if (typeof input === 'string') state.defines[id] = { template: input, optional: true };
    else if (input && typeof input === 'object' && typeof input.html === 'string') state.defines[id] = { optional: true, html: true };
    else if (input && typeof input === 'object' && typeof input.template === 'string') {
      state.defines[id] = { template: input.template, optional: true };
      const fields = input.data && typeof input.data === 'object' && !Array.isArray(input.data) ? Object.keys(input.data) : [];
      if (fields.length > 0) {
        state.templates[input.template] ??= {};
        for (const field of fields) state.templates[input.template][field] = 'any';
      }
    }
  }
  for (const definition of Object.values(state.defines)) {
    if (definition.template === undefined && definition.html !== true) definition.html = true;
  }
  return {
    schema: 3,
    root: 'any',
    entry: 'input.tpl',
    fields: {},
    records: {},
    defines: state.defines,
    functions: Object.fromEntries([...state.functions].sort().map(name => [name, { implementation: 'builtin', args: [], returns: 'any' }])),
    templates: state.templates,
  };
}
