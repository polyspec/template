#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifest = JSON.parse(readFileSync(resolve(root, 'tools/compiler/interface.json'), 'utf8'));
const check = process.argv.includes('--check');
const operation = name => manifest.operations.find(item => item.name === name);
const signature = item => `+${item.name}(${item.parameters.join(', ')}) ${item.returns}`;

const flow = [
  'flowchart LR',
  `  SourceGraph["SourceGraph<br/>${manifest.types.SourceGraph.fields.join(' + ')}"] --> Lower["Compiler.${operation('lowerSourceGraph').name}"]`,
  `  TypeManifest["TypeManifest<br/>${manifest.types.TypeManifest.fields.join(' + ')}"] --> Lower`,
  `  Lower --> TypedProgram["TypedProgram<br/>${manifest.types.TypedProgram.fields.join(' + ')}"]`,
  `  TypedProgram --> Emit["LanguageBackend.${operation('emit').name}"]`,
  `  Emit --> GeneratedModule["GeneratedModule<br/>${manifest.types.GeneratedModule.types.join(' + ')}"]`,
  `  GeneratedModule --> Render["${operation('render').name}(${operation('render').parameters.join(', ')})"]`,
  '  Render --> Block["generated block function"]',
  '  Block --> Child["generated child template function"]',
  '',
].join('\n');

const compilerOperations = manifest.operations.filter(item => item.owner === 'Compiler');
const backendOperations = manifest.operations.filter(item => item.owner === 'LanguageBackend');
const moduleOperations = manifest.operations.filter(item => item.owner === 'GeneratedModule');
const classes = [
  'classDiagram',
  '  class Compiler {',
  ...compilerOperations.map(item => `    ${signature(item)}`),
  '  }',
  '  class LanguageBackend {',
  ...backendOperations.map(item => `    ${signature(item)}`),
  '  }',
  '  class GeneratedModule {',
  ...moduleOperations.map(item => `    ${signature(item)}`),
  '  }',
  '  class SourceGraph {',
  ...manifest.types.SourceGraph.fields.map(field => `    +${field}`),
  '  }',
  '  class TypeManifest {',
  ...manifest.types.TypeManifest.fields.map(field => `    +${field}`),
  '  }',
  '  class TypedProgram {',
  ...manifest.types.TypedProgram.fields.map(field => `    +${field}`),
  '  }',
  '  class Definition~T~ {',
  ...manifest.types['Definition<T>'].fields.map(field => `    +${field}`),
  '  }',
  '  class DefinitionData~T~',
  '  class Definitions',
  '  class Input~T~',
  '  class FunctionSignature {',
  ...manifest.types.FunctionSignature.fields.map(field => `    +${field}`),
  '  }',
  '  SourceGraph --> Compiler : input',
  '  TypeManifest --> Compiler : input',
  '  Compiler --> TypedProgram : output',
  '  TypedProgram --> LanguageBackend : input',
  '  LanguageBackend --> GeneratedModule : source',
  '  GeneratedModule --> Definitions',
  '  Definitions --> Definition~T~',
  '  Definition~T~ --> DefinitionData~T~ : data',
  '  DefinitionData~T~ --> Input~T~ : field types',
  '  TypeManifest --> FunctionSignature : functions',
  '',
].join('\n');

for (const [relative, content] of [
  ['tools/compiler/generated/compiler-architecture.mmd', flow],
  ['tools/compiler/generated/compiler-classes.mmd', classes],
]) {
  const path = resolve(root, relative);
  if (check) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== content) throw new Error(`compiler interface output is stale: ${relative}`);
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

process.stdout.write(`compiler interface: ${check ? 'checked' : 'generated'} Mermaid diagrams\n`);
