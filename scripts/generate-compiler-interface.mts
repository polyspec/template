#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

interface Operation {
  name: string;
  parameters: string[];
  returns: string;
}

// The parts of packages/compiler/interface.json that the diagrams show.
interface Manifest {
  operations: Operation[];
  types: Record<string, { fields: string[] } | undefined>;
  components: Record<string, { owns: string[]; operations: string[] }>;
  runtimeContract: Record<'Program' | 'RuntimeBindings' | 'RuntimeServices', { operations: Operation[] }>;
}

const manifest = JSON.parse(readFileSync(resolve(root, 'packages/compiler/interface.json'), 'utf8')) as Manifest;
const check = process.argv.includes('--check');
const operation = (name: string): Operation => {
  const found = manifest.operations.find(item => item.name === name);
  if (!found) throw new Error(`interface.json declares no operation ${name}`);
  return found;
};
const typeFields = (name: string): string[] => {
  const type = manifest.types[name];
  if (!type) throw new Error(`interface.json declares no type ${name}`);
  return type.fields;
};
const fields = (name: string): string => typeFields(name).join(' + ');
const signature = (item: Operation): string => `+${item.name}(${item.parameters.join(', ')}) ${item.returns}`;

const flow = [
  'flowchart LR',
  `  Source["SourceGraph<br/>${fields('SourceGraph')}"] --> Parse["Compiler.${operation('parseSourceGraph').name}"]`,
  '  Parse --> AST["canonical AST graph"]',
  `  Types["TypeManifest<br/>${fields('TypeManifest')}"] --> Lower["Compiler.${operation('lowerSourceGraph').name}"]`,
  '  AST --> Lower',
  `  Lower --> Typed["TypedProgram<br/>${fields('TypedProgram')}"]`,
  '  Typed --> AstArtifact["AST artifact"]',
  '  Typed --> Backend["LanguageBackend"]',
  '  Backend --> GeneratedArtifact["generated host artifact"]',
  '  AstArtifact --> AstProgram["AstProgram"]',
  '  GeneratedArtifact --> GeneratedProgram["GeneratedProgram"]',
  '  AstProgram --> Program["Program.prepare + Program.render"]',
  '  GeneratedProgram --> Program',
  '  RuntimeBindings["RuntimeBindings"] --> AstProgram',
  '  RuntimeBindings --> GeneratedProgram',
  '  RuntimeEnvironment["RuntimeEnvironment"] --> AstProgram',
  '  RuntimeEnvironment --> GeneratedProgram',
  '',
].join('\n');

const classes = ['classDiagram'];
for (const [name, component] of Object.entries(manifest.components)) {
  classes.push(`  class ${name} {`);
  for (const field of component.owns) classes.push(`    +${field}`);
  for (const op of component.operations) classes.push(`    ${signature(operation(op))}`);
  classes.push('  }');
}
for (const name of ['SourceGraph', 'TypeManifest', 'TypedProgram', 'ArtifactManifest', 'RenderRequest']) {
  classes.push(`  class ${name} {`);
  for (const field of typeFields(name)) classes.push(`    +${field}`);
  classes.push('  }');
}
classes.push(
  '  class Program {',
  ...manifest.runtimeContract.Program.operations.map(item => `    +${item.name}(${item.parameters.join(', ')}) ${item.returns}`),
  '  }',
  '  class AstProgram',
  '  class GeneratedProgram',
  '  class RuntimeBindings {',
  ...manifest.runtimeContract.RuntimeBindings.operations.map(signature).map(line => `    ${line}`),
  '  }',
  '  class RuntimeServices {',
  ...manifest.runtimeContract.RuntimeServices.operations.map(signature).map(line => `    ${line}`),
  '  }',
  '  Program <|-- AstProgram',
  '  Program <|-- GeneratedProgram',
  '  Compiler --> TypedProgram',
  '  Compiler --> LanguageBackend',
  '  LanguageBackend --> ArtifactManifest',
  '  ArtifactStore --> ArtifactManifest',
  '  ArtifactStore --> Program',
  '  Engine --> Program',
  '  RuntimeServices <|.. RuntimeEnvironment',
  '  AstProgram --> RuntimeEnvironment',
  '  GeneratedProgram --> RuntimeEnvironment',
  '  AstProgram --> RuntimeBindings',
  '  GeneratedProgram --> RuntimeBindings',
  ''
);

const outputs: [string, string][] = [
  ['packages/compiler/generated/compiler-architecture.mmd', flow],
  ['packages/compiler/generated/compiler-classes.mmd', classes.join('\n')],
];
for (const [relative, content] of outputs) {
  const path = resolve(root, relative);
  if (check) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== content) throw new Error(`compiler interface output is stale: ${relative}`);
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

process.stdout.write(`compiler interface: ${check ? 'checked' : 'generated'} Mermaid diagrams\n`);
