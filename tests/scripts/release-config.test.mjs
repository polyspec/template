// Tests that config/release.json (scripts/kit/release.mjs, release-proof.mjs) names the packages that a tag releases as the
// manifests of the tree declare them (T22.4-22): the npm and Composer archives by their package names, and the Python
// package and the Rust crate, which no registry holds, by git tag with the install that `make release-proof` runs from the
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
    const manifest = JSON.parse(read(`${directory}/${kind === 'npm' ? 'package.json' : 'composer.json'}`));
    assert.equal(manifest.name, name, `${directory}: the manifest declares ${manifest.name}, config/release.json declares ${name}`);
  }
});

test('the Python package is released by git tag and installed from the tag by pip with the name of its pyproject.toml', () => {
  const file = 'packages/template-python/pyproject.toml';
  assert.equal(CONFIG.manifests[file], 'git-tag', `${file}: no archive holds the Python package`);
  const proof = CONFIG.proof.gitTag[file];
  assert.equal(proof.kind, 'python');
  assert.equal(proof.name, tomlValue(read(file), 'project', 'name'), `${file}: proof.gitTag names another package than [project] name`);
  assert.deepEqual(proof.smoke, ['python', '-c', 'import polyspec.template'], 'the smoke command imports the package by its import name');
  assert.equal(CONFIG.repositoryUrl, 'https://github.com/polyspec/template', 'pip installs git+<repositoryUrl>@<tag>#subdirectory=packages/template-python');
});

test('the Rust crate is released by git tag with the name of its Cargo.toml', () => {
  const file = 'packages/template-rust/Cargo.toml';
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
