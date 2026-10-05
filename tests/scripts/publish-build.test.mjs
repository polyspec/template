// Tests scripts/publish-build.mjs (T19.6-1): an unchanged build keeps the published file, so its first run after a
// build is not the first run of a new file, and a changed build replaces it with the mode of the source.
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { publishBuild } from '../../scripts/publish-build.mjs';

test('an unchanged build keeps the published file and a changed build replaces it', (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'template-publish-build-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'target/release/template');
  const destination = path.join(directory, 'var/build/template-rust');
  mkdirSync(path.dirname(source), { recursive: true });
  // Like cargo, each build writes a new file, also with the same bytes.
  const build = (text) => {
    rmSync(source, { force: true });
    writeFileSync(source, text);
    chmodSync(source, 0o755);
  };
  build('build 1');
  assert.equal(publishBuild(source, destination), true);
  const first = statSync(destination);
  assert.equal(first.mode & 0o777, 0o755);
  build('build 1');
  assert.equal(publishBuild(source, destination), false);
  assert.equal(statSync(destination).ino, first.ino, 'an unchanged build replaced the published file');
  build('build 2');
  assert.equal(publishBuild(source, destination), true);
  assert.equal(readFileSync(destination, 'utf8'), 'build 2');
  assert.throws(() => publishBuild(path.join(directory, 'missing'), destination), /missing does not exist; build it first/);
});
