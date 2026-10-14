// Tests the preparation of the conformance drivers (tests/runner/drivers.mts, T19.6): a run builds the CLI of each
// language every time, also when a binary is present, because the binary may be built from older sources; each build
// does nothing when its inputs are unchanged. The drivers are copied into a directory whose packages hold a binary.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { DRIVER_FILES, copyDriverFiles } from './driver-fixture.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('the driver fixture lists every module that the drivers import', () => {
  const pending = ['tests/runner/drivers.mts'];
  const reached = new Set<string>();
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (reached.has(file)) continue;
    reached.add(file);
    const source = readFileSync(path.join(ROOT, file), 'utf8');
    for (const [statement, specifier] of source.matchAll(/^import [^;]*?from '(\.[^']+)';/gm)) {
      if (specifier === undefined) throw new Error(`${file}: the import has no relative specifier: ${statement}`);
      pending.push(path.normalize(path.join(path.dirname(file), specifier)));
    }
  }
  assert.ok(reached.has('scripts/python-toolchain.mts'), 'the import walk did not reach the Python toolchain');
  assert.deepEqual([...reached].filter(file => !DRIVER_FILES.includes(file)), []);
});

test('prepare builds the CLI of a language also when its binary is present', async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'template-drivers-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  copyDriverFiles(directory);
  mkdirSync(path.join(directory, 'packages/go'), { recursive: true });
  writeFileSync(path.join(directory, 'packages/go/template'), 'a binary built from older sources\n');
  const { drivers, prepare } = await import(pathToFileURL(path.join(directory, 'tests/runner/drivers.mts')).href);
  let builds = 0;
  drivers.go.build = () => { builds++; };
  prepare('go');
  prepare('go');
  assert.equal(builds, 2, 'prepare used the present binary without building it');
});
