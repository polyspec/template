#!/usr/bin/env node
// Verifies canonical AST artifact refresh, integrity and failed-build preservation.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileAst } from '../tools/compiler/ast-artifact.mjs';

const directory = mkdtempSync(join(tmpdir(), 'template-ast-artifact-'));
const source = join(directory, 'source');
const output = join(directory, 'artifact');
mkdirSync(source);

try {
  writeFileSync(join(source, 'layout.tpl'), '<h1>{= title}</h1>');
  const first = compileAst({ root: source, output, entry: 'layout.tpl', refresh: 'dev' });
  assert.equal(first.schema, 3);
  assert.deepEqual(Object.keys(first.files), ['layout.tpl']);
  const manifestBytes = readFileSync(join(output, 'manifest.json'));

  const unchanged = compileAst({ root: source, output, entry: 'layout.tpl', refresh: 'true' });
  assert.equal(unchanged.sourceDigest, first.sourceDigest);
  assert.deepEqual(readFileSync(join(output, 'manifest.json')), manifestBytes);

  const staleCompiler = JSON.parse(manifestBytes);
  staleCompiler.compilerDigest = 'stale';
  writeFileSync(join(output, 'manifest.json'), JSON.stringify(staleCompiler));
  const rebuilt = compileAst({ root: source, output, entry: 'layout.tpl', refresh: 'true' });
  assert.notEqual(rebuilt.compilerDigest, 'stale');

  writeFileSync(join(source, 'layout.tpl'), '{? broken}');
  assert.throws(() => compileAst({ root: source, output, entry: 'layout.tpl', refresh: 'true' }));
  assert.deepEqual(readFileSync(join(output, 'manifest.json')), manifestBytes);

  rmSync(source, { recursive: true });
  assert.equal(compileAst({ root: source, output, entry: 'ignored.tpl', refresh: 'false' }).sourceDigest, first.sourceDigest);
  writeFileSync(join(output, first.files['layout.tpl'].path), 'corrupt');
  assert.throws(() => compileAst({ root: source, output, entry: 'ignored.tpl', refresh: 'false' }), /corrupt/);
} finally {
  rmSync(directory, { recursive: true, force: true });
}

process.stdout.write('AST artifact: refresh, integrity and failed-build preservation passed\n');
