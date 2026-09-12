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
  assert.deepEqual(first.files['layout.tpl'].lines, [0]);
  assert.equal(first.schema, 3);
  assert.equal(first.delimiters, null);
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

  writeFileSync(join(source, 'layout.tpl'), '<h1>[[= title]]</h1>');
  const custom = compileAst({ root: source, output, entry: 'layout.tpl', refresh: 'true', delimiters: '[]' });
  assert.equal(custom.delimiters, '[]');
  assert.notEqual(custom.sourceDigest, first.sourceDigest);
  const customAst = JSON.parse(readFileSync(join(output, custom.files['layout.tpl'].path), 'utf8'));
  assert.equal(customAst.body[1].type, 'Echo');
  const customBytes = readFileSync(join(output, 'manifest.json'));

  const customUnchanged = compileAst({ root: source, output, entry: 'layout.tpl', refresh: 'true', delimiters: '[]' });
  assert.deepEqual(readFileSync(join(output, 'manifest.json')), customBytes);

  writeFileSync(join(source, 'layout.tpl'), '{? broken}');
  assert.throws(() => compileAst({ root: source, output, entry: 'layout.tpl', refresh: 'true' }));
  assert.deepEqual(readFileSync(join(output, 'manifest.json')), customBytes);

  rmSync(source, { recursive: true });
  assert.equal(compileAst({ root: source, output, entry: 'ignored.tpl', refresh: 'false' }).sourceDigest, custom.sourceDigest);
  writeFileSync(join(output, custom.files['layout.tpl'].path), 'corrupt');
  assert.throws(() => compileAst({ root: source, output, entry: 'ignored.tpl', refresh: 'false' }), /corrupt/);
} finally {
  rmSync(directory, { recursive: true, force: true });
}

process.stdout.write('AST artifact: refresh, integrity and failed-build preservation passed\n');
