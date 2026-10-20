#!/usr/bin/env node
// Checks the stage of every conformance case: tests/cases/**/case.json holds a stage of 1, 2 or 3 (CNF-2).
// The requirements that a case lists are checked by `make parity-declarations-check` of kit (R13, R14, R15).
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsonDocument } from './json-document.mts';

const caseStageDocument = jsonDocument<{ stage: number }>('case.json', {
  type: 'object',
  required: ['stage'],
  properties: { stage: { type: 'integer', enum: [1, 2, 3] } },
});

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const casesDir = join(root, 'tests', 'cases');
const errors: string[] = [];
let caseCount = 0;
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
    try {
      caseStageDocument.read(path);
    } catch (error) {
      errors.push(`${id}: case.json needs a stage of 1, 2 or 3: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
for (const error of errors) process.stderr.write(`[rules] ${error}\n`);
if (errors.length) process.exitCode = 1;
process.stdout.write(`[rules] ${caseCount} cases, ${errors.length} findings\n`);
