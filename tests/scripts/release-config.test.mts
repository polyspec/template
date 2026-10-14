// Tests that config/release.json (scripts/kit/release.mjs, release-proof.mjs) names the packages that a tag releases as the
// manifests of the tree declare them (T22.4-22): the npm and Composer archives by their package names, the Python package as
// its wheel, and the Rust crate, which no registry holds, by git tag with the install that `make release-proof` runs from the
// tag. The test reads the configuration and the manifests and installs nothing.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { JSONSchemaType } from 'ajv';
import { jsonDocument } from '../../scripts/json-document.mts';
import { readToml, tomlString, tomlTable } from '../../scripts/toml.mts';
import { parsedJsonObject } from '../runner/checked.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

// The parts of config/release.json that the tests read.
interface ReleaseConfig {
  packages: { kind: string; directory: string; name: string }[];
  manifests: Record<string, string>;
  buildBackend: { requirement: string; sha256: string };
  consumers: { wheel: { smoke: Record<string, string[]> } };
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
    buildBackend: {
      type: 'object',
      properties: { requirement: { type: 'string' }, sha256: { type: 'string' } },
      required: ['requirement', 'sha256'],
    },
    consumers: {
      type: 'object',
      properties: {
        wheel: {
          type: 'object',
          properties: { smoke: { type: 'object', required: [], additionalProperties: { type: 'array', items: { type: 'string' } } } },
          required: ['smoke'],
        },
      },
      required: ['wheel'],
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
  required: ['packages', 'manifests', 'buildBackend', 'consumers', 'proof', 'goModules'],
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

test('the Python package is released as a wheel named by its pyproject.toml, with a pinned build backend and a smoke import', () => {
  const file = 'packages/python/pyproject.toml';
  const wheel = CONFIG.packages.find(item => item.kind === 'wheel');
  assert.deepEqual(wheel, { kind: 'wheel', directory: 'packages/python', name: tomlValue(file, 'project', 'name') }, `${file}: the wheel package names another project than [project] name`);
  assert.equal(CONFIG.manifests[file], 'archive', `${file}: the wheel is released as an archive, so its version is set by the tag`);
  assert.equal(CONFIG.proof.gitTag[file], undefined, `${file}: the wheel is not installed by git tag`);
  assert.deepEqual(Object.keys(CONFIG.buildBackend).sort(), ['requirement', 'sha256'], 'buildBackend holds the requirement and the sha256 only');
  assert.deepEqual(CONFIG.consumers.wheel.smoke, { 'polyspec-template': ['python', '-c', 'import polyspec.template'] }, 'the smoke command imports the package by its import name');
  assert.ok(read(file).includes(`requires = ["${CONFIG.buildBackend.requirement}"]`), `${file}: build-system.requires is not the buildBackend ${CONFIG.buildBackend.requirement}`);
});

test('the Rust crate is released by git tag with the name of its Cargo.toml', () => {
  const file = 'packages/rust/Cargo.toml';
  assert.equal(CONFIG.manifests[file], 'git-tag', `${file}: cargo package would rewrite its git dependencies, so no archive holds the crate`);
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
