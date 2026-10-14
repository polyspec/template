#!/usr/bin/env node
// Verifies canonical AST artifact refresh, integrity and failed-build preservation.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileAst } from '../packages/compiler/ast-artifact.mjs';
import { artifactManifestDocument } from './artifact-manifest.mts';
import { jsonDocument } from './json-document.mts';

// The AST of one template of an artifact, as far as this check reads it: the types of its body nodes.
const templateAstDocument = jsonDocument<{ body: { type: string }[] }>('template AST', {
  type: 'object',
  required: ['body'],
  properties: { body: { type: 'array', items: { type: 'object', required: ['type'], properties: { type: { type: 'string' } } } } },
});

/** The manifest of an AST artifact, as far as this check reads it. */
interface AstManifest {
  schema: number;
  delimiters: string | null;
  sourceDigest: string;
  compilerDigest: string;
  files: Record<string, { path: string; lines: number[] }>;
}

const astManifestDocument = jsonDocument<AstManifest>('AST artifact manifest', {
  type: 'object',
  required: ['schema', 'delimiters', 'sourceDigest', 'compilerDigest', 'files'],
  properties: {
    schema: { type: 'integer' },
    delimiters: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    sourceDigest: { type: 'string' },
    compilerDigest: { type: 'string' },
    files: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        required: ['path', 'lines'],
        properties: { path: { type: 'string' }, lines: { type: 'array', items: { type: 'integer' } } },
      },
    },
  },
});

// compileAst of packages/compiler declares no return type. The manifest that it returns is the JSON document that it
// writes as manifest.json, so the check reads the returned manifest through the schema of that document.
function compile(options: Parameters<typeof compileAst>[0]): AstManifest {
  return astManifestDocument.check(compileAst(options), 'the manifest that compileAst returned');
}

/** The file `name` of the artifact `manifest`, or an error naming it. */
function artifactFile(manifest: AstManifest, name: string): { path: string; lines: number[] } {
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
  const first = compile({ root: source, output, entry: 'layout.tpl', refresh: 'dev' });
  assert.deepEqual(artifactFile(first, 'layout.tpl').lines, [0]);
  assert.equal(first.schema, 3);
  assert.equal(first.delimiters, null);
  assert.deepEqual(Object.keys(first.files), ['layout.tpl']);
  const manifestBytes = readFileSync(join(output, 'manifest.json'));

  const unchanged = compile({ root: source, output, entry: 'layout.tpl', refresh: 'true' });
  assert.equal(unchanged.sourceDigest, first.sourceDigest);
  assert.deepEqual(readFileSync(join(output, 'manifest.json')), manifestBytes);

  const staleCompiler = artifactManifestDocument.parse(manifestBytes.toString('utf8'), 'the AST manifest of the first compilation');
  staleCompiler.compilerDigest = 'stale';
  writeFileSync(join(output, 'manifest.json'), JSON.stringify(staleCompiler));
  const rebuilt = compile({ root: source, output, entry: 'layout.tpl', refresh: 'true' });
  assert.notEqual(rebuilt.compilerDigest, 'stale');

  writeFileSync(join(source, 'layout.tpl'), '<h1>[[= title]]</h1>');
  const custom = compile({ root: source, output, entry: 'layout.tpl', refresh: 'true', delimiters: '[]' });
  assert.equal(custom.delimiters, '[]');
  assert.notEqual(custom.sourceDigest, first.sourceDigest);
  const customAst = templateAstDocument.read(join(output, artifactFile(custom, 'layout.tpl').path));
  assert.equal(customAst.body[1]?.type, 'Echo');
  const customBytes = readFileSync(join(output, 'manifest.json'));

  compileAst({ root: source, output, entry: 'layout.tpl', refresh: 'true', delimiters: '[]' });
  assert.deepEqual(readFileSync(join(output, 'manifest.json')), customBytes);

  writeFileSync(join(source, 'layout.tpl'), "[[+ 'notes']]");
  writeFileSync(join(source, 'notes'), 'extensionless');
  const dependency = compile({ root: source, output, entry: 'layout.tpl', refresh: 'dev', delimiters: '[]' });
  assert.deepEqual(Object.keys(dependency.files), ['layout.tpl', 'notes']);
  const dependencyBytes = readFileSync(join(output, 'manifest.json'));

  writeFileSync(join(source, 'layout.tpl'), '{? broken}');
  assert.throws(() => compileAst({ root: source, output, entry: 'layout.tpl', refresh: 'true' }));
  assert.deepEqual(readFileSync(join(output, 'manifest.json')), dependencyBytes);

  rmSync(source, { recursive: true });
  assert.equal(compile({ root: source, output, entry: 'ignored.tpl', refresh: 'false' }).sourceDigest, dependency.sourceDigest);
  writeFileSync(join(output, artifactFile(dependency, 'layout.tpl').path), 'corrupt');
  assert.throws(() => compileAst({ root: source, output, entry: 'ignored.tpl', refresh: 'false' }), /corrupt/);
} finally {
  rmSync(directory, { recursive: true, force: true });
}

process.stdout.write('AST artifact: refresh, integrity and failed-build preservation passed\n');
