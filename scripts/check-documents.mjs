#!/usr/bin/env node
// Checks translation pairs, relative links, identical code blocks and feature status fields.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const documents = new Set(['README.md', 'AGENTS.md', 'CHANGELOG.md', 'docs/index.md', 'docs/features.md', 'docs/guide.md']);
const errors = [];

function collect(directory) {
  if (!existsSync(join(root, directory))) return;
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'vendor' && entry.name !== 'target' && entry.name !== 'dist') collect(path);
    } else if (path.endsWith('.md')) {
      documents.add(path.replace(/\.ko\.md$/, '.md'));
    }
  }
}
for (const directory of ['docs/spec', 'docs/operations', 'docs/plans', 'schema', 'packages', 'tests/fixtures']) collect(directory);

function checkLinks(path, text) {
  const prose = text.replace(/^```[^\n]*\n[\s\S]*?^```/gm, '');
  for (const match of prose.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '').split('#')[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    if (target.startsWith('/')) {
      continue;
    }
    const local = resolve(root, dirname(path), decodeURIComponent(target));
    const candidates = [local, `${local}.md`, `${local}.ko.md`, join(local, 'index.md')];
    if (!candidates.some(existsSync)) errors.push(`${path}: missing link target: ${target}`);
  }
}

function codeBlocks(text) {
  return [...text.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)].map(m => m[1]);
}

for (const path of documents) {
  const translated = path.replace(/\.md$/, '.ko.md');
  if (!existsSync(join(root, path)) || !existsSync(join(root, translated))) {
    errors.push(`${path}: English and Korean files are required`);
    continue;
  }
  const english = readFileSync(join(root, path), 'utf8');
  const korean = readFileSync(join(root, translated), 'utf8');
  checkLinks(path, english);
  checkLinks(translated, korean);
  if (JSON.stringify(codeBlocks(english)) !== JSON.stringify(codeBlocks(korean))) {
    errors.push(`${path}: code blocks differ from the Korean file`);
  }
}

function statuses(path) {
  if (!existsSync(join(root, path))) return [];
  const rows = readFileSync(join(root, path), 'utf8').split('\n').filter(line => /^\| [a-z][a-z0-9-]* \|/.test(line));
  if (!rows.length) errors.push(`${path}: feature status rows are required`);
  const ids = new Set();
  return rows.map(row => {
    const cells = row.split('|').slice(1, -1).map(c => c.trim());
    const [id, , status, supportOrVerification, evidenceOrDeployment, legacyEvidence] = cells;
    const featureTable = cells.length === 5;
    const valid = featureTable
      ? ['planned', 'partial', 'implemented'].includes(status) && /(?:go|php|rust|typescript):/.test(supportOrVerification ?? '') && /\]\([^)]+\)/.test(evidenceOrDeployment ?? '')
      : cells.length === 6 && ['not-started', 'in-progress', 'implemented'].includes(status) &&
        ['pending', 'passed', 'failed'].includes(supportOrVerification) &&
        ['not-deployed', 'deployed'].includes(evidenceOrDeployment) && /\]\([^)]+\)/.test(legacyEvidence ?? '');
    if (!valid) {
      errors.push(`${path}: invalid status or missing evidence for ${id}`);
    }
    if (ids.has(id)) errors.push(`${path}: duplicate feature ID: ${id}`);
    ids.add(id);
    return featureTable ? [id, status, supportOrVerification] : [id, status, supportOrVerification, evidenceOrDeployment];
  });
}
if (JSON.stringify(statuses('docs/features.md')) !== JSON.stringify(statuses('docs/features.ko.md'))) {
  errors.push('docs/features.md: English and Korean status fields differ');
}

// The checklist of AGENTS holds only tasks: its title, the translation link under it, headings and task tables, whose
// header row starts with `| ID |`, followed by the separator row and the task rows. Its plan, causes, exit criteria and
// evidence are in docs/plans/execution-plan.md. A task row starts with its ID, derived sub-items (T12.1-1) included;
// its state, the last cell, must be valid and match between the two languages. A state marker of AGENTS, or a task
// list marker `[x]` or `[X]`, stands only at the start of the last cell of a task row, so that a reader of the
// checklist can trust every marker. Every other line and every other marker fails with its file, line and column
// (counted in characters from 1); there is no exception.
const CHECKLIST = 'docs/plans/execution-checklist.md';
const TASK_ROW = /^\| T[0-9]+\.[A-Z0-9.]+(?:-[0-9]+)* /;
const TABLE_HEADER = /^\| ID \|(?: [^|]+ \|)+$/;
const TABLE_SEPARATOR = /^\|(?: --- \|)+$/;
const STATE_MARKER = /\[[ ~o!xX]\]/g;
function checkboxes(path) {
  const rows = [];
  const lines = readFileSync(join(root, path), 'utf8').replace(/\n$/, '').split('\n');
  lines.forEach((line, index) => {
    let state = -1;
    if (TASK_ROW.test(line)) {
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      const id = cells[0].replace(/ `parallel`$/, '');
      const last = cells[cells.length - 1];
      // The four task states of AGENTS; a bypassed task records its cause and its retry condition.
      if (!/^\[( |~|o)\]$|^\[!\] cause: .+; retry: .+$/.test(last)) errors.push(`${path}: invalid task state for ${id}: ${last}`);
      rows.push([id, last]);
      const cell = line.lastIndexOf('|', line.trimEnd().length - 2) + 1;
      state = cell + line.slice(cell).search(/\S/);
    } else {
      const item = line === '' || /^#{1,6} \S/.test(line) || (index === 2 && /^\[[^\]]+\]\([^)]+\)\.$/.test(line)) ||
        TABLE_HEADER.test(line) || (TABLE_SEPARATOR.test(line) && TABLE_HEADER.test(lines[index - 1] ?? ''));
      if (!item) {
        errors.push(`${path}:${index + 1}:1: the line is not a heading, a task table row or the translation link; a checklist holds only tasks, and its plan belongs in docs/plans/execution-plan.md`);
      }
    }
    for (const marker of line.matchAll(STATE_MARKER)) {
      if (marker.index !== state) {
        errors.push(`${path}:${index + 1}:${marker.index + 1}: state marker ${marker[0]} is not the state of a task; a state marker stands only at the start of the last cell of a task row`);
      }
    }
  });
  return rows;
}
if (JSON.stringify(checkboxes(CHECKLIST)) !== JSON.stringify(checkboxes(CHECKLIST.replace(/\.md$/, '.ko.md')))) {
  errors.push(`${CHECKLIST}: English and Korean task ids or checkboxes differ`);
}

if (errors.length) {
  for (const error of errors) process.stderr.write(`[docs] ${error}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`[docs] ${documents.size} document pairs passed\n`);
}
