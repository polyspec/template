// Tests that a fresh checkout, the tracked files of HEAD without node_modules, does not reach a missing script path or
// an exit 0 without an asset when kit is missing (T28.150): the install stops with the step that makes kit
// (make bootstrap), and the release targets stop with the same message. The test reads the tracked files of HEAD, so it
// judges what is committed, and writes the checkout that it runs in.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, test } from 'node:test';

const root = resolve(new URL('../..', import.meta.url).pathname);
const MESSAGE = 'the kit of node_modules is missing';

const made: string[] = [];
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

function freshCheckout(): string {
  const dir = mkdtempSync(join(tmpdir(), 'template-fresh-checkout-'));
  made.push(dir);
  mkdirSync(dir, { recursive: true });
  // The archive goes to a file: its size is past the output buffer of spawnSync.
  const file = join(dir, 'head.tar');
  const archive = spawnSync('git', ['archive', '-o', file, 'HEAD'], { cwd: root });
  if (archive.status !== 0) throw new Error(`git archive HEAD exited with ${archive.status ?? archive.signal}`);
  const extract = spawnSync('tar', ['-x', '-f', file, '-C', dir]);
  if (extract.status !== 0) throw new Error(`tar -x exited with ${extract.status ?? extract.signal}`);
  return dir;
}

function make(dir: string, args: string[]): { status: number | null; output: string } {
  const result = spawnSync('make', ['--no-print-directory', ...args], { cwd: dir, encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

test('install-tools TOOLS=npm in a fresh checkout names the step that makes kit, not a missing script path', () => {
  const dir = freshCheckout();
  const result = make(dir, ['install-tools', 'TOOLS=npm']);
  assert.equal(result.status, 2, result.output);
  assert.match(result.output, new RegExp(MESSAGE));
  assert.match(result.output, /make bootstrap/);
  assert.doesNotMatch(result.output, /Cannot find module/);
});

test('make bootstrap is one target of the kit-bootstrap steps', () => {
  const dir = freshCheckout();
  const result = make(dir, ['-n', 'bootstrap']);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /npm exec --yes --package=/);
  assert.match(result.output, /install-tools TOOLS=npm/);
  assert.match(result.output, /install-packages/);
});

test('release-candidate-assets in a fresh checkout fails with the message that makes kit, not with a silent success', () => {
  const dir = freshCheckout();
  const result = make(dir, ['release-candidate-assets', 'VERSION=0.0.30']);
  assert.notEqual(result.status, 0, result.output);
  assert.match(result.output, new RegExp(MESSAGE));
});
