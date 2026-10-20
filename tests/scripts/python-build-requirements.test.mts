// Tests packages/python/build-requirements.txt (T26.7-7), which `make install` downloads with
// `pip download --require-hashes` into var/python/wheelhouse: every requirement line is a pinned `name==version` with
// one `--hash=sha256:` digest, and the pinned requirements are exactly the build-system requires of pyproject.toml.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readToml, tomlArray, tomlString, tomlTable } from '../../scripts/toml.mts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('every requirement is pinned by version and one SHA-256 digest, and the pins are the build-system requires of pyproject.toml', () => {
  const lines = readFileSync(join(root, 'packages/python/build-requirements.txt'), 'utf8').split('\n').filter(line => line !== '' && !line.startsWith('#'));
  assert.ok(lines.length > 0, 'packages/python/build-requirements.txt pins no requirement');
  for (const line of lines) {
    assert.match(line, /^[A-Za-z0-9._-]+==[^ ]+ --hash=sha256:[0-9a-f]{64}$/, `packages/python/build-requirements.txt has a line that is not name==version --hash=sha256:<digest>: ${line}`);
  }
  const pinned = lines.map(line => line.slice(0, line.indexOf(' '))).sort((a, b) => a.localeCompare(b));
  const pyproject = readToml(join(root, 'packages/python/pyproject.toml'));
  const required = tomlArray(tomlTable(pyproject['build-system'], '[build-system] of packages/python/pyproject.toml').requires, 'requires of [build-system] in packages/python/pyproject.toml')
    .map(item => tomlString(item, 'a requirement of [build-system] in packages/python/pyproject.toml'))
    .sort((a, b) => a.localeCompare(b));
  assert.deepEqual(pinned, required);
});
