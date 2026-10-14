// Tests that config/release.json (scripts/kit/release.mjs, release-proof.mjs) names the packages that a tag releases as the
// manifests of the tree declare them (T22.4-22): the npm and Composer archives by their package names, the Python package as
// its wheel, and the Rust crate, which no registry holds, by git tag with the install that `make release-proof` runs from the
// tag. The test reads the configuration and the manifests and installs nothing.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFileSync(path.join(ROOT, file), 'utf8');
const CONFIG = JSON.parse(read('config/release.json'));

// The value of `key = "value"` in a TOML table, read by its line: the manifests declare each name on one line.
const tomlValue = (text, table, key) => {
  const body = text.split(/^\[/m).find(part => part.startsWith(`${table}]`)) ?? '';
  return new RegExp(`^${key} = "([^"]+)"$`, 'm').exec(body)?.[1];
};

test('the packages of the release are the names that their manifests declare', () => {
  for (const { kind, directory, name } of CONFIG.packages) {
    if (kind === 'wheel') {
      assert.equal(tomlValue(read(`${directory}/pyproject.toml`), 'project', 'name'), name, `${directory}: pyproject.toml declares another name than ${name}`);
      continue;
    }
    const manifest = JSON.parse(read(`${directory}/${kind === 'npm' ? 'package.json' : 'composer.json'}`));
    assert.equal(manifest.name, name, `${directory}: the manifest declares ${manifest.name}, config/release.json declares ${name}`);
  }
});

test('the Python package is released as a wheel named by its pyproject.toml, with a pinned build backend and a smoke import', () => {
  const file = 'packages/python/pyproject.toml';
  const wheel = CONFIG.packages.find(item => item.kind === 'wheel');
  assert.deepEqual(wheel, { kind: 'wheel', directory: 'packages/python', name: tomlValue(read(file), 'project', 'name') }, `${file}: the wheel package names another project than [project] name`);
  assert.equal(CONFIG.manifests[file], 'archive', `${file}: the wheel is released as an archive, so its version is set by the tag`);
  assert.equal(CONFIG.proof?.gitTag?.[file], undefined, `${file}: the wheel is not installed by git tag`);
  assert.deepEqual(Object.keys(CONFIG.buildBackend).sort(), ['requirement', 'sha256'], 'buildBackend holds the requirement and the sha256 only');
  assert.deepEqual(CONFIG.consumers.wheel.smoke, { 'polyspec-template': ['python', '-c', 'import polyspec.template'] }, 'the smoke command imports the package by its import name');
  assert.ok(read(file).includes(`requires = ["${CONFIG.buildBackend.requirement}"]`), `${file}: build-system.requires is not the buildBackend ${CONFIG.buildBackend.requirement}`);
});

test('the Rust crate is released by git tag with the name of its Cargo.toml', () => {
  const file = 'packages/rust/Cargo.toml';
  assert.equal(CONFIG.manifests[file], 'git-tag', `${file}: cargo package would rewrite its git dependencies, so no archive holds the crate`);
  assert.equal(CONFIG.proof.gitTag[file].kind, 'rust');
  assert.equal(CONFIG.proof.gitTag[file].name, tomlValue(read(file), 'package', 'name'), `${file}: proof.gitTag names another package than [package] name`);
});

test('the Go module is released by its directory tag with the module path of its go.mod', () => {
  for (const [directory, module] of Object.entries(CONFIG.goModules)) {
    assert.match(read(`${directory}/go.mod`), new RegExp(`^module ${module.replaceAll('.', '\\.')}$`, 'm'), `${directory}/go.mod declares another module than ${module}`);
    assert.equal(module, `github.com/polyspec/template/${directory}`, 'go get finds the module only in its directory of the repository');
  }
});
