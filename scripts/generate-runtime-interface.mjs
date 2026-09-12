#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifest = JSON.parse(readFileSync(resolve(root, 'tools/runtime/interface.json'), 'utf8'));
const check = process.argv.includes('--check');
const prepared = manifest.types.PreparedRender;
const execution = manifest.types.PreparedExecution;
const ast = manifest.types.AstPreparedExecution;
const generated = manifest.types.GeneratedPreparedExecution;

const flow = [
  'flowchart LR',
  '  Request["target + assign + define + env"] --> Normalize["Engine.prepare<br/>bind and normalize"]',
  '  AstArtifact["AstArtifact"] --> AstExecution["AstPreparedExecution"]',
  '  GeneratedArtifact["GeneratedArtifact"] --> GeneratedExecution["GeneratedPreparedExecution"]',
  '  Normalize --> AstExecution',
  '  Normalize --> GeneratedExecution',
  '  AstExecution --> Prepared["PreparedRender<br/>exactly one execution"]',
  '  GeneratedExecution --> Prepared',
  '  Prepared --> Render["render()"]',
  '  Render --> Bytes["UTF-8 bytes"]',
  '',
].join('\n');

const classes = [
  'classDiagram',
  '  class PreparedRender {',
  ...prepared.fields.map(field => `    +${field}`),
  ...prepared.operations.map(operation => `    +${operation}()`),
  '  }',
  '  class PreparedExecution',
  '  <<sum>> PreparedExecution',
  '  class AstPreparedExecution {',
  ...ast.fields.map(field => `    +${field}`),
  '    +render()',
  '  }',
  '  class GeneratedPreparedExecution {',
  ...generated.fields.map(field => `    +${field}`),
  '    +render()',
  '  }',
  '  PreparedRender *-- PreparedExecution : execution',
  '  PreparedExecution <|-- AstPreparedExecution',
  '  PreparedExecution <|-- GeneratedPreparedExecution',
  '',
].join('\n');

for (const [relative, content] of [
  ['tools/runtime/generated/prepared-execution-flow.mmd', flow],
  ['tools/runtime/generated/prepared-execution-classes.mmd', classes],
]) {
  const path = resolve(root, relative);
  if (check) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== content) throw new Error(`runtime interface output is stale: ${relative}`);
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

process.stdout.write(`runtime interface: ${check ? 'checked' : 'generated'} Mermaid diagrams\n`);
