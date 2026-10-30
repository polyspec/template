#!/usr/bin/env node
// Compiles every showcase source graph through the product generated compiler.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { transformSync } from 'esbuild';
import { root } from '../../tests/runner/drivers.mts';
import { compileFiles, compileSource } from '../../packages/compiler/src/compiler.mts';
import { generatedCompilerDigest } from '../../packages/compiler/src/compiler-digest.mts';
import { typescriptDeliveryDigest } from './delivery-digest.mts';
import { compileGeneratedArtifact } from '../../packages/compiler/src/generated-artifact.mts';
import { showcasePhpNamespace } from './php-namespace.mts';
import { generatedLanguages, generatedOutput } from './generated-output.mts';
import { scenarioIds } from '../../scripts/showcase-documents.mts';

const scenariosRoot = join(root, 'examples/site/scenarios');
const argv = process.argv.slice(2);
const refreshAt = argv.indexOf('--refresh');
const check = argv.includes('--check');
const refresh = argv[refreshAt + 1];
if (refreshAt < 0 || refresh === undefined || argv.some((value, index) => index !== refreshAt && index !== refreshAt + 1 && value !== '--check')) {
  throw new Error('usage: compile-generated.mts --refresh dev|true|false [--check]');
}
const scenarios = scenarioIds(scenariosRoot);

for (const id of scenarios) {
  const scenario = join(scenariosRoot, id);
  const graph = join(scenario, 'compiled/ast/manifest.json');
  const manifest = join(scenario, 'types.json');
  for (const language of generatedLanguages) {
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

process.stdout.write(`${check ? 'checked' : refresh === 'false' ? 'loaded' : 'compiled'} ${scenarios.length * (generatedLanguages.length + 1)} generated showcase artifacts\n`);
