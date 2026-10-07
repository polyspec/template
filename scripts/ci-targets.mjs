#!/usr/bin/env node
// Runs make targets past failures and writes their report (T20.1-9):
//
//   node scripts/ci-targets.mjs <report directory> <target>...
//
// Each target runs as `make -k <target>` to its end, also after an earlier target failed, with its output printed and
// written to <report directory>/targets/<target>.log; summary.md names each failed target with its first failure lines
// (scripts/target-report.mjs), and the version of each toolchain of the run, which <report directory>/toolchains.json
// holds too, so the report of each CI job records the PHP patch that setup-php installed (T17.1-10). The run holds the
// lock <report directory>.lock, so two runs never write one report.
// It ends with status 1 when a target failed. `make ci-targets TARGETS="..."` starts it in the CI jobs.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { acquire } from './holder-lock.mjs';
import { runLogged, startReport, toolchainVersions, writeSummary } from './target-report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [directory, ...targets] = process.argv.slice(2);
if (!directory || targets.length === 0) {
  console.error('usage: node scripts/ci-targets.mjs <report directory> <target>...');
  process.exit(2);
}
const report = path.resolve(directory);
// The lock lies beside the report, in var/report, which a new checkout does not have (T20.1-11).
mkdirSync(path.dirname(report), { recursive: true });
const release = acquire(`${report}.lock`, root);
try {
  startReport(report);
  const environment = toolchainVersions(root);
  writeFileSync(path.join(report, 'toolchains.json'), `${JSON.stringify(environment, null, 2)}\n`);
  const results = [];
  for (const [index, name] of targets.entries()) {
    console.log(`[ci-targets] start ${name} (${index + 1}/${targets.length})`);
    const begin = Date.now();
    let passed;
    try {
      passed = await runLogged(root, name, report);
    } catch (error) {
      console.error(`[ci-targets] make -k ${name} did not start: ${error.message}`);
      passed = false;
    }
    results.push({ name, status: passed ? 'passed' : 'failed', elapsedMs: Date.now() - begin });
    console.log(`[ci-targets] ${name} ${passed ? 'passed' : 'failed'} in ${((Date.now() - begin) / 1000).toFixed(1)} s`);
  }
  const summary = writeSummary(report, `make ci-targets ${targets.join(' ')}`, results, environment);
  process.stdout.write(summary);
  process.exitCode = results.every(result => result.status === 'passed') ? 0 : 1;
} finally {
  release();
}
