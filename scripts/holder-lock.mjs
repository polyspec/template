#!/usr/bin/env node
// The holder lock of a resource that exists once, such as the record of the full run of a checkout.
// A lock is a file that names its holder: the checkout, the process ID and the start time. The file is written
// completely under a name of its own and then linked to the lock path, which fails when the lock exists, so the
// lock appears atomically with its whole content. One process holds a lock at a time; another process fails with
// the holder of the lock, and only the holder releases it. A lock whose holder process has ended is reported and
// stays until `clear` removes it.
//
// Usage: node scripts/holder-lock.mjs run <lock> -- <command> [arguments...]
//          holds the lock while the command runs and exits with the status of the command
//        node scripts/holder-lock.mjs clear <lock>
//          removes the lock when its holder process has ended, and fails while the holder runs
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { linkSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Returns the holder that a lock file names, or null when the lock does not exist. */
export function readHolder(lock) {
  let text;
  try {
    text = readFileSync(lock, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const holder = JSON.parse(text);
  if (typeof holder.checkout !== 'string' || !Number.isInteger(holder.pid) || typeof holder.started !== 'string' || typeof holder.token !== 'string') {
    throw new Error(`${lock} does not name a holder: ${text}`);
  }
  return holder;
}

/** Returns whether the process of a holder runs. */
export function holderRuns(holder) {
  try {
    process.kill(holder.pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process runs under another user.
    if (error.code === 'EPERM') return true;
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

/** Describes a holder by its checkout, its process ID and its start time. */
export function describeHolder(holder) {
  return `process ${holder.pid} of the checkout ${holder.checkout}, started at ${holder.started}`;
}

/**
 * Takes the lock for the checkout `checkout` and returns the function that releases it. Fails with the holder when
 * another process holds the lock, also when that process has ended.
 */
export function acquire(lock, checkout) {
  const holder = { checkout: resolve(checkout), pid: process.pid, started: new Date().toISOString(), token: randomBytes(16).toString('hex') };
  const pending = `${lock}.${process.pid}.${holder.token}`;
  writeFileSync(pending, `${JSON.stringify(holder)}\n`, { flag: 'wx' });
  try {
    linkSync(pending, lock);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const current = readHolder(lock);
    if (holderRuns(current)) throw new Error(`${lock} is held by ${describeHolder(current)}`);
    throw new Error(`${lock} is held by ${describeHolder(current)}, and that process has ended; remove the lock with \`node scripts/holder-lock.mjs clear ${lock}\` after checking the resource`);
  } finally {
    unlinkSync(pending);
  }
  let held = true;
  const handlers = new Map();
  const release = () => {
    if (!held) return;
    held = false;
    // A released lock leaves no handler behind, so a process may take and release locks many times.
    process.removeListener('exit', release);
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
    const current = readHolder(lock);
    if (current === null || current.token !== holder.token) throw new Error(`${lock} is no longer held by process ${process.pid}`);
    unlinkSync(lock);
  };
  // The holder releases the lock when it exits, also through process.exit or a signal.
  process.on('exit', release);
  for (const [signal, number] of [['SIGINT', 2], ['SIGTERM', 15], ['SIGHUP', 1]]) {
    const handler = () => {
      release();
      process.exit(128 + number);
    };
    handlers.set(signal, handler);
    process.once(signal, handler);
  }
  return release;
}

/** Removes a lock whose holder process has ended and returns its holder; fails while the holder runs. */
export function clear(lock) {
  const holder = readHolder(lock);
  if (holder === null) throw new Error(`${lock} does not exist`);
  if (holderRuns(holder)) throw new Error(`${lock} is held by ${describeHolder(holder)}, which still runs`);
  unlinkSync(lock);
  return holder;
}

async function main(args) {
  const [action, lock, separator, command, ...rest] = args;
  if (action === 'clear' && lock !== undefined && separator === undefined) {
    const holder = clear(lock);
    process.stdout.write(`removed ${lock} of ${describeHolder(holder)}, which has ended\n`);
    return 0;
  }
  if (action !== 'run' || lock === undefined || separator !== '--' || command === undefined) {
    throw new Error('usage: holder-lock.mjs run <lock> -- <command> [arguments...] | holder-lock.mjs clear <lock>');
  }
  const release = acquire(lock, resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  process.stdout.write(`holding ${lock}\n`);
  const child = spawn(command, rest, { stdio: 'inherit' });
  const status = await new Promise((resolvePromise, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => resolvePromise(signal ? 1 : code));
  });
  release();
  process.stdout.write(`released ${lock}\n`);
  return status;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
