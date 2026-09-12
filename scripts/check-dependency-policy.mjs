#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const policyPath = process.argv[2] ? resolve(process.argv[2]) : join(root, 'config/dependency-policy.json');
const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
if (policy.schema !== 1 || !Array.isArray(policy.exceptions)) throw new Error('dependency policy schema is invalid');

function versionParts(version) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function older(current, latest) {
  const left = versionParts(current);
  const right = versionParts(latest);
  if (!left || !right) return current !== latest;
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index];
  }
  return false;
}

function command(commandName, args, cwd) {
  const result = spawnSync(commandName, args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (![0, 1].includes(result.status) || result.error) throw new Error(`${commandName} dependency query failed: ${result.error?.message ?? result.stderr}`);
  return result.stdout.trim() ? JSON.parse(result.stdout) : {};
}

const declared = new Map();
for (const exception of policy.exceptions) {
  if (!['npm', 'composer'].includes(exception.ecosystem) || typeof exception.manifest !== 'string' || typeof exception.package !== 'string' || typeof exception.reason !== 'string' || !exception.reason.trim() || typeof exception.removalCondition !== 'string' || !exception.removalCondition.trim() || !Array.isArray(exception.verification) || !exception.verification.length) {
    throw new Error('dependency policy contains an incomplete exception');
  }
  const key = `${exception.ecosystem}:${exception.manifest}:${exception.package}`;
  if (declared.has(key)) throw new Error(`duplicate dependency exception: ${key}`);
  const manifest = JSON.parse(readFileSync(join(root, exception.manifest), 'utf8'));
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.require, ...manifest['require-dev'] };
  if (!(exception.package in dependencies)) throw new Error(`exception does not name a direct dependency: ${key}`);
  declared.set(key, exception);
}

const found = new Set();
const npmOutdated = command('npm', ['outdated', '--json'], root);
for (const [name, detail] of Object.entries(npmOutdated)) {
  if (!older(detail.current, detail.latest)) continue;
  const key = `npm:package.json:${name}`;
  if (!declared.has(key)) throw new Error(`outdated npm dependency has no exception: ${name} ${detail.current} < ${detail.latest}`);
  found.add(key);
}

const composerManifests = new Set(policy.exceptions.filter(item => item.ecosystem === 'composer').map(item => item.manifest));
for (const manifestPath of composerManifests) {
  const manifestDirectory = dirname(join(root, manifestPath));
  const report = command('composer', ['outdated', '--direct', '--locked', '--format=json'], manifestDirectory);
  for (const detail of report.locked ?? []) {
    if (!older(detail.version, detail.latest)) continue;
    const key = `composer:${manifestPath}:${detail.name}`;
    if (!declared.has(key)) throw new Error(`outdated Composer dependency has no exception: ${manifestPath} ${detail.name} ${detail.version} < ${detail.latest}`);
    found.add(key);
  }
}

for (const key of declared.keys()) if (!found.has(key)) throw new Error(`dependency exception is stale or not reported as outdated: ${key}`);
process.stdout.write(`dependency policy: ${found.size} justified stable-version exceptions passed\n`);
