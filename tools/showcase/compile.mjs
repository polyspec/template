#!/usr/bin/env node
// Compiles each showcase source graph through the product AST compiler.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { root } from '../../tests/runner/drivers.mjs';
import { compileAst } from '../compiler/ast-artifact.mjs';

const scenariosRoot = join(root, 'examples/site/scenarios');
const argv = process.argv.slice(2);
const refreshAt = argv.indexOf('--refresh');
if (refreshAt < 0 || !argv[refreshAt + 1] || argv.length !== 2) {
  throw new Error('usage: compile.mjs --refresh dev|true|false');
}
const refresh = argv[refreshAt + 1];
const scenarios = readdirSync(scenariosRoot, { withFileTypes: true })
  .filter(item => item.isDirectory() && existsSync(join(scenariosRoot, item.name, 'scenario.json')))
  .map(item => item.name).sort();

for (const id of scenarios) {
  const directory = join(scenariosRoot, id);
  const metadata = JSON.parse(readFileSync(join(directory, 'scenario.json'), 'utf8'));
  const definitions = JSON.parse(readFileSync(join(directory, 'define.json'), 'utf8'));
  const target = definitions[metadata.target];
  const entry = typeof target === 'string' ? target : target?.template ?? metadata.target;
  compileAst({
    root: directory,
    output: join(directory, 'compiled/ast'),
    entry,
    refresh,
    typeManifest: join(directory, 'types.json'),
  });
}
process.stdout.write(`compiled ${scenarios.length} canonical AST source graphs with refresh=${refresh}\n`);
