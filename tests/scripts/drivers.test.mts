// Tests the preparation of the conformance drivers (tests/runner/drivers.mts, T19.6): a run builds the CLI of each
// language every time, also when a binary is present, because the binary may be built from older sources; each build
// does nothing when its inputs are unchanged. The drivers are copied into a directory whose packages hold a binary.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { importDriverCopy } from './driver-copy.mts';
import { copyDriverFiles, driverModules } from './driver-fixture.mts';

test('the driver fixture reaches the modules that the drivers import through other modules', () => {
  const modules = driverModules();
  assert.ok(modules.includes('scripts/python-toolchain.mts'), 'the import walk did not reach the Python toolchain');
  assert.ok(modules.includes('scripts/toml.mts'), 'the import walk did not reach the modules of the Python toolchain');
});

test('prepare builds the CLI of a language also when its binary is present', async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'template-drivers-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  copyDriverFiles(directory);
  mkdirSync(path.join(directory, 'packages/go'), { recursive: true });
  writeFileSync(path.join(directory, 'packages/go/template'), 'a binary built from older sources\n');
  const { drivers, prepare } = await importDriverCopy(directory);
  let builds = 0;
  drivers.go.build = () => { builds++; };
  prepare('go');
  prepare('go');
  assert.equal(builds, 2, 'prepare used the present binary without building it');
});
