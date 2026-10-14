// Tests the layout of the generated PHP (T25.2): every line of the program of the case expr/lazy-long-operands fits in
// the 120 columns of PSR-12, its operator chains of &&, || and ?? and its ternary are split one operand per line, and
// the split program still evaluates the right operand only when it is needed (EXP-30, EXP-31): the case renders its
// expected output through the generated PHP conformance runner, where an evaluated right operand fails with
// E_RUNTIME_DIV_ZERO.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { compileAst } from '../../packages/compiler/src/ast-artifact.mts';
import { compileFiles } from '../../packages/compiler/src/compiler.mts';
import { deriveTypeManifest } from '../../packages/compiler/src/type-manifest.mts';
import { parse } from '../../packages/ts/dist/index.mjs';
import { temporaryDirectory } from '../../scripts/temporary-workspace.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CASE = path.join(ROOT, 'tests/cases/expr/lazy-long-operands');

test('the generated PHP of long operator chains fits in 120 columns, one operand per line', t => {
  const directory = temporaryDirectory('generated-php-layout');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const types = path.join(directory, 'types.json');
  writeFileSync(types, JSON.stringify(deriveTypeManifest(new Map([['input.tpl', parse(readFileSync(path.join(CASE, 'input.tpl')), 'input.tpl')]]), {})));
  compileAst({ root: CASE, output: path.join(directory, 'ast'), entry: 'input.tpl', refresh: 'dev', typeManifest: types, delimiters: null });
  const files = compileFiles(path.join(directory, 'ast', 'manifest.json'), types, 'php', { phpNamespace: 'Polyspec\\Generated\\Layout' });
  for (const [name, source] of Object.entries(files)) {
    for (const [index, line] of source.split('\n').entries()) assert.ok(line.length <= 120, `${name}:${index + 1} has ${line.length} columns`);
  }
  const program = files['GeneratedTemplates.php'];
  assert.ok(program !== undefined, `the PHP target wrote no GeneratedTemplates.php, only ${Object.keys(files).join(', ')}`);
  const templates = program.split('\n').map(line => line.trimStart());
  for (const operator of ['&& ', '|| ', '?? ', '? ', ': ']) {
    assert.ok(templates.some(line => line.startsWith(operator)), `no line of GeneratedTemplates.php starts with the operand "${operator}"`);
  }
});

test('the split program evaluates the right operand only when it is needed', { timeout: 300_000 }, () => {
  const run = spawnSync(process.execPath, [path.join(ROOT, 'tests/runner/conformance-generated-php.mts'), '--case', 'expr/lazy-long-operands'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  assert.match(run.stdout, /1\/1 PHP generated conformance cases passed/);
});
