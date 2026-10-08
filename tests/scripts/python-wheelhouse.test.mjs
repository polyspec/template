// Tests scripts/python-wheelhouse.mjs (T22.4-20-5): the pinned build requirements equal the build-system requirements of
// pyproject.toml, a download is kept only with its pinned digest, a present file is not downloaded again, and a missing
// file fails with the fix.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildRequirements, ensureWheelhouse, requireWheelhouse } from '../../scripts/python-wheelhouse.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const bytes = new TextEncoder().encode('wheel');
const requirement = { name: 'demo', version: '1.0', filename: 'demo-1.0-py3-none-any.whl', url: 'https://example.invalid/demo.whl', sha256: createHash('sha256').update(bytes).digest('hex') };

function directory(t) {
  const path = mkdtempSync(join(tmpdir(), 'template-wheelhouse-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

test('the pinned requirements are the build-system requirements of pyproject.toml', () => {
  const pyproject = readFileSync(join(root, 'packages/template-python/pyproject.toml'), 'utf8');
  const required = /^requires = \[(.*)\]$/m.exec(pyproject)[1].split(',').map(item => item.trim().replace(/^"|"$/g, ''));
  assert.deepEqual(buildRequirements().map(item => `${item.name}==${item.version}`), required);
  for (const item of buildRequirements()) {
    assert.equal(item.filename, `${item.name}-${item.version}-py3-none-any.whl`);
    assert.match(item.sha256, /^[0-9a-f]{64}$/);
  }
});

test('a download with the pinned digest is written, and a present file is not downloaded again', async t => {
  const path = directory(t);
  let downloads = 0;
  const download = async () => { downloads += 1; return bytes; };
  assert.deepEqual(await ensureWheelhouse([requirement], path, download), [requirement.filename]);
  assert.deepEqual(await ensureWheelhouse([requirement], path, download), []);
  assert.equal(downloads, 1);
  assert.deepEqual(readdirSync(path), [requirement.filename]);
});

test('a download with another digest fails and writes no file', async t => {
  const path = directory(t);
  await assert.rejects(ensureWheelhouse([requirement], path, async () => new TextEncoder().encode('other')), error => error.message.includes('pins') && error.message.includes(requirement.sha256));
  assert.deepEqual(readdirSync(path), []);
});

test('a missing or changed file fails with the fix', async t => {
  const path = directory(t);
  assert.throws(() => requireWheelhouse([requirement], path), /is missing; run make install/);
  writeFileSync(join(path, requirement.filename), 'changed');
  assert.throws(() => requireWheelhouse([requirement], path), /pins .*run make install/);
  rmSync(join(path, requirement.filename));
  await ensureWheelhouse([requirement], path, async () => bytes);
  assert.equal(requireWheelhouse([requirement], path), path);
  assert.ok(existsSync(join(path, requirement.filename)));
});
