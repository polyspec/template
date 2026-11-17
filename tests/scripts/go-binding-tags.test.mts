// `make test-binding-go` runs the generated Go tests with the build tags of the test features of the Go binding, and the
// generator names each tag after the library and the feature, `polyspec_<library>_<feature>` (binding GN-15): a tag of
// another form turns on no generated test of template, and a tag of the form of another library, such as
// `polyspec_fault_test`, turns on the tests of a dependency, the Go module of json, that this checkout cannot link.
// The test reads the features from the manifest of the Go binding crate, the library from `packages/rust/interface.json`
// and the tags from the dry run of make test-binding-go.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { jsonDocument } from '../../scripts/json-document.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('make test-binding-go names the test features of the Go binding with the library of the contract', () => {
  const { library } = jsonDocument<{ library: string }>('interface contract', {
    type: 'object', required: ['library'], properties: { library: { type: 'string' } },
  }).read(path.join(ROOT, 'packages/rust/interface.json'));
  const manifest = readFileSync(path.join(ROOT, 'packages/go/internal/ffi/Cargo.toml'), 'utf8');
  const section = manifest.split(/^\[features\]$/mu)[1]?.split(/^\[/mu)[0] ?? '';
  const features = [...section.matchAll(/^([a-z][a-z0-9-]*) = /gmu)].map(match => match[1]?.replaceAll('-', '_'));
  assert.ok(features.length > 0, 'the Go binding crate has test features');
  const output = execFileSync('make', ['--no-print-directory', '-n', 'test-binding-go'], { cwd: ROOT, encoding: 'utf8' });
  const tags = new Set([...output.matchAll(/GOFLAGS=-tags=(\S+)/gu)].flatMap(match => match[1]?.split(',') ?? []));
  assert.deepEqual([...tags].sort(), features.map(feature => `polyspec_${library}_${feature}`).sort());
});
