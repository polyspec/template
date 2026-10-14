#!/usr/bin/env node
// Compiles every showcase source graph through the product generated compiler.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { transformSync } from 'esbuild';
import { root } from '../../tests/runner/drivers.mts';
import { compileFiles, compileSource } from '../../packages/compiler/compiler.mjs';
import { generatedCompilerDigest } from '../../packages/compiler/compiler-digest.mjs';
import { typescriptDeliveryDigest } from './delivery-digest.mts';
import { compileGeneratedArtifact } from '../../packages/compiler/generated-artifact.mjs';
import { showcasePhpDirectory, showcasePhpNamespace } from './php-namespace.mts';
import { showcasePythonModule } from './python-module.mts';
import { scenarioIds } from '../../scripts/showcase-documents.mts';

const scenariosRoot = join(root, 'examples/site/scenarios');
const adapterRoot = join(root, 'examples/showcase/adapters');
const argv = process.argv.slice(2);
const refreshAt = argv.indexOf('--refresh');
const check = argv.includes('--check');
const refresh = argv[refreshAt + 1];
if (refreshAt < 0 || refresh === undefined || argv.some((value, index) => index !== refreshAt && index !== refreshAt + 1 && value !== '--check')) {
  throw new Error('usage: compile-generated.mts --refresh dev|true|false [--check]');
}
const scenarios = scenarioIds(scenariosRoot);

/** The generated artifact of a scenario in a target: a file, or the directory of the PHP files. */
function generatedOutput(id: string, language: string): string {
  if (language === 'go') return join(adapterRoot, 'go/generated', id, 'generated.go');
  if (language === 'js') return join(adapterRoot, 'generated/javascript', `${id}.js`);
  if (language === 'php') return join(root, showcasePhpDirectory(id));
  if (language === 'python') return join(adapterRoot, 'generated/typed', `${showcasePythonModule(id)}.py`);
  return join(adapterRoot, 'generated/typed', `${id}.${language}`);
}

for (const id of scenarios) {
  const scenario = join(scenariosRoot, id);
  const graph = join(scenario, 'compiled/ast/manifest.json');
  const manifest = join(scenario, 'types.json');
  for (const language of ['ts', 'go', 'rust', 'php', 'python']) {
    const output = generatedOutput(id, language);
    compileGeneratedArtifact({
      graphPath: graph,
      typeManifestPath: manifest,
      target: language,
      output,
      refresh,
      check,
      compilerDigest: generatedCompilerDigest(language),
      compile: () => language === 'php' ? compileFiles(graph, manifest, language, { phpNamespace: showcasePhpNamespace(id) }) : compileSource(graph, manifest, language),
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
    compile: () => transformSync(readFileSync(typescriptOutput, 'utf8'), {
      loader: 'ts',
      target: 'es2022',
      sourcefile: typescriptOutput,
    }).code,
  });
}

process.stdout.write(`${check ? 'checked' : refresh === 'false' ? 'loaded' : 'compiled'} ${scenarios.length * 6} generated showcase artifacts\n`);
