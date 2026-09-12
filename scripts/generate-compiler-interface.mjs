#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifest = JSON.parse(readFileSync(resolve(root, 'tools/compiler/interface.json'), 'utf8'));
const check = process.argv.includes('--check');
const operation = name => manifest.operations.find(item => item.name === name);
const fields = name => manifest.types[name].fields.join(' + ');
const signature = item => `+${item.name}(${item.parameters.join(', ')}) ${item.returns}`;

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
  for (const field of manifest.types[name].fields) classes.push(`    +${field}`);
  classes.push('  }');
}
classes.push(
  '  class Program {',
  '    +prepare(RenderRequest) PreparedRender',
  '    +render(RenderRequest) UTF-8 string',
  '  }',
  '  class AstProgram',
  '  class GeneratedProgram',
  '  Program <|-- AstProgram',
  '  Program <|-- GeneratedProgram',
  '  Compiler --> TypedProgram',
  '  Compiler --> LanguageBackend',
  '  LanguageBackend --> ArtifactManifest',
  '  ArtifactStore --> ArtifactManifest',
  '  ArtifactStore --> Program',
  '  Engine --> Program',
  ''
);

for (const [relative, content] of [
  ['tools/compiler/generated/compiler-architecture.mmd', flow],
  ['tools/compiler/generated/compiler-classes.mmd', classes.join('\n')],
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
