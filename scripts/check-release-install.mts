#!/usr/bin/env node
// Installs the npm archives that a release carries, from what releases carry alone, and imports them (T28.129).
//
// A consumer installs the archive of @polyspec/template that make release-npm packs, the archives of the language
// service and of the language server, and the archive of @polyspec/json of its release, which @polyspec/template
// requires and no registry holds. The folder of the consumer is empty but for .npmrc with allow-remote=root, which npm 12
// needs to take an archive by its URL. The check then imports the WebAssembly entry of @polyspec/template and both
// packages. An archive that requires a package that no release carries fails the install: the language archive of the
// tree of 0.0.28 required @polyspec/template-legacy, and no check found it.
//
// The WebAssembly entry needs no platform package, so the check also requires that the install holds none.
//
// usage: node scripts/check-release-install.mts --template <archive of @polyspec/template>
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const root = resolve(new URL('..', import.meta.url).pathname);
const { values } = parseArgs({ options: { template: { type: 'string' } } });
if (values.template === undefined) {
  console.error('check-release-install: --template is required, the archive of @polyspec/template that make release-npm packs');
  process.exit(2);
}
const template = resolve(values.template);

function run(command: string, args: string[], cwd: string): void {
  console.error(`[release-install] ${command} ${args.join(' ')} (in ${cwd})`);
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${result.status ?? result.signal}`);
}

const manifest: unknown = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const json = typeof manifest === 'object' && manifest !== null && 'devDependencies' in manifest && typeof manifest.devDependencies === 'object' && manifest.devDependencies !== null
  && '@polyspec/json' in manifest.devDependencies ? manifest.devDependencies['@polyspec/json'] : undefined;
if (typeof json !== 'string' || !json.startsWith('https://')) throw new Error('package.json names no release archive of @polyspec/json in devDependencies');

const PROBE = `
import assert from 'node:assert/strict';
const core = await import('@polyspec/template/wasm');
assert.equal(core.parse('{= a}', 't').name, 't');
const language = await import('@polyspec/template-language');
assert.deepEqual(language.format('{=a}', {}), { ok: true, text: '{= a}', changed: true });
assert.deepEqual(language.openDocument('\\u00e9{= a}').tags, [{ kind: 'echo', start: 1, end: 6 }]);
const failed = language.format('{= }', {});
assert.equal(failed.ok, false);
assert.equal(failed.error.code, 'parse_unexpected_token');
const server = await import('@polyspec/template-lsp');
assert.equal(typeof server.TAG_RANGES_METHOD, 'string');
`;

const work = mkdtempSync(join(tmpdir(), 'template-release-install-'));
try {
  const archives = join(work, 'archives');
  const consumer = join(work, 'consumer');
  mkdirSync(archives);
  mkdirSync(consumer);
  for (const name of ['language', 'lsp']) run('npm', ['pack', '--ignore-scripts', '--pack-destination', archives], join(root, 'packages', name));
  writeFileSync(join(consumer, 'package.json'), `${JSON.stringify({ private: true, type: 'module' }, null, 2)}\n`);
  writeFileSync(join(consumer, '.npmrc'), 'allow-remote=root\n');
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', template, ...readdirSync(archives).sort().map(file => join(archives, file)), json], consumer);
  assert.deepEqual(readdirSync(join(consumer, 'node_modules', '@polyspec')).sort(), ['json', 'template', 'template-language', 'template-lsp'], 'the install holds the four packages and no platform package');
  writeFileSync(join(consumer, 'probe.mjs'), PROBE);
  run(process.execPath, ['probe.mjs'], consumer);
  console.error('[release-install] the archives install from what releases carry and their entries load');
} finally {
  rmSync(work, { recursive: true, force: true });
}
