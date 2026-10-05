#!/usr/bin/env node
// Runs the conformance of the given cases only, in every mode: the AST conformance of every language and the
// generated conformance of TypeScript, Go, Rust and PHP (T13.1-4). It is the owner check of a change under
// tests/cases; `make conformance-all-modes` runs every case in the full suite. Each path names a file or the
// directory of a case, tests/cases/<group>/<name>[/...]; a case whose directory no longer exists was removed and has
// nothing to run. Each runner runs to its end, prints its result and elapsed time, and has no time limit of its own
// here; the runners give each case its own deadline.
//
// Usage: node scripts/conformance-cases.mjs [--dry-run] <path> ...
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const RUNNERS = [
  'tests/runner/conformance.mjs',
  'tests/runner/conformance-generated-ts.mjs',
  'tests/runner/conformance-generated-go.mjs',
  'tests/runner/conformance-generated-rust.mjs',
  'tests/runner/conformance-generated-php.mjs',
];

/** The case ids of the paths, in order and without repetition; a path outside a case directory is an error. */
export function caseIds(paths) {
  const ids = [];
  const errors = [];
  for (const path of paths) {
    const match = /^tests\/cases\/([^/]+)\/([^/]+)(?:\/.*)?$/.exec(path.replace(/\/+$/, ''));
    if (!match) errors.push(`${path}: not a file or directory of a case (tests/cases/<group>/<name>)`);
    else if (!ids.includes(`${match[1]}/${match[2]}`)) ids.push(`${match[1]}/${match[2]}`);
  }
  return { ids, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const dryRun = args[0] === '--dry-run';
  const paths = dryRun ? args.slice(1) : args;
  if (paths.length === 0) {
    console.error('usage: node scripts/conformance-cases.mjs [--dry-run] <tests/cases/<group>/<name> path> ...; make conformance-cases CASES="<paths>"');
    process.exit(2);
  }
  const { ids, errors } = caseIds(paths);
  if (errors.length) {
    for (const error of errors) console.error(`[conformance-cases] ${error}`);
    process.exit(2);
  }
  const removed = ids.filter(id => !existsSync(join(root, 'tests/cases', id)));
  for (const id of removed) console.log(`[conformance-cases] ${id}: the case directory does not exist; the case was removed and has nothing to run`);
  const steps = ids.filter(id => !removed.includes(id)).flatMap(id => RUNNERS.map(runner => ({ id, runner })));
  console.log(`[conformance-cases] ${steps.length} runs: ${ids.length - removed.length} cases x ${RUNNERS.length} runners`);
  const failed = [];
  for (const { id, runner } of steps) {
    const name = `${runner} --case ${id}`;
    if (dryRun) {
      console.log(`[conformance-cases] would run node ${name}`);
      continue;
    }
    console.log(`[conformance-cases] start node ${name}`);
    const started = performance.now();
    const result = spawnSync(process.execPath, [runner, '--case', id], { cwd: root, stdio: 'inherit' });
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    if (result.status !== 0) failed.push(name);
    console.log(`[conformance-cases] ${result.status === 0 ? 'passed' : `failed with ${result.status ?? result.signal}`} node ${name} in ${seconds} s`);
  }
  if (!dryRun) console.log(`[conformance-cases] ${failed.length ? `failed: ${failed.join('; ')}` : 'every run passed'}`);
  process.exitCode = failed.length ? 1 : 0;
}
