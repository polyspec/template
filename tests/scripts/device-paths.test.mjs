// Tests that no tracked script, test or recipe reaches a stream through a device path (T19.8-1): /dev/stdin, /dev/fd
// and /proc/self open the file of a descriptor on Linux and duplicate the descriptor on macOS, so Linux cannot open a
// socket through them, and Node.js passes the `input` of a child through a socket. A file of the run or `-` works on
// every system.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SELF = 'tests/scripts/device-paths.test.mjs';
const SOURCES = spawnSync('git', ['ls-files', '*.mjs', '*.js', '*.cjs', '*.ts', '*.sh', 'Makefile', '*.mk', '.github/workflows/*.yml'], { cwd: ROOT, encoding: 'utf8' })
  .stdout.split('\n').filter(file => file && file !== SELF);
const DEVICE_PATH = /\/dev\/(?:stdin|stdout|stderr|fd\/)|\/proc\/self\//;

test('no tracked source reaches a stream through a device path', () => {
  assert.ok(SOURCES.length > 0, 'git ls-files listed no source');
  const found = [];
  for (const file of SOURCES) {
    readFileSync(path.join(ROOT, file), 'utf8').split('\n').forEach((line, index) => {
      if (DEVICE_PATH.test(line)) found.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(found, [], 'use a file of the run instead of a device path');
});
