// Tests that the unit tests of the TypeScript packages and of the VS Code extension run through
// the run-tests tool of the package @polyspec/kit, which prints each test with its elapsed time and gives it its own timeout.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// make -n prints the node of the checkout, $(NODE) of kit.mk, by its absolute path (kit K171).
const NODE = path.join(ROOT, 'var/tools/bin/node');

// The commands that make prints for `target` without running them. A make started by another make, as `make check`
// starts `make template-test-scripts`, prints `Entering directory` lines with GNU Make 4 (T17.1-4); MAKEFLAGS=w makes every make
// print them, and --no-print-directory removes them, so the lines are the commands on every make.
function commands(target: string) {
  const run = spawnSync('make', ['--no-print-directory', '-n', target], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MAKEFLAGS: 'w' } });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.split('\n');
}

const RUNS_TESTS_DIRECTLY = /\bnpm (?:test|run test:extension)\b|\bvitest\b(?! --cwd)|\bnode --test\b/;

const RUNNERS: [string, string][] = [
  ['test-ts', `${NODE} node_modules/@polyspec/kit/dist/run-tests.mjs vitest --cwd packages/ts`],
  ['template-test-language', `${NODE} node_modules/@polyspec/kit/dist/run-tests.mjs vitest --cwd packages/language`],
  ['template-test-lsp', `${NODE} node_modules/@polyspec/kit/dist/run-tests.mjs vitest --cwd packages/lsp`],
  ['template-test-codemirror', `${NODE} node_modules/@polyspec/kit/dist/run-tests.mjs vitest --cwd packages/codemirror`],
  ['template-test-vscode', `${NODE} node_modules/@polyspec/kit/dist/run-tests.mjs node --cwd packages/vscode -- tests/extension.test.mjs tests/integration-step.test.mjs tests/integration-wait.test.mjs`],
];
for (const [target, runner] of RUNNERS) {
  test(`${target} runs its unit tests through the run-tests tool of @polyspec/kit`, () => {
    const lines = commands(target);
    assert.ok(lines.includes(runner), lines.join('\n'));
    assert.deepEqual(lines.filter(line => !line.startsWith(`${NODE} node_modules/@polyspec/kit/dist/run-tests.mjs`) && RUNS_TESTS_DIRECTLY.test(line)), []);
  });
}

// The targets that run PHP with the Composer packages of the development root composer.json (vendor/autoload.php), with
// the file that reads them. A target installs them first with build-php, so it passes on a checkout without vendor (T19.5).
const PHP_READERS: [string, string][] = [
  ['conformance-generated-php', 'tests/runner/conformance-generated-php.mts'],
  ['contract-check', 'scripts/check-showcase-contract.mts runs examples/showcase/adapters/php.php'],
  ['benchmark-smoke', 'scripts/check-benchmark-smoke.mts runs examples/showcase/adapters/php.php'],
  ['generated-native-check', 'scripts/check-generated-native-calls.mts'],
  ['bench', 'examples/showcase/benchmark-modes.mts runs examples/showcase/adapters/php.php'],
  ['showcase', 'examples/showcase/build.mts runs examples/showcase/adapters/php.php'],
  ['typed-generator-compile-check', 'scripts/check-typed-generator.mts'],
  ['compiler-interface-check', 'scripts/check-compiler-interface.mts'],
  ['test-php', 'node_modules/@polyspec/kit/dist/run-tests.mjs phpunit'],
];
for (const [target, reader] of PHP_READERS) {
  test(`${target} installs the Composer packages of the root composer.json before ${reader}`, () => {
    const lines = commands(target);
    const install = lines.indexOf(`${NODE} scripts/composer-install.mts .`);
    assert.notEqual(install, -1, `make -n ${target} does not install the Composer packages of the root composer.json:\n${lines.join('\n')}`);
  });
}
