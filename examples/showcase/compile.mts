#!/usr/bin/env node
// Compiles each showcase source graph through the product AST compiler.
import { join } from 'node:path';
import { root } from '../../tests/runner/drivers.mts';
import { compileAst } from '../../packages/compiler/src/ast-artifact.mts';
import { isObject, object, readJson, text } from './json.mts';
import { scenarioIds } from '../../scripts/showcase-documents.mts';

const scenariosRoot = join(root, 'examples/site/scenarios');
const argv = process.argv.slice(2);
const refreshAt = argv.indexOf('--refresh');
const refresh = argv[refreshAt + 1];
if (refreshAt < 0 || refresh === undefined || argv.length !== 2) {
  throw new Error('usage: compile.mts --refresh dev|true|false');
}
const scenarios = scenarioIds(scenariosRoot);

for (const id of scenarios) {
  const directory = join(scenariosRoot, id);
  const targetName = text(object(readJson(join(directory, 'scenario.json')), `${id}/scenario.json`).target, `${id}/scenario.json: target`);
  // The target resolves through a template definition (build.mts checks the same contract).
  const target = object(readJson(join(directory, 'define.json')), `${id}/define.json`)[targetName];
  const entry = typeof target === 'string' ? target : isObject(target) ? text(target.template, `${id}/define.json: ${targetName}.template`) : undefined;
  if (entry === undefined) throw new Error(`${id}: the target ${targetName} has no template definition in define.json`);
  compileAst({
    root: directory,
    output: join(directory, 'compiled/ast'),
    entry,
    refresh,
    typeManifest: join(directory, 'types.json'),
  });
}
process.stdout.write(`compiled ${scenarios.length} canonical AST source graphs with refresh=${refresh}\n`);
