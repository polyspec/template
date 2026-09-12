#!/usr/bin/env node
// Checks that every rule identifier in tests/cases/**/case.json is defined in docs/spec
// and reports the specification rules that no case covers.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defined = new Set();
for (const entry of readdirSync(join(root, 'docs', 'spec'))) {
  if (!entry.endsWith('.md') || entry.endsWith('.ko.md')) continue;
  const text = readFileSync(join(root, 'docs', 'spec', entry), 'utf8');
  for (const match of text.matchAll(/\*\*([A-Z]+-[0-9]+)\*\*/g)) defined.add(match[1]);
}

const covered = new Map();
const errors = [];
const casesDir = join(root, 'tests', 'cases');
let caseCount = 0;
if (existsSync(casesDir)) {
  for (const group of readdirSync(casesDir, { withFileTypes: true })) {
    if (!group.isDirectory()) continue;
    for (const entry of readdirSync(join(casesDir, group.name), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const id = `${group.name}/${entry.name}`;
      const path = join(casesDir, group.name, entry.name, 'case.json');
      if (!existsSync(path)) {
        errors.push(`${id}: case.json is missing`);
        continue;
      }
      caseCount++;
      const meta = JSON.parse(readFileSync(path, 'utf8'));
      if (!Array.isArray(meta.rules) || !meta.rules.length || ![1, 2, 3].includes(meta.stage)) {
        errors.push(`${id}: case.json needs a non-empty rules list and a stage of 1, 2 or 3`);
        continue;
      }
      for (const rule of meta.rules) {
        if (!defined.has(rule)) errors.push(`${id}: unknown rule ${rule}`);
        covered.set(rule, (covered.get(rule) ?? 0) + 1);
      }
    }
  }
}

const uncovered = [...defined].filter(rule => !covered.has(rule)).sort();
if (errors.length) {
  for (const error of errors) process.stderr.write(`[rules] ${error}\n`);
  process.exitCode = 1;
}
process.stdout.write(`[rules] ${defined.size} rules defined, ${covered.size} covered by ${caseCount} cases, ${uncovered.length} uncovered\n`);
if (uncovered.length) process.stdout.write(`[rules] uncovered: ${uncovered.join(' ')}\n`);
