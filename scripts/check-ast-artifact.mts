#!/usr/bin/env node
// Verifies canonical AST artifact refresh, integrity and failed-build preservation.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileAst } from '../packages/compiler/src/ast-artifact.mts';
import type { AstFile, AstManifest } from '../packages/compiler/src/documents.mts';
import { artifactManifestDocument } from './artifact-manifest.mts';
import { jsonDocument } from './json-document.mts';

// The AST of one template of an artifact, as far as this check reads it: the types of its body nodes.
const templateAstDocument = jsonDocument<{ body: { type: string }[] }>('template AST', {
  type: 'object',
  required: ['body'],
  properties: { body: { type: 'array', items: { type: 'object', required: ['type'], properties: { type: { type: 'string' } } } } },
});

/** The file `name` of the artifact `manifest`, or an error naming it. */
function artifactFile(manifest: AstManifest, name: string): AstFile {
  const file = manifest.files[name];
  if (file === undefined) throw new Error(`the AST manifest lists no file ${name}`);
  return file;
}

const directory = mkdtempSync(join(tmpdir(), 'template-ast-artifact-'));
const source = join(directory, 'source');
const output = join(directory, 'artifact');
mkdirSync(source);

try {
  writeFileSync(join(source, 'layout.tpl'), '<h1>{= title}</h1>');
  const first = compileAst({ root: source, output, entry: 'layout.tpl', refresh: 'dev' });
  assert.deepEqual(artifactFile(first, 'layout.tpl').lines, [0]);
  assert.equal(first.schema, 3);
  assert.equal(first.delimiters, null);
  assert.deepEqual(Object.keys(first.files), ['layout.tpl']);
  const manifestBytes = readFileSync(join(output, 'manifest.json'));

  const unchanged = compileAst({ root: source, output, entry: 'layout.tpl', refresh: 'true' });
  assert.equal(unchanged.sourceDigest, first.sourceDigest);
  assert.deepEqual(readFileSync(join(output, 'manifest.json')), manifestBytes);

  const staleCompiler = artifactManifestDocument.parse(manifestBytes.toString('utf8'), 'the AST manifest of the first compilation');
  staleCompiler.compilerDigest = 'stale';
  writeFileSync(join(output, 'manifest.json'), JSON.stringify(staleCompiler));
  const rebuilt = compileAst({ root: source, output, entry: 'layout.tpl', refresh: 'true' });
  assert.notEqual(rebuilt.compilerDigest, 'stale');

  writeFileSync(join(source, 'layout.tpl'), '<h1>[[= title]]</h1>');
  const custom = compileAst({ root: source, output, entry: 'layout.tpl', refresh: 'true', delimiters: '[]' });
  assert.equal(custom.delimiters, '[]');
  assert.notEqual(custom.sourceDigest, first.sourceDigest);
  const customAst = templateAstDocument.read(join(output, artifactFile(custom, 'layout.tpl').path));
  assert.equal(customAst.body[1]?.type, 'Echo');
  const customBytes = readFileSync(join(output, 'manifest.json'));

  compileAst({ root: source, output, entry: 'layout.tpl', refresh: 'true', delimiters: '[]' });
  assert.deepEqual(readFileSync(join(output, 'manifest.json')), customBytes);

  writeFileSync(join(source, 'layout.tpl'), "[[+ 'notes']]");
  writeFileSync(join(source, 'notes'), 'extensionless');
  const dependency = compileAst({ root: source, output, entry: 'layout.tpl', refresh: 'dev', delimiters: '[]' });
  assert.deepEqual(Object.keys(dependency.files), ['layout.tpl', 'notes']);
  const dependencyBytes = readFileSync(join(output, 'manifest.json'));

  writeFileSync(join(source, 'layout.tpl'), '{? broken}');
  assert.throws(() => compileAst({ root: source, output, entry: 'layout.tpl', refresh: 'true' }));
  assert.deepEqual(readFileSync(join(output, 'manifest.json')), dependencyBytes);

  rmSync(source, { recursive: true });
  assert.equal(compileAst({ root: source, output, entry: 'ignored.tpl', refresh: 'false' }).sourceDigest, dependency.sourceDigest);
  writeFileSync(join(output, artifactFile(dependency, 'layout.tpl').path), 'corrupt');
  assert.throws(() => compileAst({ root: source, output, entry: 'ignored.tpl', refresh: 'false' }), /AST artifact file is missing or changed: layout.tpl/);
} finally {
  rmSync(directory, { recursive: true, force: true });
}

process.stdout.write('AST artifact: refresh, integrity and failed-build preservation passed\n');
