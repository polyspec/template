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

// Checkbox columns of task tables in docs/plans must match between the two languages.
function checkboxes(path) {
  return readFileSync(join(root, path), 'utf8').split('\n')
    .filter(line => /^\| T[0-9]+\.[A-Z0-9.]+ /.test(line))
    .map(line => {
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      const id = cells[0].replace(/ `parallel`$/, '');
      const last = cells[cells.length - 1];
      if (!/^\[( |x)\]( blocked: .+)?$/.test(last)) errors.push(`${path}: invalid checkbox for ${id}: ${last}`);
      return [id, last];
    });
}
for (const path of documents) {
  if (!path.startsWith('docs/plans/')) continue;
  const translated = path.replace(/\.md$/, '.ko.md');
  if (!existsSync(join(root, path)) || !existsSync(join(root, translated))) continue;
  const english = checkboxes(path);
  const korean = checkboxes(translated);
  if (JSON.stringify(english) !== JSON.stringify(korean)) {
    errors.push(`${path}: English and Korean task ids or checkboxes differ`);
  }
}

if (errors.length) {
  for (const error of errors) process.stderr.write(`[docs] ${error}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`[docs] ${documents.size} document pairs passed\n`);
}
