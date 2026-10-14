#!/usr/bin/env node
// Checks that every rule identifier in tests/cases/**/case.json is defined in docs/spec
// and reports the specification rules that no case covers.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareText } from './compare-text.mts';
import { jsonDocument } from './json-document.mts';
import { captured } from './required.mts';

// The case.json of a conformance case: the rules that it covers and its stage.
const caseMetaDocument = jsonDocument<{ rules: string[]; stage: number }>('case.json', {
  type: 'object',
  required: ['rules', 'stage'],
  properties: { rules: { type: 'array', minItems: 1, items: { type: 'string' } }, stage: { type: 'integer', enum: [1, 2, 3] } },
});

/** A group of tests/rule-evidence.json: the rules that a check other than a case verifies, and the files of the check. */
interface EvidenceGroup {
  name: string;
  verification: string;
  rules: string[];
  files: string[];
}

const nonEmptyStrings = { type: 'array', minItems: 1, items: { type: 'string' } };
const evidenceDocument = jsonDocument<{ schema: number; groups: EvidenceGroup[] }>('rule evidence', {
  type: 'object',
  required: ['schema', 'groups'],
  properties: {
    schema: { const: 1 },
    groups: {
      type: 'array',
      items: { type: 'object', required: ['name', 'verification', 'rules', 'files'], properties: { name: { type: 'string' }, verification: { type: 'string' }, rules: nonEmptyStrings, files: nonEmptyStrings } },
    },
  },
});

/** The value that `read` gives, or undefined after recording its failure in `errors`, so that the check reports every failure. */
function collect<T>(read: () => T, errors: string[], label: string): T | undefined {
  try {
    return read();
  } catch (error) {
    errors.push(`${label}${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defined = new Set<string>();
for (const entry of readdirSync(join(root, 'docs', 'spec'))) {
  if (!entry.endsWith('.md') || entry.endsWith('.ko.md')) continue;
  const text = readFileSync(join(root, 'docs', 'spec', entry), 'utf8');
  for (const match of text.matchAll(/\*\*([A-Z]+-[0-9]+)\*\*/g)) defined.add(captured(match, 1, `a rule identifier of docs/spec/${entry}`));
}

const covered = new Map<string, number>();
const errors: string[] = [];
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
      const meta = collect(() => caseMetaDocument.read(path), errors, `${id}: case.json needs a non-empty rules list and a stage of 1, 2 or 3: `);
      if (meta === undefined) continue;
      for (const rule of meta.rules) {
        if (!defined.has(rule)) errors.push(`${id}: unknown rule ${rule}`);
        covered.set(rule, (covered.get(rule) ?? 0) + 1);
      }
    }
  }
}

const evidencePath = join(root, 'tests', 'rule-evidence.json');
const evidence = collect(() => evidenceDocument.read(evidencePath), errors, 'rule-evidence.json has an invalid schema: ');
const evidenced = new Map<string, string>();
for (const { name, rules, files } of evidence === undefined ? [] : evidence.groups) {
  for (const file of files) if (!existsSync(join(root, file))) errors.push(`${name}: evidence file is missing: ${file}`);
  for (const rule of rules) {
    if (!defined.has(rule)) errors.push(`${name}: unknown evidence rule ${rule}`);
    if (evidenced.has(rule)) errors.push(`${rule}: duplicated non-fixture evidence`);
    evidenced.set(rule, name);
  }
}

const uncovered = [...defined].filter(rule => !covered.has(rule) && !evidenced.has(rule)).sort(compareText);
if (errors.length) {
  for (const error of errors) process.stderr.write(`[rules] ${error}\n`);
  process.exitCode = 1;
}
process.stdout.write(`[rules] ${defined.size} rules defined, ${covered.size} covered by ${caseCount} cases, ${evidenced.size} covered by non-fixture gates, ${uncovered.length} uncovered\n`);
if (uncovered.length) {
  process.stderr.write(`[rules] uncovered: ${uncovered.join(' ')}\n`);
  process.exitCode = 1;
}
