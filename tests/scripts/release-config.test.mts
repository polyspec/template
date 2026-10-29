// Tests that config/release.json (scripts/kit/release.mjs, release-proof.mjs) names the packages that a tag releases as the
// manifests of the tree declare them (T22.4-22): the npm and Composer archives by their package names, the Python package as
// its wheel, and the Rust crate, which no registry holds, by git tag with the install that `make release-proof` runs from the
// tag. The test reads the configuration and the manifests and installs nothing.
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
import { toolsDirectory } from '../../scripts/tools-directory.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

// The parts of config/release.json that the tests read.
interface ReleaseConfig {
  packages: { kind: string; directory: string; name: string }[];
  manifests: Record<string, string>;
  consumers: { wheel: { smoke: Record<string, string[]> }; composer: { smoke: Record<string, string[]> } };
  proof: { gitTag: Record<string, { kind: string; name: string }> };
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
    consumers: {
      type: 'object',
      properties: {
        composer: {
          type: 'object',
          properties: { smoke: { type: 'object', required: [], additionalProperties: { type: 'array', items: { type: 'string' } } } },
          required: ['smoke'],
        },
        wheel: {
          type: 'object',
          properties: { smoke: { type: 'object', required: [], additionalProperties: { type: 'array', items: { type: 'string' } } } },
          required: ['smoke'],
        },
      },
      required: ['wheel', 'composer'],
    },
    proof: {
      type: 'object',
      properties: {
        gitTag: {
          type: 'object',
          required: [],
          additionalProperties: {
            type: 'object',
            properties: { kind: { type: 'string' }, name: { type: 'string' } },
            required: ['kind', 'name'],
          },
        },
      },
      required: ['gitTag'],
    },
    goModules: STRINGS,
  },
  required: ['packages', 'manifests', 'consumers', 'proof', 'goModules'],
};
const CONFIG = jsonDocument<ReleaseConfig>('release configuration', RELEASE_SCHEMA).read(path.join(ROOT, 'config/release.json'));

// The build backend of the wheel, `pythonBackend` of config/toolchain.json (kit K166); the file holds more.
interface Toolchain { pythonBackend: { requirement: string; sha256: string } }
const TOOLCHAIN_SCHEMA: JSONSchemaType<Toolchain> = {
  type: 'object',
  properties: {
    pythonBackend: {
      type: 'object',
      properties: { requirement: { type: 'string' }, sha256: { type: 'string' } },
      required: ['requirement', 'sha256'],
      additionalProperties: false,
    },
  },
  required: ['pythonBackend'],
};
const BACKEND = jsonDocument<Toolchain>('toolchain configuration', TOOLCHAIN_SCHEMA).read(path.join(ROOT, 'config/toolchain.json')).pythonBackend;

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

test('the Python package is released as a wheel named by its pyproject.toml, with a pinned build backend and a smoke import', () => {
  const file = 'packages/python/pyproject.toml';
  const wheel = CONFIG.packages.find(item => item.kind === 'wheel');
  assert.deepEqual(wheel, { kind: 'wheel', directory: 'packages/python', name: tomlValue(file, 'project', 'name') }, `${file}: the wheel package names another project than [project] name`);
  assert.equal(CONFIG.manifests[file], 'archive', `${file}: the wheel is released as an archive, so its version is set by the tag`);
  assert.equal(CONFIG.proof.gitTag[file], undefined, `${file}: the wheel is not installed by git tag`);
  assert.deepEqual(CONFIG.consumers.wheel.smoke, { 'polyspec-template': ['python', '-c', 'import polyspec.template'] }, 'the smoke command imports the package by its import name');
  assert.ok(read(file).includes(`requires = ["${BACKEND.requirement}"]`), `${file}: build-system.requires is not the pythonBackend ${BACKEND.requirement} of config/toolchain.json`);
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

test('the Composer smoke commands contain valid PHP source', { timeout: 5000 }, () => {
  for (const [name, command] of Object.entries(CONFIG.consumers.composer.smoke)) {
    assert.equal(command[0], 'php', name);
    assert.equal(command[1], '-r', name);
    const code = command[2];
    assert.ok(code !== undefined, `${name}: PHP source is missing`);
    const result = spawnSync(path.join(toolsDirectory(ROOT), 'bin/php'), ['-l'], { input: `<?php\n${code}`, encoding: 'utf8' });
    assert.equal(result.status, 0, `${name}: ${result.stdout}${result.stderr}`);
  }
});

test('the Rust crate is released by git tag with the name of its Cargo.toml', () => {
  const file = 'packages/rust/Cargo.toml';
  assert.equal(CONFIG.manifests[file], 'git-tag', `${file}: the supported release installation uses its git tag`);
  const proof = CONFIG.proof.gitTag[file];
  assert.ok(proof, `${file}: config/release.json has no proof.gitTag entry`);
  assert.equal(proof.kind, 'rust');
  assert.equal(proof.name, tomlValue(file, 'package', 'name'), `${file}: proof.gitTag names another package than [package] name`);
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
