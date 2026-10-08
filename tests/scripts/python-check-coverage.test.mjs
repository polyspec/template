// Tests that each generated and install check runs Python beside TypeScript, Go, Rust and PHP (T22.4-20). A check
// covers Python when its `checkLanguages` call names a `Python` entry; a language that a check cannot run is fixed in the
// implementation, never recorded as unsupported. Each check is listed when its row of docs/plans/execution-checklist.md
// is done.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const checks = [
  'scripts/check-generated-typed-values.mjs',
  'scripts/check-generated-arguments.mjs',
  'scripts/check-generated-bound-data.mjs',
  'scripts/check-generated-native-calls.mjs',
  'scripts/check-typed-generator.mjs',
];

for (const check of checks) {
  test(`${check} names a Python entry in its checkLanguages call`, () => {
    const source = readFileSync(join(root, check), 'utf8');
    const call = source.indexOf('checkLanguages(');
    assert.ok(call >= 0, `${check} has no checkLanguages call`);
    assert.match(source.slice(call), /\bPython\s*:/, `${check} lists no Python entry after its checkLanguages call`);
    assert.match(source, /TypeScript, Go, Rust, PHP and Python/, `${check} does not name Python in its closing message`);
  });
}

// The checks run `python<minor>` of .python-version (scripts/python-toolchain.mjs), which a CI job has only after
// actions/setup-python installed it. A job that runs one of these targets sets Python up from .python-version.
const pythonTargets = ['test-scripts', 'install-check', 'generated-native-check', 'typed-generator-compile-check', 'showcase-check'];

test('each CI job that runs a Python check target sets up the Python of .python-version', () => {
  const workflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
  const jobs = workflow.slice(workflow.indexOf('\njobs:')).split(/\n(?=  [a-z][a-z-]*:\n)/).slice(1);
  const needing = jobs.filter(job => {
    const targets = job.match(/make ci-targets TARGETS="([^"]*)"/)?.[1].split(/\s+/) ?? [];
    return targets.some(target => pythonTargets.includes(target));
  });
  assert.ok(needing.length >= 3, `found ${needing.length} jobs that run a Python check target, expected at least 3`);
  for (const job of needing) {
    assert.match(job, /uses: actions\/setup-python@[0-9a-f]{40} # v[\d.]+\n\s+with:\n\s+python-version-file: \.python-version\n/, `the job ${job.split('\n')[0].trim()} runs a Python check target and does not set up python-version-file: .python-version`);
  }
});

// The showcase contract has a Python implementation: the manifest maps Python, scripts/check-showcase-contract.mjs runs it
// in both execution modes, and the generated Python programs of the scenarios are committed beside the other languages.
test('the showcase contract checks a Python adapter and the generated Python programs of every scenario', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'packages/template-compiler/interface.json'), 'utf8')).showcaseAdapter;
  const python = manifest.languages.python;
  assert.ok(python, 'interface.json showcaseAdapter.languages names no python');
  assert.match(readFileSync(join(root, 'scripts/check-showcase-contract.mjs'), 'utf8'), /const languageNames = \[[^\]]*'python'/, 'check-showcase-contract.mjs does not run python');
  const adapters = join(root, 'tools/showcase/adapters');
  for (const file of [python.file, python.generated]) assert.ok(existsSync(join(adapters, file)), `tools/showcase/adapters/${file} is missing`);
  const scenarios = readdirSync(join(root, 'examples/site/scenarios'), { withFileTypes: true }).filter(entry => entry.isDirectory() && existsSync(join(root, 'examples/site/scenarios', entry.name, 'scenario.json'))).map(entry => entry.name);
  assert.ok(scenarios.length >= 5, `found ${scenarios.length} showcase scenarios, expected at least 5`);
  for (const id of scenarios) assert.ok(existsSync(join(adapters, 'generated/typed', `${id}.py`)), `generated/typed/${id}.py is missing`);
});
