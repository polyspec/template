#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('../..', import.meta.url).pathname);
const manifestPath = resolve(root, 'contracts/features.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const errors = [];
const ids = new Set();
const statuses = new Set(['planned', 'partial', 'implemented']);
const clientStatuses = new Set(['planned', 'partial', 'pass', 'unsupported']);
const clients = ['go', 'php', 'rust', 'typescript'];
const required = ['title', 'title_ko', 'description', 'description_ko', 'inputs', 'outputs', 'state', 'errors', 'clients', 'fixtures', 'tests', 'verification', 'docs'];

async function exists(relative) {
  if (relative.includes('*')) return true;
  try { await stat(resolve(root, relative)); return true; } catch { return false; }
}

if (manifest.manifest_version !== 1) errors.push('manifest_version must be 1');
if (manifest.contract_version !== '0.0.1') errors.push('contract_version must remain 0.0.1');
if (!Array.isArray(manifest.features) || manifest.features.length === 0) errors.push('features must be non-empty');

for (const feature of manifest.features ?? []) {
  if (!feature.id || ids.has(feature.id)) errors.push(`duplicate or missing feature id: ${feature.id ?? '<empty>'}`);
  ids.add(feature.id);
  for (const field of required) if (feature[field] === undefined) errors.push(`${feature.id}: missing ${field}`);
  if (!statuses.has(feature.status)) errors.push(`${feature.id}: invalid status ${feature.status}`);
  for (const client of clients) if (!clientStatuses.has(feature.clients?.[client])) errors.push(`${feature.id}: invalid ${client} status`);
  for (const field of ['state', 'errors', 'fixtures', 'tests', 'verification', 'docs']) {
    if (!Array.isArray(feature[field])) errors.push(`${feature.id}: ${field} must be an array`);
  }
  if (feature.status === 'implemented' && (feature.tests?.length === 0 || feature.docs?.length === 0 || feature.verification?.length === 0)) {
    errors.push(`${feature.id}: implemented feature requires tests, verification and docs`);
  }
  for (const [index, check] of (feature.verification ?? []).entries()) {
    if (!check || typeof check.id !== 'string' || !check.id || typeof check.command !== 'string' || !check.command) {
      errors.push(`${feature.id}: verification ${index} is incomplete`);
    }
  }
  for (const relative of [...(feature.fixtures ?? []), ...(feature.tests ?? []), ...(feature.docs ?? [])]) {
    if (!(await exists(relative))) errors.push(`${feature.id}: missing path ${relative}`);
  }
  for (const doc of feature.docs ?? []) {
    if (!doc.endsWith('.md')) continue;
    const korean = doc.replace(/\.md$/, '.ko.md');
    if (!(await exists(korean))) errors.push(`${feature.id}: missing Korean document ${korean}`);
  }
}

if (errors.length) {
  for (const error of errors) console.error(`features: ${error}`);
  process.exit(1);
}
console.log(`features: ${manifest.features.length} feature contracts passed`);
