#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifest = JSON.parse(readFileSync(resolve(root, 'tools/compiler/interface.json'), 'utf8'));
if (manifest.schema !== 1 || manifest.name !== 'TypedTemplateCompiler') throw new Error('invalid compiler interface manifest');
const operationNames = manifest.operations?.map(operation => operation.name).join(',');
if (operationNames !== 'loadSourceGraph,lowerSourceGraph,emit,renderTemplate,render') throw new Error('compiler operations are missing or reordered');
for (const name of ['SourceGraph', 'TypeManifest', 'TypedProgram', 'DefinitionData<T>', 'Definition<T>', 'Definitions', 'Input<T>', 'GeneratedModule']) {
  if (!manifest.types?.[name]) throw new Error(`compiler type ${name} is missing`);
}

const outputs = {
  typescript: ['tools/showcase/adapters/generated/typed/compiler-coverage.ts', [
    /export interface Assign/, /export type DefinitionData<T>/, /export interface Definition<T>/, /export interface Definitions/,
    /export interface Input_card_tpl/, /export function renderTemplate\(/, /export function render\(/,
  ]],
  go: ['tools/showcase/adapters/generated/typed/compiler-coverage.go', [
    /type Assign struct/, /type DefinitionData_card_tpl struct/, /type Definition\[T any\] struct/, /type Definitions struct/,
    /type Input_card_tpl struct/, /func RenderTemplate\(/, /func Render\(/,
  ]],
  rust: ['tools/showcase/adapters/generated/typed/compiler-coverage.rust', [
    /pub struct Assign/, /pub struct DefinitionData_card_tpl/, /pub struct Definition<T>/, /pub struct Definitions/,
    /pub struct Input_card_tpl/, /pub fn render_template\(/, /pub fn render\(/,
  ]],
  php: ['tools/showcase/adapters/generated/typed/compiler-coverage.php', [
    /final class Assign/, /final class DefinitionData_card_tpl/, /final class Definition/, /final class Definitions/,
    /final class Input_card_tpl/, /function render_template\(/, /function render\(/,
  ]],
};

for (const [language, [file, patterns]] of Object.entries(outputs)) {
  const mapping = manifest.languages?.[language];
  for (const field of ['assign', 'definitionData', 'definition', 'definitions', 'input', 'renderTemplate', 'render']) {
    if (!mapping?.[field]) throw new Error(`${language}: compiler mapping ${field} is missing`);
  }
  const source = readFileSync(resolve(root, file), 'utf8');
  for (const pattern of patterns) if (!pattern.test(source)) throw new Error(`${language}: generated module does not implement ${pattern}`);
  if (/\bslots\b|map\[string\]string|HashMap<String, String>/.test(source)) throw new Error(`${language}: generated module still accepts pre-rendered string slots`);
}

process.stdout.write('compiler interface: four generated module structures passed\n');
