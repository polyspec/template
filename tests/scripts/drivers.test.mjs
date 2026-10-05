// Tests the preparation of the conformance drivers (tests/runner/drivers.mjs, T19.6): a run builds the CLI of each
// language every time, also when a binary is present, because the binary may be built from older sources; each build
// does nothing when its inputs are unchanged. The drivers are copied into a directory whose packages hold a binary.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('prepare builds the CLI of a language also when its binary is present', async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'template-drivers-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const file of ['tests/runner/drivers.mjs', 'scripts/test-progress/step.mjs']) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    copyFileSync(path.join(ROOT, file), path.join(directory, file));
  }
  mkdirSync(path.join(directory, 'packages/template-go'), { recursive: true });
  writeFileSync(path.join(directory, 'packages/template-go/template'), 'a binary built from older sources\n');
  const { drivers, prepare } = await import(pathToFileURL(path.join(directory, 'tests/runner/drivers.mjs')).href);
  let builds = 0;
  drivers.go.build = () => { builds++; };
  prepare('go');
  prepare('go');
  assert.equal(builds, 2, 'prepare used the present binary without building it');
});
