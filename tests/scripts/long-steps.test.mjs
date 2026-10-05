// Tests that the long-running steps of the checks, the build of a driver and the commands of the
// package install checks, have no time limit: each prints its start and its result with its elapsed time
// and is judged by its exit status.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { stopProcessGroup } from '../../scripts/process-group.mjs';
import { slowCommandPath } from './slow-command.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Runs `source` as an ES module in a new process from the repository root.
function module(source, env = process.env) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', source], { cwd: ROOT, env, encoding: 'utf8' });
}

test('a driver build that runs longer than a small limit passes by its exit code', () => {
  const drivers = JSON.stringify(path.join(ROOT, 'tests/runner/drivers.mjs'));
  const slow = module(`import { build } from ${drivers}; build('slow', process.execPath, ['-e', 'setTimeout(() => console.log("built"), 1500)'], process.cwd());`);
  assert.equal(slow.status, 0, slow.stderr);
  assert.match(slow.stderr, /^▶ build slow: \S+ -e .*\nbuilt\n✔ build slow: \S+ -e .* \((?:1\.[5-9]|[2-9]\.\d|\d{2,}\.\d)s\)\n$/);
  assert.equal(slow.stdout, '');
  const failing = module(`import { build } from ${drivers}; build('failing', process.execPath, ['-e', 'process.exit(3)'], process.cwd());`);
  assert.notEqual(failing.status, 0);
  assert.match(failing.stderr, /✖ build failing: \S+ -e process\.exit\(3\) exited with 3 \(\d\.\ds\)\n/);
});

test('an install workspace step that runs longer than a small limit passes by its exit code', () => {
  // zip waits 1.5 s before it packs the Go module.
  const directory = mkdtempSync(path.join(tmpdir(), 'template-slow-zip-'));
  try {
    const run = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-install-workspace.mjs')], { cwd: ROOT, env: { ...process.env, PATH: slowCommandPath(directory, 'zip', 1.5) }, encoding: 'utf8' });
    assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
    assert.match(run.stderr, /▶ install workspace: zip -q -r .*\n✔ install workspace: zip -q -r .* \((?:1\.[5-9]|[2-9]\.\d|\d{2,}\.\d)s\)\n/);
    assert.match(run.stdout, /\[install workspace\] pass: a run removes its Go module cache\n/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('an install project step that runs longer than a small limit passes by its exit code', async () => {
  // npm waits 1.5 s before it packs the TypeScript package. The test stops the check after that step.
  const directory = mkdtempSync(path.join(tmpdir(), 'template-slow-npm-'));
  const temporary = path.join(directory, 'tmp');
  mkdirSync(temporary);
  try {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts/check-package-installs.mjs')], {
      cwd: ROOT, env: { ...process.env, PATH: slowCommandPath(directory, 'npm', 1.5), TMPDIR: temporary }, detached: true, stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    const packed = /✔ package installs: npm pack .* \((?:1\.[5-9]|[2-9]\.\d|\d{2,}\.\d)s\)\n/;
    const ended = await new Promise(resolve => {
      child.stderr.setEncoding('utf8').on('data', data => {
        stderr += data;
        if (packed.test(stderr)) resolve('packed');
      });
      child.on('close', () => resolve('closed'));
    });
    // The check and the commands it started run on after the step; they stop before their directory is removed (T20.3).
    await stopProcessGroup(child);
    assert.equal(ended, 'packed', stderr);
    assert.match(stderr, /▶ package installs: npm pack /);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
