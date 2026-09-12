#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifestPath = resolve(root, 'tools/compiler/interface.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.schema !== 2 || manifest.name !== 'TemplateCompiler') throw new Error('invalid compiler interface manifest');
if (existsSync(resolve(root, 'tools/runtime/interface.json'))) throw new Error('runtime contract must not duplicate the compiler manifest');

const requiredTypes = [
  'CompileMode', 'ArtifactRefresh', 'SourceGraph', 'TypeManifest', 'TypedProgram',
  'ArtifactManifest', 'RenderRequest', 'Program', 'AstProgram', 'GeneratedProgram',
  'RuntimeBindings', 'FunctionSignature', 'DefinitionData<T>', 'Definition<T>',
  'Definitions', 'Input<T>',
];
for (const name of requiredTypes) if (!manifest.types?.[name]) throw new Error(`compiler type ${name} is missing`);

const expectedOperations = {
  Compiler: ['loadSourceGraph', 'parseSourceGraph', 'lowerSourceGraph', 'emitArtifact'],
  LanguageBackend: ['emitDeclarations', 'emitRuntime', 'emitTemplates', 'emitEntry'],
  ArtifactStore: ['load', 'regenerate', 'loadOrRefresh'],
  Program: ['prepare', 'render'],
  PageCache: ['get', 'put', 'getOrSet'],
};
for (const [owner, names] of Object.entries(expectedOperations)) {
  const actual = manifest.operations.filter(item => item.owner === owner).map(item => item.name);
  if (actual.join(',') !== names.join(',')) throw new Error(`${owner} operations differ: ${actual.join(',')}`);
}

const core = manifest.supportLevels?.core;
if (core?.languages?.join(',') !== 'typescript,go,rust,php') throw new Error('core languages are missing or reordered');
if (core?.compileModes?.join(',') !== 'ast,gen' || core.conformanceCases !== 211) throw new Error('core support level is incomplete');
for (const language of core.languages) {
  const mapping = manifest.languages?.[language];
  if (!mapping?.backend || mapping.program?.join(',') !== 'AstProgram,GeneratedProgram' || !mapping.error) {
    throw new Error(`${language}: compiler mapping is incomplete`);
  }
}

const requiredForbidden = [
  'generated renderer callback', 'AST fallback from generated mode',
  'showcase-specific compiler', 'legacy wrapper compatibility',
  'parsing or code generation during render',
];
if (manifest.forbidden?.join('\n') !== requiredForbidden.join('\n')) throw new Error('forbidden architecture list differs');

process.stdout.write('compiler interface: single product manifest structure passed\n');
