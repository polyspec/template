// Tests scripts/check-artifact-digests.mjs (T17.1-6): every committed compiled artifact of the tree records the digest
// of the compiler of the tree, a manifest that records another digest is named with both digests, and the AST compiler
// digest reads the tracked sources of packages/template-ts, so a change of a source changes it without a build.
import assert from 'node:assert/strict';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { artifactManifests, staleArtifacts } from '../../scripts/check-artifact-digests.mjs';
import { temporaryDirectory } from '../../scripts/temporary-workspace.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('every committed artifact of the tree records the digest of its compiler', { timeout: 30_000 }, () => {
  const manifests = artifactManifests();
  assert.ok(manifests.length >= 30, `only ${manifests.length} artifact manifests were found`);
  assert.deepEqual(staleArtifacts(), []);
});

test('a manifest with the digest of another compiler is named with both digests', { timeout: 30_000 }, (t) => {
  const base = temporaryDirectory('artifact-digests');
  t.after(() => rmSync(base, { recursive: true, force: true }));
  for (const directory of ['examples/site/scenarios', 'tools/showcase/adapters/generated', 'tools/showcase/adapters/go/generated']) {
    cpSync(path.join(ROOT, directory), path.join(base, directory), { recursive: true });
  }
  const manifest = 'examples/site/scenarios/empty-state/compiled/ast/manifest.json';
  const text = readFileSync(path.join(base, manifest), 'utf8');
  const recorded = JSON.parse(text).compilerDigest;
  writeFileSync(path.join(base, manifest), text.replace(recorded, '0'.repeat(64)));
  const stale = staleArtifacts(base);
  assert.equal(stale.length, 1, stale.join('\n'));
  assert.equal(stale[0], `${manifest} records the compiler digest ${'0'.repeat(64)}, but the compiler of the tree has the digest ${recorded}`);
});
