#!/usr/bin/env node
// Compiles every showcase source graph through the product generated compiler.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { root } from '../../tests/runner/drivers.mjs';
import { compileSource } from '../compiler/compiler.mjs';
import { generatedCompilerDigest, typescriptDeliveryDigest } from '../compiler/compiler-digest.mjs';
import { compileGeneratedArtifact } from '../compiler/generated-artifact.mjs';

const scenariosRoot = join(root, 'examples/site/scenarios');
const adapterRoot = join(root, 'tools/showcase/adapters');
const argv = process.argv.slice(2);
const refreshAt = argv.indexOf('--refresh');
const check = argv.includes('--check');
if (refreshAt < 0 || !argv[refreshAt + 1] || argv.some((value, index) => index !== refreshAt && index !== refreshAt + 1 && value !== '--check')) {
  throw new Error('usage: compile-generated.mjs --refresh dev|true|false [--check]');
}
const refresh = argv[refreshAt + 1];
const scenarios = readdirSync(scenariosRoot, { withFileTypes: true })
  .filter(item => item.isDirectory() && existsSync(join(scenariosRoot, item.name, 'scenario.json')))
  .map(item => item.name)
  .sort();

export function generatedOutput(id, language) {
  if (language === 'go') return join(adapterRoot, 'go/generated', id, 'generated.go');
  if (language === 'js') return join(adapterRoot, 'generated/javascript', `${id}.js`);
  const extension = language === 'rust' ? 'rust' : language;
  return join(adapterRoot, 'generated/typed', `${id}.${extension}`);
}

for (const id of scenarios) {
  const scenario = join(scenariosRoot, id);
  const graph = join(scenario, 'compiled/ast/manifest.json');
  const manifest = join(scenario, 'types.json');
  for (const language of ['ts', 'go', 'rust', 'php']) {
    const output = generatedOutput(id, language);
    compileGeneratedArtifact({
      graphPath: graph,
      typeManifestPath: manifest,
      target: language,
      output,
      refresh,
      check,
      compilerDigest: generatedCompilerDigest(language),
      compile: () => compileSource(graph, manifest, language),
    });
  }
  const typescriptOutput = generatedOutput(id, 'ts');
  compileGeneratedArtifact({
    graphPath: graph,
    typeManifestPath: manifest,
    target: 'js',
    output: generatedOutput(id, 'js'),
    refresh,
    check,
    compilerDigest: typescriptDeliveryDigest(),
    compile: () => ts.transpileModule(readFileSync(typescriptOutput, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      fileName: typescriptOutput,
    }).outputText,
  });
}

process.stdout.write(`${check ? 'checked' : refresh === 'false' ? 'loaded' : 'compiled'} ${scenarios.length * 5} generated showcase artifacts\n`);
