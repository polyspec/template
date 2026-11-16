// Tests the runtime package of the generated TypeScript (docs/spec/compiler.md, Transition): until the TypeScript backend
// moves to typed programs, its generated execution imports the legacy TypeScript runtime by its package name
// `@polyspec/template-legacy`, the package that the showcase adapter and the checks import, so one process holds one
// runtime and the classes of its errors are one class.
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { compileAst } from '../../packages/compiler/src/ast-artifact.mts';
import { compileSource } from '../../packages/compiler/src/compiler.mts';
import { deriveTypeManifest } from '../../packages/compiler/src/type-manifest.mts';
import { parse } from '../../legacy/packages/ts/dist/index.mjs';
import { temporaryDirectory } from '../../scripts/temporary-workspace.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CASE = path.join(ROOT, 'tests/cases/expr/lazy-long-operands');

test('the generated TypeScript imports the runtime @polyspec/template-legacy', { timeout: 60_000 }, t => {
  const directory = temporaryDirectory('generated-ts-runtime');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const types = path.join(directory, 'types.json');
  writeFileSync(types, JSON.stringify(deriveTypeManifest(new Map([['input.tpl', parse(readFileSync(path.join(CASE, 'input.tpl')), 'input.tpl')]]), {})));
  compileAst({ root: CASE, output: path.join(directory, 'ast'), entry: 'input.tpl', refresh: 'dev', typeManifest: types, delimiters: null });
  const source = compileSource(path.join(directory, 'ast', 'manifest.json'), types, 'ts');
  const packages = [...source.matchAll(/^import [^;]* from '([^']+)';$/gm)].map(match => match[1]);
  assert.deepEqual(packages, ['@polyspec/template-legacy']);
});
