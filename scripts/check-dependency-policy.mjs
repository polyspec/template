#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const policyPath = process.argv[2] ? resolve(process.argv[2]) : join(root, 'config/dependency-policy.json');
const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
if (policy.schema !== 1 || !Array.isArray(policy.composerPlatforms) || !Array.isArray(policy.exceptions)) throw new Error('dependency policy schema is invalid');

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

function requireCommand(commandName, args, cwd) {
  const result = spawnSync(commandName, args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0 || result.error) throw new Error(`${commandName} ${args.join(' ')} failed: ${result.error?.message ?? result.stderr}`);
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

/**
 * The exception keys of the outdated npm dependencies. `npm outdated --json` reports one object per package, or an
 * array with one entry per dependent workspace when several workspaces depend on it; `dependent` is the directory
 * name of the workspace, which `manifests` maps to its package.json path. Throws for an outdated dependency without
 * an exception.
 */
export function npmExceptionKeys(outdated, declaredKeys, manifests) {
  const keys = new Set();
  for (const [name, report] of Object.entries(outdated)) {
    for (const detail of Array.isArray(report) ? report : [report]) {
      if (!older(detail.current, detail.latest)) continue;
      const manifest = manifests.get(detail.dependent);
      if (manifest === undefined) throw new Error(`outdated npm dependency has an unknown dependent: ${name} in ${detail.dependent}`);
      const key = `npm:${manifest}:${name}`;
      if (!declaredKeys.has(key)) throw new Error(`outdated npm dependency has no exception: ${name} ${detail.current} < ${detail.latest} in ${manifest}`);
      keys.add(key);
    }
  }
  return keys;
}

/** The package.json path of the root and of every workspace, by the directory name npm reports as `dependent`. */
function npmManifests() {
  const manifests = new Map([[basename(root), 'package.json']]);
  const rootManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  for (const pattern of rootManifest.workspaces ?? []) {
    if (!pattern.endsWith('/*')) throw new Error(`unsupported workspace pattern: ${pattern}`);
    const parent = pattern.slice(0, -2);
    for (const entry of readdirSync(join(root, parent), { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(root, parent, entry.name, 'package.json'))) manifests.set(entry.name, `${parent}/${entry.name}/package.json`);
    }
  }
  return manifests;
}

// The check first proves that it rejects an outdated dependency of a workspace and one that several workspaces
// report as an array, which an earlier version of this check did not read.
function provesRejection() {
  const manifests = new Map([['root', 'package.json'], ['editor', 'packages/editor/package.json']]);
  const report = { current: '1.0.0', wanted: '1.0.0', latest: '1.1.0' };
  const cases = [
    { example: { ...report, dependent: 'editor' } },
    { example: [{ ...report, dependent: 'root' }, { ...report, dependent: 'editor' }] },
  ];
  for (const outdated of cases) {
    let rejected = false;
    try {
      npmExceptionKeys(outdated, new Set(['npm:package.json:example']), manifests);
    } catch (error) {
      rejected = String(error.message).includes('has no exception');
    }
    if (!rejected) throw new Error('dependency policy accepted an outdated workspace dependency without an exception');
  }
  if (npmExceptionKeys({ example: { ...report, dependent: 'editor' } }, new Set(['npm:packages/editor/package.json:example']), manifests).size !== 1) {
    throw new Error('dependency policy rejected an outdated workspace dependency with an exception');
  }
}
provesRejection();

const found = new Set(npmExceptionKeys(command('npm', ['outdated', '--json'], root), new Set(declared.keys()), npmManifests()));

const composerManifests = new Set();
for (const entry of policy.composerPlatforms) {
  if (typeof entry.manifest !== 'string' || !/^\d+\.\d+\.\d+$/.test(entry.php)) throw new Error('dependency policy contains an invalid Composer platform');
  if (composerManifests.has(entry.manifest)) throw new Error(`duplicate Composer platform: ${entry.manifest}`);
  composerManifests.add(entry.manifest);
  const manifestPath = join(root, entry.manifest);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const lock = JSON.parse(readFileSync(join(dirname(manifestPath), 'composer.lock'), 'utf8'));
  if (manifest.config?.platform?.php !== entry.php) throw new Error(`${entry.manifest} does not lock Composer resolution to PHP ${entry.php}`);
  if (lock['platform-overrides']?.php !== entry.php) throw new Error(`${entry.manifest} lock was not resolved for PHP ${entry.php}`);
  requireCommand('composer', ['validate', '--strict', '--no-interaction', '--no-check-publish'], dirname(manifestPath));
}
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
