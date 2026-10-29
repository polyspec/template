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
import { parsedJsonObject } from '../runner/checked.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

// The parts of config/release.json that the tests read.
interface ReleaseConfig {
  packages: { kind: string; directory: string; name: string }[];
  manifests: Record<string, string>;
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
        properties: { kind: { type: 'string' }, directory: { type: 'string' }, name: { type: 'string' } },
        required: ['kind', 'directory', 'name'],
        additionalProperties: false,
      },
    },
    manifests: STRINGS,
    goModules: STRINGS,
  },
  required: ['packages', 'manifests', 'goModules'],
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

test('the Python package is released as a wheel named by its pyproject.toml', () => {
  const file = 'packages/python/pyproject.toml';
  const wheel = CONFIG.packages.find(item => item.kind === 'wheel');
  assert.deepEqual(wheel, { kind: 'wheel', directory: 'packages/python', name: tomlValue(file, 'project', 'name') }, `${file}: the wheel package names another project than [project] name`);
  assert.equal(CONFIG.manifests[file], 'archive', `${file}: the wheel is released as an archive, so its version is set by the tag`);
});

test('the PHP command line is released separately from the runtime library', { timeout: 1000 }, () => {
  const file = 'packages/cli/php/composer.json';
  const manifest = parsedJsonObject(read(file), file);
  assert.deepEqual(CONFIG.packages.find(item => item.directory === 'packages/cli/php'), {
    kind: 'composer', directory: 'packages/cli/php', name: manifest.name,
  });
  assert.equal(CONFIG.manifests[file], 'archive');
  assert.equal(manifest.repositories, undefined, 'the CLI installs from released dependencies');
});

test('the Composer packages of the release are the packages of its packages.json', { timeout: 1000 }, () => {
  // Kit writes packages.json, the Composer repository of the release, from the Composer packages of config/release.json
  // (kit K871); a consumer reads the runtime library, the command line and the extension from it.
  const composer = CONFIG.packages.filter(item => item.kind === 'composer');
  assert.deepEqual(composer.map(item => item.name), ['polyspec/template', 'polyspec/template-cli', 'polyspec/template-php-ext']);
  for (const { directory } of composer) assert.equal(CONFIG.manifests[`${directory}/composer.json`], 'archive', `${directory}: packages.json takes the version of the tag`);
});

test('the PHP extension reports the version of its composer.json', { timeout: 1000 }, () => {
  const header = 'packages/php-ext/src/php_polyspec_template.h';
  const manifest = 'packages/php-ext/composer.json';
  const reported = /^#define PHP_POLYSPEC_TEMPLATE_VERSION "([^"]*)"$/m.exec(read(header))?.[1];
  assert.equal(reported, parsedJsonObject(read(manifest), manifest).version, `${header}: PHP_POLYSPEC_TEMPLATE_VERSION is not the version of ${manifest}`);
});

test('no Composer package directory tracks a composer.lock', { timeout: 5000 }, () => {
  // The archive of a Composer package is its directory at the tagged commit, so a tracked lock ships with it; a lock of the
  // monorepo locks the other packages by their path in the checkout, which an unpacked archive does not hold. The
  // development dependencies of every package resolve from the root composer.lock.
  const directories = CONFIG.packages.filter(item => item.kind === 'composer').map(item => item.directory);
  const tracked = spawnSync('git', ['ls-files', '--', ...directories.map(directory => `${directory}/composer.lock`)], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(tracked.status, 0, tracked.stderr);
  assert.deepEqual(tracked.stdout.split('\n').filter(Boolean), []);
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
  const files = spawnSync('git', ['ls-files', '-z', '**/Cargo.lock'], { cwd: ROOT, encoding: 'utf8' });
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
