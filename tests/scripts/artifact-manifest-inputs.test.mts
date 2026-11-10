// An artifact manifest records the inputs and the files of the artifact, never the compiler that wrote it (T27.1-78): which
// compiler is installed is decided by the package manager at installation, so a release install and a checkout of one
// version write the same manifest for the same inputs, and refresh true and check judge the inputs and the files only.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { compileAst } from '../../packages/compiler/src/ast-artifact.mts';
import { compileGeneratedArtifact, generatedManifestPath } from '../../packages/compiler/src/generated-artifact.mts';

const temporary = mkdtempSync(join(tmpdir(), 'polyspec-artifact-manifest-'));
after(() => rmSync(temporary, { recursive: true, force: true }));

const sources = join(temporary, 'templates');
mkdirSync(sources);
writeFileSync(join(sources, 'page.tpl'), 'Hello\n');
const types = join(temporary, 'types.json');
writeFileSync(types, '');
const graph = join(temporary, 'ast');
const graphManifest = join(graph, 'manifest.json');
compileAst({ root: sources, output: graph, entry: 'page.tpl', refresh: 'dev', typeManifest: types });

/** The JSON object of a manifest file. */
function read(path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  assert.ok(typeof value === 'object' && value !== null && !Array.isArray(value), `${path} holds a JSON object`);
  return Object.fromEntries(Object.entries(value));
}
const never = (): string => { throw new Error('the artifact is current, so nothing compiles'); };

test('the AST manifest records its inputs and files and no compiler (T27.1-78)', { timeout: 30_000 }, () => {
  const manifest = read(graphManifest);
  assert.deepEqual(Object.keys(manifest).sort(), ['contractDigest', 'delimiters', 'entry', 'files', 'mode', 'schema', 'sourceDigest', 'target', 'typeDigest']);
  assert.equal(manifest.schema, 4);
});

test('refresh true reuses an AST artifact of the same inputs and rebuilds one of schema 3 (T27.1-78)', { timeout: 30_000 }, () => {
  const bytes = readFileSync(graphManifest, 'utf8');
  compileAst({ root: sources, output: graph, entry: 'page.tpl', refresh: 'true', typeManifest: types });
  assert.equal(readFileSync(graphManifest, 'utf8'), bytes, 'the same inputs reuse the artifact');
  writeFileSync(graphManifest, JSON.stringify({ ...read(graphManifest), schema: 3, compilerDigest: '0'.repeat(64) }));
  compileAst({ root: sources, output: graph, entry: 'page.tpl', refresh: 'true', typeManifest: types });
  assert.equal(readFileSync(graphManifest, 'utf8'), bytes, 'a schema 3 manifest is stale and rebuilt');
});

test('the generated manifest records its inputs and files, refresh true judges the inputs only, and check compares the bytes (T27.1-78)', { timeout: 30_000 }, () => {
  const output = join(temporary, 'page.ts');
  const options = { graphPath: graphManifest, typeManifestPath: types, target: 'ts', output };
  compileGeneratedArtifact({ ...options, refresh: 'dev', compile: () => 'export {};\n' });
  const manifest = read(generatedManifestPath(output));
  assert.deepEqual(Object.keys(manifest).sort(), ['contractDigest', 'entry', 'files', 'mode', 'schema', 'sourceDigest', 'target', 'typeDigest']);
  assert.equal(manifest.schema, 4);
  compileGeneratedArtifact({ ...options, refresh: 'true', compile: never });
  compileGeneratedArtifact({ ...options, refresh: 'dev', check: true, compile: () => 'export {};\n' });
  assert.throws(() => compileGeneratedArtifact({ ...options, refresh: 'dev', check: true, compile: () => 'export {} ;\n' }), /compiler artifact is stale/);
});
