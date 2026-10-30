// Tests that each generated and install check runs Python beside TypeScript, Go, Rust and PHP (T22.4-20). A check
// covers Python when its `checkLanguages` call names a `Python` entry; a language that a check cannot run is fixed in the
// implementation, never recorded as unsupported. Each check is listed when its row of docs/plans/execution/checklist.md
// is done.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { adapterRoot, generatedLanguages, generatedOutput } from '../../examples/showcase/generated-output.mts';
import { compilerManifestDocument, manifestPath } from '../../scripts/compiler-manifest.mts';
import { jobs, runsOf, runLines } from './workflows.mts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const checks = [
  'scripts/check-generated-typed-values.mts',
  'scripts/check-generated-arguments.mts',
  'scripts/check-generated-bound-data.mts',
  'scripts/check-generated-native-calls.mts',
  'scripts/check-typed-generator.mts',
  'scripts/check-package-installs.mts',
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

// The checks run the pinned interpreter var/tools/mise/shims/python3 (scripts/python-toolchain.mts), the python of mise.toml
// that `make install` installs (T22.5-5, T24.12). A job that runs one of these targets runs make install, and no job sets up a Python of its own.
const pythonTargets = ['template-test-scripts', 'template-install-check', 'generated-native-check', 'typed-generator-compile-check', 'showcase-check'];

test('each CI job that runs a Python check target runs make install and sets up no Python of PATH', () => {
  const all = jobs('.github/workflows/ci.yml');
  const needing = all.filter(job => runLines(job).some(line => {
    // A step without make ci-targets runs no check target.
    const listed = /make ci-targets TARGETS="([^"]*)"/.exec(line)?.[1];
    return listed !== undefined && listed.split(/\s+/).some(target => pythonTargets.includes(target));
  }));
  assert.ok(needing.length >= 3, `found ${needing.length} jobs that run a Python check target, expected at least 3`);
  for (const job of needing) {
    assert.ok(runsOf(job).includes('make install'), `the job ${job.name} runs a Python check target and does not run make install, which installs the pinned Python`);
  }
  assert.ok(!all.some(job => job.steps.some(step => step.uses?.startsWith('actions/setup-python@') === true)), 'a workflow sets up a Python of PATH; the checks run the pinned interpreter of make install');
});

// The showcase contract has a Python implementation: the manifest maps Python, scripts/check-showcase-contract.mts runs it
// in both execution modes, and the tracked adapter examples/showcase/adapters/python.py imports the generated Python
// modules. Those modules are not tracked: make contract-generate writes the declarations at the `generated` path of the
// Python mapping (scripts/generate-showcase-contract.mts), and make typed-generator writes the program of each scenario
// at the path of examples/showcase/generated-output.mts. The case reads these declarations, never the generated files.
test('the showcase contract checks a Python adapter and the generated Python programs of every scenario', () => {
  const manifest = compilerManifestDocument.read(manifestPath(root)).showcaseAdapter;
  const python = manifest.languages.python;
  assert.ok(python, 'interface.json showcaseAdapter.languages names no python');
  assert.match(readFileSync(join(root, 'scripts/check-showcase-contract.mts'), 'utf8'), /const languageNames = \[[^\]]*'python'/, 'check-showcase-contract.mts does not run python');
  assert.match(readFileSync(join(root, 'scripts/generate-showcase-contract.mts'), 'utf8'), /\[declarations\('python'\), pythonDeclarations\(\)\]/, 'generate-showcase-contract.mts writes no Python declarations at the declared path');
  const adapter = readFileSync(join(adapterRoot, python.file), 'utf8');
  const declarations = python.generated.replace(/\.py$/, '').replaceAll('/', '.');
  assert.match(adapter, new RegExp(`^from ${declarations.replaceAll('.', '\\.')} import \\(`, 'm'), `examples/showcase/adapters/${python.file} does not import ${declarations}, the declarations at ${python.generated}`);
  const scenarios = readdirSync(join(root, 'examples/site/scenarios'), { withFileTypes: true }).filter(entry => entry.isDirectory() && existsSync(join(root, 'examples/site/scenarios', entry.name, 'scenario.json'))).map(entry => entry.name);
  assert.ok(scenarios.length >= 5, `found ${scenarios.length} showcase scenarios, expected at least 5`);
  assert.ok(generatedLanguages.includes('python'), 'the typed generator compiles no scenario into Python');
  const typed = join(adapterRoot, 'generated/typed');
  const modules = scenarios.map(id => {
    const output = generatedOutput(id, 'python');
    assert.equal(dirname(output), typed, `the Python program of ${id} is not written into generated/typed, the package generated.typed`);
    return basename(output, '.py');
  });
  const imported = /^from generated\.typed import \(([^)]*)\)/m.exec(adapter)?.[1]?.split(',').map(name => name.trim()).filter(name => name !== '') ?? [];
  assert.deepEqual(imported.toSorted(), modules.toSorted(), `examples/showcase/adapters/${python.file} imports generated.typed modules other than the Python programs of the scenarios`);
});
