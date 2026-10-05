// Tests the holder lock of a resource that exists once (scripts/holder-lock.mjs): one holder at a time, a refusal that
// names the holder, release by the holder, and a lock of an ended process that is reported and removed only by `clear`.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCK = path.join(ROOT, 'scripts/holder-lock.mjs');
const HOLDER = /process (\d+) of the checkout (\S+), started at (\d{4}-\d\d-\d\dT[\d:.]+Z)/;

// Runs the cleanups of a test in reverse order of registration: a holder ends before its directory is removed.
const cleanups = new WeakMap();
function onEnd(t, cleanup) {
  if (!cleanups.has(t)) {
    cleanups.set(t, []);
    t.after(async () => {
      for (const item of cleanups.get(t).reverse()) await item();
    });
  }
  cleanups.get(t).push(cleanup);
}

function workspace(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'template-holder-lock-'));
  onEnd(t, () => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

// Starts a process that holds the lock until its standard input closes; resolves it once it holds the lock.
function holdLock(t, lock) {
  const code = `const { acquire } = await import(${JSON.stringify(LOCK)}); acquire(${JSON.stringify(lock)}, ${JSON.stringify(ROOT)}); process.stdout.write('held\\n'); process.stdin.resume(); process.stdin.on('end', () => process.exit(0));`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['pipe', 'pipe', 'inherit'] });
  onEnd(t, async () => {
    if (child.exitCode !== null) return;
    child.stdin.end();
    await new Promise(resolvePromise => child.once('exit', resolvePromise));
  });
  return new Promise((resolvePromise, reject) => {
    child.stdout.once('data', () => resolvePromise(child));
    child.once('exit', status => reject(new Error(`the holder exited with ${status}`)));
  });
}

// Writes the lock of a process that has ended.
function endedLock(lock) {
  const ended = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
  writeFileSync(lock, `${JSON.stringify({ checkout: ROOT, pid: Number(ended.stdout), started: '2026-10-05T00:00:00.000Z', token: 'ended' })}\n`);
  return Number(ended.stdout);
}

const runLock = (...args) => spawnSync(process.execPath, [LOCK, ...args], { encoding: 'utf8' });

test('a second process fails with the holder, and the lock is free after the holder ends', { timeout: 20_000 }, async t => {
  const lock = path.join(workspace(t), 'resource.lock');
  const holder = await holdLock(t, lock);
  const refused = runLock('run', lock, '--', process.execPath, '-e', '');
  assert.equal(refused.status, 1);
  const named = HOLDER.exec(refused.stderr);
  assert.ok(named, refused.stderr);
  assert.equal(Number(named[1]), holder.pid);
  assert.equal(named[2], ROOT);
  assert.match(refused.stderr, /resource\.lock is held by/);
  holder.stdin.end();
  await new Promise(resolvePromise => holder.once('exit', resolvePromise));
  assert.equal(existsSync(lock), false);
  const ran = runLock('run', lock, '--', process.execPath, '-e', 'process.exit(3)');
  assert.equal(ran.status, 3, ran.stderr);
  assert.match(ran.stdout, /holding .*resource\.lock\n[\s\S]*released .*resource\.lock\n/);
  assert.equal(existsSync(lock), false);
});

test('a lock of an ended process is reported and stays until clear removes it', { timeout: 20_000 }, t => {
  const lock = path.join(workspace(t), 'resource.lock');
  const pid = endedLock(lock);
  const refused = runLock('run', lock, '--', process.execPath, '-e', '');
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, new RegExp(`held by process ${pid} of the checkout .*, and that process has ended; remove the lock with`));
  assert.equal(existsSync(lock), true);
  const cleared = runLock('clear', lock);
  assert.equal(cleared.status, 0, cleared.stderr);
  assert.match(cleared.stdout, new RegExp(`removed .*resource\\.lock of process ${pid} `));
  assert.equal(existsSync(lock), false);
});

test('clear fails while the holder runs', { timeout: 20_000 }, async t => {
  const lock = path.join(workspace(t), 'resource.lock');
  const holder = await holdLock(t, lock);
  const refused = runLock('clear', lock);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, new RegExp(`held by process ${holder.pid} of the checkout .*, which still runs`));
  assert.equal(existsSync(lock), true);
});
