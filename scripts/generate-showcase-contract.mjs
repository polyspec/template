#!/usr/bin/env node
// Generates language declarations and Mermaid diagrams from the showcase interface manifest.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const adapterRoot = join(root, 'tools', 'showcase', 'adapters');
const manifestPath = join(adapterRoot, 'interface.json');
const check = process.argv.includes('--check');

function fail(message) {
  throw new Error('[contract] ' + message);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.schema !== 3) fail('interface.json must use schema 3');
if (!manifest.name || !manifest.concreteType) fail('interface name and concrete type are required');
if (!manifest.constructor || !Array.isArray(manifest.constructor.parameters)) {
  fail('constructor parameters are required');
}
if (!Array.isArray(manifest.constructor.errors) || !Array.isArray(manifest.constructor.preconditions) ||
    !Array.isArray(manifest.constructor.reads) || !Array.isArray(manifest.constructor.mutates) || !Array.isArray(manifest.constructor.owns)) {
  fail('constructor errors, preconditions, reads, mutates and owns are required');
}
if (!manifest.types || !manifest.operations || !manifest.languages || !manifest.supportLevels) {
  fail('types, operations, supportLevels and languages are required');
}

const supportLevelNames = Object.keys(manifest.supportLevels);
if (!supportLevelNames.length) fail('supportLevels must not be empty');
for (const [name, level] of Object.entries(manifest.supportLevels)) {
  if (!level.description || !Array.isArray(level.operations)) fail(`support level ${name} is incomplete`);
  if (new Set(level.operations).size !== level.operations.length) fail(`support level ${name} has duplicate operations`);
}

const operationNames = manifest.operations.map(operation => operation.name);
if (new Set(operationNames).size !== operationNames.length) fail('operation names must be unique');
for (const operation of manifest.operations) {
  if (!operation.name || !Array.isArray(operation.parameters) || !operation.returns) {
    fail('each operation needs name, parameters and returns');
  }
}

const requiredLanguages = ['typescript', 'javascript', 'go', 'rust', 'php'];
for (const language of requiredLanguages) {
  const definition = manifest.languages[language];
  if (!definition || !definition.file || !definition.generated || !definition.type || !definition.constructorName || !definition.operationNames || !Array.isArray(definition.supportLevels)) {
    fail('language mapping is incomplete for ' + language);
  }
  for (const level of definition.supportLevels) {
    if (!manifest.supportLevels[level]) fail(`${language} declares unknown support level ${level}`);
  }
  if (definition.type !== manifest.concreteType || Object.keys(definition.operationNames).length !== operationNames.length) {
    fail(language + ' does not map exactly to the contract type and operations');
  }
  for (const operation of operationNames) {
    if (!definition.operationNames[operation]) {
      fail(language + ' has no name mapping for ' + operation);
    }
  }
}

for (const [name, type] of Object.entries(manifest.types)) {
  if (!type.kind) fail(`type ${name} has no kind`);
  if (type.kind === 'record') {
    if (!Array.isArray(type.fields) || type.fields.length === 0) fail(`record ${name} needs fields`);
    const fields = type.fields.map(field => field.name);
    if (new Set(fields).size !== fields.length) fail(`record ${name} has duplicate fields`);
    for (const [index, field] of type.fields.entries()) {
      if (!field.type || typeof field.required !== 'boolean' || typeof field.nullable !== 'boolean' || field.order !== index + 1) {
        fail(`record ${name}.${field.name} must declare type, required, nullable and order`);
      }
    }
  }
  if (type.kind === 'union') {
    if (!Array.isArray(type.variants) || type.variants.length === 0) fail(`union ${name} needs variants`);
    for (const variant of type.variants) {
      if (!variant.name || !Array.isArray(variant.fields) || !Array.isArray(variant.owns)) fail(`union ${name} has an incomplete variant`);
      const fields = variant.fields.map(field => field.name);
      if (new Set(fields).size !== fields.length) fail(`union ${name}.${variant.name} has duplicate fields`);
      for (const [index, field] of variant.fields.entries()) {
        if (!field.type || typeof field.required !== 'boolean' || typeof field.nullable !== 'boolean' || field.order !== index + 1) {
          fail(`union ${name}.${variant.name}.${field.name} must declare type, required, nullable and order`);
        }
      }
    }
  }
}
for (const operation of manifest.operations) {
  if (!Array.isArray(operation.errors) || !Array.isArray(operation.preconditions) || !Array.isArray(operation.mutates) ||
      !Array.isArray(operation.calls) || typeof operation.failureState !== 'string') {
    fail(`operation ${operation.name} must declare errors, preconditions, mutates, calls and failureState`);
  }
  const parameters = operation.parameters.map(parameter => parameter.name);
  if (new Set(parameters).size !== parameters.length) fail(`operation ${operation.name} has duplicate parameters`);
  for (const parameter of operation.parameters) {
    if (!parameter.type || !['owned', 'read-only'].includes(parameter.mode)) fail(`operation ${operation.name} has an incomplete parameter`);
  }
}
if (!Array.isArray(manifest.state.states) || !Array.isArray(manifest.state.transitions)) fail('state transitions are required');

function fieldsOf(name) {
  const type = manifest.types[name];
  if (!type || type.kind !== 'record') return [];
  return type.fields ?? [];
}

function fieldType(field, language) {
  const type = field.type;
  if (language === 'typescript') {
    if (type === 'JsonObject') return 'JsonObject';
    if (type === 'DefineRegistry') return 'DefineRegistry';
    if (type === 'JsonValue') return 'JsonValue';
    return type === 'path' ? 'string' : type;
  }
  if (language === 'go') {
    if (type === 'JsonObject') return 'JsonObject';
    if (type === 'DefineRegistry') return 'DefineRegistry';
    if (type === 'JsonValue') return 'JsonValue';
    if (type === 'Environment') return 'Environment';
    return type === 'path' ? 'string' : type === 'number' ? 'float64' : type;
  }
  if (language === 'rust') {
    if (type === 'JsonObject') return 'JsonObject';
    if (type === 'DefineRegistry') return 'DefineRegistry';
    if (type === 'JsonValue') return 'JsonValue';
    if (type === 'Environment') return 'Environment';
    return type === 'path' ? 'String' : type === 'number' ? 'f64' : type === 'string' ? 'String' : type;
  }
  if (language === 'php') {
    if (type === 'JsonObject') return 'MapValue';
    if (type === 'DefineRegistry') return 'MapValue';
    if (type === 'Environment') return 'Environment';
    return type === 'path' ? 'string' : type === 'number' ? 'float' : type === 'string' ? 'string' : 'mixed';
  }
  return type;
}

function optionalType(field, language) {
  const type = fieldType(field, language);
  if (language === 'typescript') return field.required ? type : type;
  if (language === 'go') {
    if (field.required && !field.nullable) return type;
    if (type === 'float64' || type === 'string' || type === 'bool') return '*' + type;
    if (type === 'Environment') return '*Environment';
    return type;
  }
  if (language === 'rust') return field.required && !field.nullable ? type : 'Option<' + type + '>';
  if (language === 'php') return field.required && !field.nullable ? type : '?' + type;
  return type;
}

function returnType(type, language) {
  if (language === 'rust' && type === 'string') return 'String';
  return type;
}

function tsTypeDeclaration(name) {
  const type = manifest.types[name];
  if (type.kind === 'alias') {
    if (name === 'JsonValue') return 'export type JsonValue = unknown;';
    if (name === 'JsonObject') return 'export type JsonObject = Map<string, JsonValue>;';
    if (name === 'DefineRegistry') return 'export type DefineRegistry = Map<string, string | DefineEntry>;';
  }
  if (type.kind === 'recursive-union') return 'export type ' + name + ' = unknown;';
  if (type.kind === 'union') {
    const variants = type.variants.map(variant => {
      const fields = variant.fields.map(field => {
        const suffix = field.required ? '' : '?';
        return '  readonly ' + field.name + suffix + ': ' + fieldType(field, 'typescript') + ';';
      });
      return '{\n' + fields.join('\n') + '\n}';
    });
    return 'export type ' + name + ' =\n' + variants.join('\n  |\n') + ';';
  }
  const fields = fieldsOf(name).map(field => {
    const suffix = field.required ? '' : '?';
    return '  readonly ' + field.name + suffix + ': ' + optionalType(field, 'typescript') + ';';
  });
  return 'export interface ' + name + ' {\n' + fields.join('\n') + '\n}';
}

function tsParameterType(parameter) {
  const type = optionalType({
    type: parameter.type,
    required: true,
    nullable: false,
  }, 'typescript');
  return parameter.mode === 'read-only' ? 'Readonly<' + type + '>' : type;
}

function tsDeclarations() {
  const lines = [
    '// Generated by scripts/generate-showcase-contract.mjs. Edit interface.json.',
    '',
  ];
  for (const name of ['JsonValue', 'JsonObject', 'DefineRegistry', 'DefineEntry', 'Environment', 'Scenario', 'RenderRequest', 'RepeatResult']) {
    lines.push(tsTypeDeclaration(name), '');
  }
  lines.push('export interface RenderAdapter {');
  for (const operation of manifest.operations) {
    const params = operation.parameters.map(parameter => parameter.name + ': ' + tsParameterType(parameter)).join(', ');
    lines.push('  ' + operation.name + '(' + params + '): ' + operation.returns + ';');
  }
  lines.push('}', '');
  lines.push('export const operations = Object.freeze(' + JSON.stringify(operationNames) + ' as const);', '');
  lines.push('export function assertRenderAdapter(adapter: RenderAdapter): RenderAdapter {');
  lines.push('  for (const operation of operations) {');
  lines.push('    if (typeof adapter[operation] !== "function") throw new Error("missing adapter operation: " + operation);');
  lines.push('  }');
  lines.push('  return adapter;');
  lines.push('}', '');
  lines.push('export function assertRequestShape(request: RenderRequest): RenderRequest {');
  lines.push('  const keys = Object.keys(request);');
  lines.push('  const expected = request.env === undefined ? ["target", "assign", "define"] : ["target", "assign", "define", "env"];');
  lines.push('  if (keys.join(",") !== expected.join(",")) throw new Error("request fields do not follow the manifest order");');
  lines.push('  return request;');
  lines.push('}', '');
  return lines.join('\n');
}

function goFieldName(name) {
  if (name === 'html') return 'HTML';
  return name[0].toUpperCase() + name.slice(1);
}

function goFields(fields) {
  const width = Math.max(...fields.map(field => field.name.length));
  return fields.map(field => '\t' + field.name.padEnd(width) + ' ' + field.type);
}

function goDeclarations() {
  const lines = [
    '// Code generated by scripts/generate-showcase-contract.mjs. DO NOT EDIT.',
    'package main',
    '',
    'import "github.com/polyspec/template/value"',
    '',
    'type JsonValue = value.Value',
    'type JsonObject = *value.OrderedMap',
    'type DefineRegistry = *value.OrderedMap',
    '',
  ];
  const define = manifest.types.DefineEntry;
  lines.push('type DefineEntry struct {');
  const defineFields = [];
  for (const variant of define.variants) {
    for (const field of variant.fields) {
      const name = goFieldName(field.name);
      const type = field.name === 'data' ? 'JsonObject' : field.name === 'template' || field.name === 'html' ? '*string' : fieldType(field, 'go');
      defineFields.push({ name, type });
    }
  }
  lines.push(...goFields(defineFields));
  lines.push('}', '');
  for (const name of ['Environment', 'Scenario', 'RenderRequest', 'RepeatResult']) {
    lines.push('type ' + name + ' struct {');
    lines.push(...goFields(fieldsOf(name).map(field => ({
      name: goFieldName(field.name),
      type: optionalType(field, 'go'),
    }))));
    lines.push('}', '');
  }
  lines.push('type RenderAdapter interface {');
  for (const operation of manifest.operations) {
    if (operation.name === 'constructor') continue;
    const params = operation.parameters.map(parameter => parameter.type === 'Scenario'
      ? 'Scenario'
      : parameter.type === 'RenderRequest' ? 'RenderRequest' : 'any').join(', ');
    lines.push('\t' + manifest.languages.go.operationNames[operation.name] + '(' + params + ') (' + operation.returns + ', error)');
  }
  lines.push('}', '');
  return lines.join('\n');
}

function rustDeclarations() {
  const lines = [
    '// Generated by scripts/generate-showcase-contract.mjs. Do not edit.',
    'use indexmap::IndexMap;',
    'use serde::Deserialize;',
    'use serde_json::{Map, Value};',
    '',
    'pub type JsonValue = Value;',
    'pub type JsonObject = Map<String, JsonValue>;',
    'pub type DefineRegistry = IndexMap<String, DefineEntry>;',
    '',
  ];
  lines.push('#[derive(Clone, Debug, Deserialize)]');
  lines.push('#[serde(deny_unknown_fields)]');
  lines.push('pub struct DefineEntry {');
  for (const variant of manifest.types.DefineEntry.variants) {
    for (const field of variant.fields) {
      const type = field.name === 'data' ? 'Option<JsonObject>' : 'Option<String>';
      lines.push('    pub ' + field.name + ': ' + type + ',');
    }
  }
  lines.push('}', '');
  for (const name of ['Environment', 'Scenario', 'RenderRequest', 'RepeatResult']) {
    lines.push('#[derive(Clone, Debug' + (name === 'Environment' ? ', Deserialize' : '') + ')]');
    if (name === 'Environment') lines.push('#[serde(deny_unknown_fields)]');
    lines.push('pub struct ' + name + ' {');
    for (const field of fieldsOf(name)) {
      lines.push('    pub ' + field.name + ': ' + optionalType(field, 'rust') + ',');
    }
    lines.push('}', '');
  }
  lines.push('pub trait RenderAdapter {');
  for (const operation of manifest.operations) {
    if (operation.name === 'constructor') continue;
    const parameter = operation.parameters[0];
    const params = parameter ? ', ' + parameter.name + ': &' + parameter.type : '';
    lines.push('    fn ' + manifest.languages.rust.operationNames[operation.name] + '(&self' + params + ') -> Result<' + returnType(operation.returns, 'rust') + ', String>;');
  }
  lines.push('}', '');
  return lines.join('\n');
}

function phpDeclarations() {
  const lines = [
    '<?php',
    '',
    '// Generated by scripts/generate-showcase-contract.mjs. Do not edit.',
    'declare(strict_types=1);',
    '',
    'use Polyspec\\Template\\Value\\MapValue;',
    '',
  ];
  const define = manifest.types.DefineEntry;
  lines.push('final class DefineEntry');
  lines.push('{');
  lines.push('    public function __construct(');
  for (const variant of define.variants) {
    for (const field of variant.fields) {
      const type = field.name === 'data' ? '?MapValue' : '?string';
      lines.push('        public readonly ' + type + ' $' + field.name + ',');
    }
  }
  lines.push('    ) {}', '}', '');
  for (const name of ['Environment', 'Scenario', 'RenderRequest', 'RepeatResult']) {
    lines.push('final class ' + name, '{', '    public function __construct(');
    for (const field of fieldsOf(name)) {
      lines.push('        public readonly ' + optionalType(field, 'php') + ' $' + field.name + ',');
    }
    lines.push('    ) {}', '}', '');
  }
  lines.push('interface RenderAdapter', '{');
  for (const operation of manifest.operations) {
    if (operation.name === 'constructor') continue;
    const parameter = operation.parameters[0];
    const params = parameter ? parameter.type + ' $' + parameter.name : '';
    lines.push('    public function ' + operation.name + '(' + params + '): ' + operation.returns + ';');
  }
  lines.push('}', '');
  return lines.join('\n');
}

function javascriptDeclarations() {
  const operations = operationNames.map(name => manifest.languages.javascript.operationNames[name]);
  const requestFields = fieldsOf('RenderRequest');
  const requiredFields = requestFields.filter(field => field.required).map(field => field.name);
  const optionalFields = requestFields.filter(field => !field.required).map(field => field.name);
  const fields = Object.fromEntries(Object.entries(manifest.types).map(([name, type]) => [
    name,
    type.kind === 'record' ? type.fields.map(field => field.name) : type.kind,
  ]));
  return [
    '// Generated by scripts/generate-showcase-contract.mjs. Do not edit.',
    'export const contractName = ' + JSON.stringify(manifest.name) + ';',
    'export const typeFields = Object.freeze(' + JSON.stringify(fields, null, 2) + ');',
    'export const operations = Object.freeze(' + JSON.stringify(operations) + ');',
    '',
    'export function assertRenderAdapter(adapter) {',
    '  for (const operation of operations) {',
    '    if (typeof adapter[operation] !== "function") throw new Error("missing adapter operation: " + operation);',
    '  }',
    '  return adapter;',
    '}',
    '',
    'export function assertRequestShape(request) {',
    '  const keys = Object.keys(request);',
    '  const required = ' + JSON.stringify(requiredFields) + ';',
    '  const optional = ' + JSON.stringify(optionalFields) + ';',
    '  const expected = Object.hasOwn(request, "env") ? required.concat(optional) : required;',
    '  if (keys.join(",") !== expected.join(",")) {',
    '    throw new Error("request fields do not follow the manifest order");',
    '  }',
    '  return request;',
    '}',
    '',
  ].join('\n');
}

function mermaidType(type) {
  return type
    .replaceAll('ordered-map<string, DefineEntry>', 'DefineRegistry')
    .replaceAll('ordered-object<string, JsonValue>', 'JsonObject')
    .replaceAll('<', '_')
    .replaceAll('>', '')
    .replaceAll(',', '_')
    .replaceAll(' ', '');
}

function classDiagram() {
  const lines = ['classDiagram', '    class Adapter {'];
  lines.push('        +path root');
  lines.push('        +Engine engine');
  lines.push('        +Adapter(root) Adapter');
  for (const operation of manifest.operations) {
    if (operation.name === 'constructor') continue;
    const params = operation.parameters.map(parameter => parameter.type).join(', ');
    lines.push('        +' + operation.name + '(' + params + ') ' + operation.returns);
  }
  lines.push('    }');
  for (const name of ['Scenario', 'RenderRequest', 'Environment', 'RepeatResult']) {
    lines.push('    class ' + name + ' {');
    for (const field of fieldsOf(name)) {
      lines.push('        +' + mermaidType(field.type) + (field.required ? '' : '?') + ' ' + field.name);
    }
    lines.push('    }');
  }
  lines.push('    class DefineEntry {');
  for (const variant of manifest.types.DefineEntry.variants) {
    for (const field of variant.fields) {
      lines.push('        +' + mermaidType(field.type) + ' ' + field.name);
    }
  }
  lines.push('    }');
  lines.push('    Adapter *-- Scenario : loads');
  lines.push('    Scenario *-- RenderRequest : buildRequest transfers fields');
  lines.push('    RenderRequest *-- DefineEntry : owns define entries');
  lines.push('    RenderRequest o-- Environment : optional');
  lines.push('    DefineEntry --> DefineEntry : template data is ordered object');
  return lines.join('\n') + '\n';
}

function flowDiagram() {
  return [
    'flowchart LR',
    '  Files["scenario directory"] --> Adapter["language adapter"]',
    '  Adapter --> Scenario["Scenario"]',
    '  Scenario --> Request["RenderRequest"]',
    '  Request --> Engine["Engine.render"]',
    '  Engine --> Output["UTF-8 output"]',
    '',
  ].join('\n');
}

function stateDiagram() {
  const constructor = manifest.state.transitions.find(transition => transition.operation === 'constructor');
  const lines = ['stateDiagram-v2', '    [*] --> ' + constructor.to + ' : ' + constructor.operation];
  const failures = new Set();
  for (const transition of manifest.state.transitions) {
    if (transition.operation === 'constructor') continue;
    lines.push('    ' + transition.from + ' --> ' + transition.to + ' : ' + transition.operation);
    const recovery = transition.onError?.match(/^([^ ]+) -> ([^ ]+)$/);
    if (recovery) failures.add(recovery[1] + ' --> ' + recovery[2] + ' : recover after ' + transition.operation + ' error');
  }
  for (const failure of failures) lines.push('    ' + failure);
  return lines.join('\n') + '\n';
}

function sequenceDiagram() {
  const lines = [
    'sequenceDiagram',
    '    participant Caller',
    '    participant Adapter',
    '    participant Engine',
    '    Caller->>Adapter: loadScenario()',
    '    Adapter-->>Caller: Scenario',
    '    Caller->>Adapter: buildRequest(Scenario)',
    '    Adapter-->>Caller: RenderRequest',
    '    Caller->>Adapter: renderTwice(RenderRequest)',
    '    Adapter->>Engine: render(target, assign, define, env)',
    '    Engine-->>Adapter: first UTF-8 bytes',
    '    Adapter->>Engine: render(target, assign, define, env)',
    '    Engine-->>Adapter: second UTF-8 bytes',
    '    Adapter-->>Caller: RepeatResult',
    '',
  ];
  return lines.join('\n');
}

function supportDiagram() {
  const lines = ['flowchart TB'];
  for (const [name, level] of Object.entries(manifest.supportLevels)) {
    lines.push(`  ${name.replaceAll('-', '_')}["${name}<br/>${level.operations.join(', ')}"]`);
  }
  lines.push('  source_compiler --> artifact_runtime');
  lines.push('  artifact_runtime --> core_runtime');
  lines.push('  native_source_backend --> artifact_runtime');
  for (const [language, definition] of Object.entries(manifest.languages)) {
    lines.push(`  ${language}["${language}: ${definition.supportLevels.join(', ')}"]`);
    for (const level of definition.supportLevels) lines.push(`  ${language} --> ${level.replaceAll('-', '_')}`);
  }
  return lines.join('\n') + '\n';
}

const outputs = new Map([
  ['generated/render_adapter.ts', tsDeclarations()],
  ['generated/render_adapter.mjs', javascriptDeclarations()],
  ['generated/render_adapter.php', phpDeclarations()],
  ['go/render_adapter.go', goDeclarations()],
  ['rust/src/render_adapter.rs', rustDeclarations()],
  ['generated/render-flow.mmd', flowDiagram()],
  ['generated/render-class.mmd', classDiagram()],
  ['generated/render-state.mmd', stateDiagram()],
  ['generated/render-sequence.mmd', sequenceDiagram()],
  ['generated/support-levels.mmd', supportDiagram()],
]);

for (const [relativePath, content] of outputs) {
  const path = join(adapterRoot, relativePath);
  if (check) {
    if (!existsSync(path)) fail('generated file is missing: ' + relativePath);
    const current = readFileSync(path, 'utf8');
    if (current !== content) fail('generated file is stale: ' + relativePath);
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

if (check) {
  process.stdout.write('[contract] generated declarations and Mermaid diagrams are current\n');
} else {
  process.stdout.write('[contract] generated declarations and Mermaid diagrams\n');
}
