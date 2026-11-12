// Tests that config/release.json (scripts/kit/release.mjs) names the packages that a tag releases as the manifests of the
// tree declare them (T22.4-22): the npm and Composer archives by their package names, the Python package as its wheel, and
// the Rust crate, which no registry holds, by git tag; the Composer packages make up packages.json. The test reads the configuration and the manifests and installs
// nothing.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { JSONSchemaType } from 'ajv';
import { jsonDocument } from '../../scripts/json-document.mts';
import { readToml, tomlArray, tomlString, tomlTable } from '../../scripts/toml.mts';
import { isJsonObject, parsedJsonObject } from '../runner/checked.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

// The parts of config/release.json that the tests read.
interface ReleaseConfig {
  packages: { kind: string; directory: string; name: string; product: string; runtime: string }[];
  manifests: Record<string, string>;
  notReleased: Record<string, string>;
  goModules: Record<string, string>;
}
const STRINGS: JSONSchemaType<Record<string, string>> = { type: 'object', required: [], additionalProperties: { type: 'string' } };
const RELEASE_SCHEMA: JSONSchemaType<ReleaseConfig> = {
  type: 'object',
  properties: {
    packages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string' }, directory: { type: 'string' }, name: { type: 'string' }, product: { type: 'string' }, runtime: { type: 'string' },
        },
        required: ['kind', 'directory', 'name', 'product', 'runtime'],
        additionalProperties: false,
      },
    },
    manifests: STRINGS,
    notReleased: STRINGS,
    goModules: STRINGS,
  },
  required: ['packages', 'manifests', 'notReleased', 'goModules'],
};
const CONFIG = jsonDocument<ReleaseConfig>('release configuration', RELEASE_SCHEMA).read(path.join(ROOT, 'config/release.json'));

// The string `key` of the table `table` of a TOML manifest.
const tomlValue = (file: string, table: string, key: string) => tomlString(tomlTable(readToml(path.join(ROOT, file))[table], `[${table}] of ${file}`)[key], `${table}.${key} of ${file}`);

test('the packages of the release are the names that their manifests declare', () => {
  for (const { kind, directory, name } of CONFIG.packages) {
    if (kind === 'wheel') {
      assert.equal(tomlValue(`${directory}/pyproject.toml`, 'project', 'name'), name, `${directory}: pyproject.toml declares another name than ${name}`);
      continue;
    }
    const file = `${directory}/${kind === 'npm' ? 'package.json' : 'composer.json'}`;
    const manifestName = parsedJsonObject(read(file), file).name;
    assert.equal(manifestName, name, `${directory}: the manifest declares ${String(manifestName)}, config/release.json declares ${name}`);
  }
});

test('the legacy language packages and the binding packages are no release target', () => {
  // docs/spec/runtime.md#transition: the legacy packages leave the release until they are removed, and the binding
  // packages that bindgen scaffolds are released once the generated bindings pass the shared suite (V-6 (2)).
  const unreleased = [
    'legacy/packages/ts/package.json', 'legacy/packages/php/composer.json', 'legacy/packages/php-ext/composer.json',
    'legacy/packages/cli/php/composer.json', 'legacy/packages/python/pyproject.toml', 'legacy/packages/go/go.mod',
    'packages/ts/package.json', 'packages/ts/Cargo.toml', 'packages/python/pyproject.toml', 'packages/python/Cargo.toml',
    'packages/php-ext/composer.json', 'packages/php-ext/Cargo.toml',
  ];
  for (const file of unreleased) {
    assert.equal(CONFIG.manifests[file], undefined, `${file} is a manifest of the release`);
    assert.equal(typeof CONFIG.notReleased[file], 'string', `${file} names no reason in notReleased`);
  }
  assert.deepEqual(CONFIG.packages.filter(item => item.directory.startsWith('legacy/') || ['packages/ts', 'packages/python', 'packages/php-ext'].includes(item.directory)), []);
  assert.deepEqual(CONFIG.goModules, {});
});

test('the legacy TypeScript package is private under its own name', () => {
  const file = 'legacy/packages/ts/package.json';
  const manifest = parsedJsonObject(read(file), file);
  assert.equal(manifest.name, '@polyspec/template-legacy');
  assert.equal(manifest.private, true, `${file}: npm publishes no legacy package`);
});

test('the PHP extension reports the version of its composer.json', { timeout: 1000 }, () => {
  const header = 'legacy/packages/php-ext/src/php_polyspec_template.h';
  const manifest = 'legacy/packages/php-ext/composer.json';
  const reported = /^#define PHP_POLYSPEC_TEMPLATE_VERSION "([^"]*)"$/m.exec(read(header))?.[1];
  assert.equal(reported, parsedJsonObject(read(manifest), manifest).version, `${header}: PHP_POLYSPEC_TEMPLATE_VERSION is not the version of ${manifest}`);
});

test('the development root requires the json-schema fork by a release and its lock pins the tag', () => {
  // A branch of the fork moves, so the root requires a release of the fork, as its FORK.md states, and composer.lock records
  // the tag of that release (T27.1-63).
  const manifest = parsedJsonObject(read('composer.json'), 'composer.json');
  const requireDev = manifest['require-dev'];
  assert.ok(isJsonObject(requireDev), 'composer.json has no require-dev');
  const required = requireDev['min-0-max/json-schema'];
  assert.equal(typeof required, 'string', 'composer.json requires no min-0-max/json-schema');
  assert.match(String(required), /^\d+\.\d+\.\d+-p\d+$/, 'composer.json: the json-schema fork is required by a release');
  const lock = parsedJsonObject(read('composer.lock'), 'composer.lock');
  const locked = ['packages', 'packages-dev'].flatMap((key): unknown[] => {
    const entries: unknown = lock[key];
    return Array.isArray(entries) ? entries : [];
  }).filter(isJsonObject).find(item => item.name === 'min-0-max/json-schema');
  assert.ok(locked !== undefined, 'composer.lock has no min-0-max/json-schema');
  assert.equal(locked.version, `v${String(required)}`, 'composer.lock: the lock pins the tag of the release');
});

test('the Rust crate is released by git tag', () => {
  const file = 'packages/rust/Cargo.toml';
  assert.equal(CONFIG.manifests[file], 'git-tag', `${file}: the supported release installation uses its git tag`);
});

test('the Go module is released by its directory tag with the module path of its go.mod', () => {
  for (const [directory, module] of Object.entries(CONFIG.goModules)) {
    assert.match(read(`${directory}/go.mod`), new RegExp(`^module ${module.replaceAll('.', '\\.')}$`, 'm'), `${directory}/go.mod declares another module than ${module}`);
    assert.equal(module, `github.com/polyspec/template/${directory}`, 'go get finds the module only in its directory of the repository');
  }
});

// A local path crate appears in each consumer lock at the release version.
test('every tracked Cargo lock agrees with the local runtime version', () => {
  const name = tomlValue('packages/rust/Cargo.toml', 'package', 'name');
  const version = tomlValue('packages/rust/Cargo.toml', 'package', 'version');
  const files = spawnSync('git', ['ls-files', '-z', '*Cargo.lock'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(files.status, 0, files.stderr);
  const locks = files.stdout.split('\0').filter(Boolean);
  assert.ok(locks.length > 0, 'tracked Rust locks exist');
  for (const file of locks) {
    const entries = tomlArray(readToml(path.join(ROOT, file)).package, `${file} package`);
    for (const value of entries) {
      const entry = tomlTable(value, `${file} package entry`);
      if (entry.name === name && entry.source === undefined) assert.equal(entry.version, version, `${file}: local ${name} version`);
    }
  }
});
