// Tests scripts/run-tests.mjs: every test prints its start, its result and its elapsed time, and a
// test that outlives its timeout fails by its name while the run ends.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { cargoEvents, goEvents, parseArguments, phpunitEvents, toolCommand } from '../../scripts/run-tests.mjs';
import { createProgress } from '../../scripts/test-progress/progress.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RUNNER = path.join(ROOT, 'scripts/run-tests.mjs');
// A test that compiles a Go module or a Rust crate has its own longer timeout.
const COMPILES = { timeout: 120_000 };

function recorder() {
  const lines = [];
  let clock = 0;
  const progress = createProgress({ write: text => lines.push(text.replace(/^\[\s*[\d.]+s\] /, '').trim()), now: () => clock, heartbeatMs: 60_000 });
  return { lines, progress, tick: ms => { clock += ms; } };
}

async function withDirectory(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'template-run-tests-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function runner(args, options = {}) {
  const started = Date.now();
  const run = spawnSync(process.execPath, [RUNNER, ...args], { encoding: 'utf8', ...options });
  return { ...run, elapsed: Date.now() - started };
}

test('arguments select a tool, a per-test timeout and a directory', () => {
  assert.deepEqual(parseArguments(['node', '--timeout', '5', '--', 'a.test.mjs']), { tool: 'node', timeoutSeconds: 5, cwd: ROOT, args: ['a.test.mjs'] });
  assert.equal(parseArguments(['go', '--cwd', 'packages/template-go']).cwd, path.join(ROOT, 'packages/template-go'));
  assert.deepEqual(parseArguments(['vitest', '--cwd', 'packages/template-ts', 'tests/a.test.ts']).args, ['tests/a.test.ts']);
  assert.deepEqual(parseArguments(['node', '--test-name-pattern', 'x']).args, ['--test-name-pattern', 'x']);
  for (const argv of [[], ['jest'], ['node', '--timeout', '0'], ['node', '--timeout', '1.5'], ['node', '--cwd']]) assert.throws(() => parseArguments(argv), /Usage/, JSON.stringify(argv));
  assert.ok(toolCommand(parseArguments(['node', '--timeout', '5'])).args.includes('--test-timeout=5000'));
  const vitest = toolCommand(parseArguments(['vitest', '--timeout', '5'])).args;
  assert.ok(vitest.includes('--testTimeout=5000') && vitest.includes('--hookTimeout=5000'), vitest.join(' '));
  // go test has no limit on a whole test binary; the runner limits each test.
  assert.deepEqual(toolCommand(parseArguments(['go', '--', '-race', './...'])), { command: 'go', args: ['test', '-json', '-count=1', '-timeout=0', '-race', './...'] });
  assert.deepEqual(toolCommand(parseArguments(['cargo', '--', '--locked', '--test', 'a', '--', '--exact'])), { command: 'cargo', args: ['test', '--locked', '--test', 'a', '--', '--test-threads=1', '--exact'] });
  assert.deepEqual(toolCommand(parseArguments(['phpunit', '--cwd', 'packages/template-php', '--', '--filter', 'X'])), {
    command: path.join(ROOT, 'packages/template-php/vendor/bin/phpunit'),
    args: ['--teamcity', '--filter', 'X'],
  });
});

test('go test events become start, pass, fail and skip lines with failure output', () => {
  const { lines, progress } = recorder();
  const read = goEvents(progress);
  for (const event of [
    { Action: 'start', Package: 'p' },
    { Action: 'run', Package: 'p', Test: 'TestA' },
    { Action: 'run', Package: 'p', Test: 'TestA/case' },
    { Action: 'output', Package: 'p', Test: 'TestA/case', Output: '    a_test.go:9: wrong value\n' },
    { Action: 'fail', Package: 'p', Test: 'TestA/case', Elapsed: 0.25 },
    { Action: 'fail', Package: 'p', Test: 'TestA', Elapsed: 0.3 },
    { Action: 'run', Package: 'p', Test: 'TestB' },
    { Action: 'skip', Package: 'p', Test: 'TestB' },
    { Action: 'run', Package: 'p', Test: 'TestC' },
    { Action: 'pass', Package: 'p', Test: 'TestC', Elapsed: 0 },
    { Action: 'fail', Package: 'p', Elapsed: 1 },
  ]) read(JSON.stringify(event));
  assert.deepEqual(lines, [
    '▶ p', '▶ p › TestA', '▶ p › TestA › case', '✖ p › TestA › case (0.3s)', 'a_test.go:9: wrong value', '✖ p › TestA (0.3s)',
    '▶ p › TestB', '○ p › TestB skipped', '▶ p › TestC', '✔ p › TestC (0.0s)', '✖ p (1.0s)',
  ]);
  assert.deepEqual(progress.counts, { passed: 1, failed: 2, skipped: 1, timedOut: 0 });
});

test('serial libtest output starts a test before its result arrives', () => {
  const { lines, progress, tick } = recorder();
  const events = cargoEvents(progress);
  events.stderr('     Running tests/a.rs (target/debug/deps/a-1)');
  events.stdout('\nrunning 2 tests\ntest first ... ');
  assert.equal(lines.at(-1), '▶ tests/a.rs › first');
  tick(1500);
  events.stdout('ok\ntest second ... ');
  events.stdout('FAILED\n\nfailures:\n\n---- second stdout ----\nboom\ntest result: FAILED. 1 passed; 1 failed\n');
  assert.deepEqual(lines, [
    'Running tests/a.rs (target/debug/deps/a-1)', '▶ tests/a.rs › first', '✔ tests/a.rs › first (1.5s)',
    '▶ tests/a.rs › second', '✖ tests/a.rs › second (0.0s)', '---- second stdout ----', 'boom',
  ]);
});

test('PHPUnit TeamCity messages name each test by class and method and other lines are printed', () => {
  const { lines, progress } = recorder();
  const read = phpunitEvents(progress);
  for (const line of [
    'PHPUnit 11.5.56 by Sebastian Bergmann and contributors.',
    '',
    "##teamcity[testSuiteStarted name='Suite' flowId='1']",
    "##teamcity[testSuiteStarted name='A\\ATest' locationHint='php_qn:///t/ATest.php::\\A\\ATest' flowId='1']",
    "##teamcity[testSuiteStarted name='testA' locationHint='php_qn:///t/ATest.php::\\A\\ATest::testA' flowId='1']",
    "##teamcity[testStarted name='testA with data set \"x\"' locationHint='php_qn:///t/ATest.php::\\\\A\\\\ATest::testA with data set \"x\"' flowId='1']",
    "##teamcity[testFailed name='testA with data set \"x\"' message='Failed asserting |'1|'' details='at ATest.php:3|n' flowId='1']",
    "##teamcity[testFinished name='testA with data set \"x\"' duration='12' flowId='1']",
    "##teamcity[testSuiteFinished name='testA' flowId='1']",
    "##teamcity[testStarted name='testB' locationHint='php_qn:///t/ATest.php::\\\\A\\\\ATest::testB' flowId='1']",
    "##teamcity[testFinished name='testB' duration='0' flowId='1']",
    "##teamcity[testStarted name='testC' locationHint='php_qn:///t/ATest.php::\\\\A\\\\ATest::testC' flowId='1']",
    "##teamcity[testFailed name='testC' message='This test was aborted after 10 seconds' details='' flowId='1']",
    "##teamcity[testFailed name='testC' message='This test did not perform any assertions' details='' flowId='1']",
    "##teamcity[testFinished name='testC' duration='10000' flowId='1']",
    "##teamcity[testSuiteFinished name='A\\ATest' flowId='1']",
    "##teamcity[testSuiteFinished name='Suite' flowId='1']",
    'Test file "/missing.php" not found',
  ]) read(line);
  // The class and the data provider method are suites, not tests: three tests ran.
  assert.deepEqual(progress.counts, { passed: 1, failed: 2, skipped: 0, timedOut: 0 });
  assert.deepEqual(lines, [
    'PHPUnit 11.5.56 by Sebastian Bergmann and contributors.', '▶ Suite', '▶ ATest::testA with data set "x"', '✖ ATest::testA with data set "x" (0.0s)', "Failed asserting '1'", 'at ATest.php:3',
    '▶ ATest::testB', '✔ ATest::testB (0.0s)',
    '▶ ATest::testC', '✖ ATest::testC (10.0s)', 'This test was aborted after 10 seconds', 'This test did not perform any assertions',
    '✔ Suite (0.0s)', 'Test file "/missing.php" not found',
  ]);
});

test('a node test that outlives its timeout fails by its name and the run ends', async () => {
  await withDirectory(async directory => {
    const file = path.join(directory, 'hang.test.mjs');
    await writeFile(file, "import test from 'node:test';\ntest('hangs', () => new Promise(resolve => setTimeout(resolve, 600_000)));\ntest('passes', () => {});\n");
    const run = runner(['node', '--timeout', '1', '--', file]);
    assert.ok(run.elapsed < 20_000, 'The run did not stop at the timeout');
    assert.notEqual(run.status, 0);
    assert.match(run.stdout, /▶ .*hang\.test\.mjs › hangs\n/);
    assert.match(run.stdout, /✖ .*hang\.test\.mjs › hangs \(1\.0s\)\n\s+test timed out after 1000ms/);
    assert.match(run.stdout, /✔ .*hang\.test\.mjs › passes \(\d+\.\ds\)/);
  });
});

test('a vitest test that outlives its timeout fails by its name and the run ends', async () => {
  await withDirectory(async directory => {
    await writeFile(path.join(directory, 'hang.test.mjs'), "import { test } from 'vitest';\ntest('hangs', () => new Promise(resolve => setTimeout(resolve, 600_000)));\ntest('passes', () => {});\n");
    const run = runner(['vitest', '--timeout', '1', '--cwd', directory]);
    assert.ok(run.elapsed < 20_000, 'The run did not stop at the timeout');
    assert.notEqual(run.status, 0);
    assert.match(run.stdout, /▶ .*hang\.test\.mjs › hangs\n/);
    assert.match(run.stdout, /✖ .*hang\.test\.mjs › hangs \(1\.0s\)\n\s+Error: Test timed out in 1000ms/);
    assert.match(run.stdout, /✔ .*hang\.test\.mjs › passes \(\d+\.\ds\)/);
  });
});

test('a Go test that outlives its timeout stops go test and fails by its name', COMPILES, async () => {
  await withDirectory(async directory => {
    await writeFile(path.join(directory, 'go.mod'), 'module example.com/hang\n\ngo 1.24\n');
    await writeFile(path.join(directory, 'hang_test.go'), 'package hang\n\nimport (\n\t"testing"\n\t"time"\n)\n\nfunc TestPasses(t *testing.T) {}\n\nfunc TestHangs(t *testing.T) { time.Sleep(time.Hour) }\n');
    const run = runner(['go', '--timeout', '1', '--cwd', directory, '--', './...']);
    assert.ok(run.elapsed < 60_000, 'The run did not stop at the timeout');
    assert.notEqual(run.status, 0);
    assert.match(run.stdout, /✔ example\.com\/hang › TestPasses \(\d+\.\ds\)\n/);
    assert.match(run.stdout, /▶ example\.com\/hang › TestHangs\n/);
    assert.match(run.stdout, /⏱ example\.com\/hang › TestHangs exceeded its 1\.0s timeout\n/);
    assert.match(run.stdout, /✖ example\.com\/hang › TestHangs \(\d+\.\ds\)\n\s+the test did not finish/);
    assert.match(run.stdout, /✖ go .*: 1 passed, 1 failed, 1 timed out, 0 skipped/);
  });
});

test('a Go module that does not compile prints its build errors and the summary names them', COMPILES, async () => {
  // go test -json reports the compiler output as build-output events and the end of the build as a build-fail event
  // (T19.3); the runner dropped both, so the run said only that the package failed.
  await withDirectory(async directory => {
    await writeFile(path.join(directory, 'go.mod'), 'module example.com/broken\n\ngo 1.24\n');
    await writeFile(path.join(directory, 'broken_test.go'), 'package broken\n\nimport "testing"\n\nfunc TestBroken(t *testing.T) { missing() }\n');
    const run = runner(['go', '--cwd', directory, '--', './...']);
    assert.notEqual(run.status, 0);
    assert.match(run.stdout, /^\[\s*[\d.]+s\] .*broken_test\.go:5:33: undefined: missing$/m, run.stdout);
    assert.match(run.stdout, /✖ build of example\.com\/broken(?: \[example\.com\/broken\.test\])? failed/, run.stdout);
    assert.match(run.stdout, /✖ go .*: .*; build errors: .*broken_test\.go:5:33: undefined: missing/, run.stdout);
  });
});

test('a Rust test that outlives its timeout stops cargo test and fails by its name', COMPILES, async () => {
  await withDirectory(async directory => {
    await mkdir(path.join(directory, 'src'));
    await writeFile(path.join(directory, 'Cargo.toml'), '[package]\nname = "hang"\nversion = "0.0.0"\nedition = "2021"\n');
    await writeFile(path.join(directory, 'src/lib.rs'), '#[test]\nfn passes() {}\n\n#[test]\nfn zz_hangs() {\n    std::thread::sleep(std::time::Duration::from_secs(3600));\n}\n');
    const run = runner(['cargo', '--timeout', '1', '--cwd', directory, '--', '--offline'], { env: { ...process.env, CARGO_TARGET_DIR: path.join(directory, 'target') } });
    assert.ok(run.elapsed < 60_000, 'The run did not stop at the timeout');
    assert.notEqual(run.status, 0);
    assert.match(run.stdout, /✔ .* › passes \(\d+\.\ds\)\n/);
    assert.match(run.stdout, /⏱ .* › zz_hangs exceeded its 1\.0s timeout\n/);
    assert.match(run.stdout, /✖ .* › zz_hangs \(\d+\.\ds\)\n\s+the test did not finish/);
    assert.match(run.stdout, /✖ cargo .*: 1 passed, 1 failed, 1 timed out, 0 skipped/);
  });
});

test('a PHPUnit test that outlives its timeout stops PHPUnit and fails by its name', async () => {
  // The test creates the PHPUnit that it runs, as make build-php does (T18.7-1); with an unchanged lock it installs nothing.
  const install = spawnSync('composer', ['install', '--no-interaction', '--quiet'], { cwd: path.join(ROOT, 'packages/template-php'), encoding: 'utf8' });
  assert.equal(install.status, 0, install.stdout + install.stderr);
  await withDirectory(async directory => {
    const file = path.join(directory, 'HangTest.php');
    await writeFile(file, '<?php\nuse PHPUnit\\Framework\\TestCase;\nfinal class HangTest extends TestCase {\n    public function testHangs(): void { sleep(600); $this->assertTrue(true); }\n}\n');
    const run = runner(['phpunit', '--timeout', '1', '--cwd', 'packages/template-php', '--', '--no-configuration', file]);
    assert.ok(run.elapsed < 20_000, 'The run did not stop at the timeout');
    assert.notEqual(run.status, 0);
    assert.match(run.stdout, /▶ HangTest::testHangs\n/);
    assert.match(run.stdout, /⏱ HangTest::testHangs exceeded its 1\.0s timeout\n/);
    assert.match(run.stdout, /✖ HangTest::testHangs \(\d+\.\ds\)\n\s+the test did not finish/);
    assert.match(run.stdout, /✖ phpunit .*: 0 passed, 1 failed, 1 timed out, 0 skipped \(\d+\.\ds\)/);
  });
});

test('a tool that fails before any test runs fails the summary line too', COMPILES, async () => {
  await withDirectory(async directory => {
    await mkdir(path.join(directory, 'src'));
    await writeFile(path.join(directory, 'Cargo.toml'), '[package]\nname = "broken"\nversion = "0.0.0"\nedition = "2021"\n');
    await writeFile(path.join(directory, 'src/lib.rs'), '#[test]\nfn broken() { undefined(); }\n');
    const run = runner(['cargo', '--cwd', directory, '--', '--offline'], { env: { ...process.env, CARGO_TARGET_DIR: path.join(directory, 'target') } });
    assert.notEqual(run.status, 0);
    assert.doesNotMatch(run.stdout, /✔ cargo /);
    assert.match(run.stdout, /✖ cargo .*: 0 passed, 0 failed, 0 timed out, 0 skipped, the tool exited with [1-9]\d*: error\[E0425\]: cannot find function `undefined`/);
  });
});

test('the summary of a tool that exits without a failing test names the error lines of the tool', async () => {
  // The cargo of this case is a stub that fails as rustup fails on a toolchain without its cargo component (T18.7-1).
  await withDirectory(async directory => {
    const bin = path.join(directory, 'bin');
    await mkdir(bin);
    await writeFile(path.join(bin, 'cargo'), "#!/bin/sh\necho 'info: syncing channel updates' >&2\necho \"error: the 'cargo' binary is not applicable to the example toolchain\" >&2\nexit 1\n", { mode: 0o755 });
    const run = runner(['cargo', '--cwd', directory], { env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` } });
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.match(run.stdout, /^\[\s*[\d.]+s\] ✖ cargo .*: 0 passed, 0 failed, 0 timed out, 0 skipped, the tool exited with 1: error: the 'cargo' binary is not applicable to the example toolchain \(\d+\.\ds\)$/m);
  });
});

test('a node run that ends with a failure after its tests passed says so on a failure line', async () => {
  // The reporter prints its passing summary from inside node --test; when node --test itself then
  // ends on a signal or a nonzero code, the run fails and a line names why.
  await withDirectory(async directory => {
    const file = path.join(directory, 'killed.test.mjs');
    await writeFile(file, "import test from 'node:test';\ntest('passes', () => {});\ntest.after(() => process.kill(process.ppid, 'SIGKILL'));\n");
    const run = runner(['node', '--timeout', '10', '--', file]);
    assert.notEqual(run.status, 0);
    assert.match(run.stdout, /✖ node .*killed\.test\.mjs: the tool ended on SIGKILL/);
  });
});

test('a node hook that runs out of time fails its file with the file and the elapsed time', async () => {
  // node --test reports a timed-out hook of a file only as a failure of the file's process,
  // without a completion of that test; the file itself still completes as passed.
  await withDirectory(async directory => {
    const file = path.join(directory, 'hook.test.mjs');
    await writeFile(file, "import test from 'node:test';\ntest('passes', () => {});\ntest.after(() => new Promise(resolve => setTimeout(resolve, 600_000)), { timeout: 300 });\n");
    const run = runner(['node', '--timeout', '10', '--', file]);
    assert.notEqual(run.status, 0);
    assert.match(run.stdout, /✔ .*hook\.test\.mjs › passes/);
    assert.match(run.stdout, /✖ .*hook\.test\.mjs › hook \(\d+\.\ds\)\n\s+test timed out after 300ms/);
    assert.match(run.stdout, /✖ .*hook\.test\.mjs \(\d+\.\ds\)\n/);
    assert.match(run.stdout, /✖ node --test: 1 passed, 1 failed, 0 timed out, 0 skipped, 1 group failed/);
  });
});

test('a vitest hook that runs out of time is printed with its file, suite, cause and elapsed time', async () => {
  await withDirectory(async directory => {
    await writeFile(path.join(directory, 'file-hook.test.mjs'), "import { afterAll, test } from 'vitest';\ntest('passes', () => {});\nafterAll(() => new Promise(resolve => setTimeout(resolve, 600_000)), 300);\n");
    await writeFile(path.join(directory, 'suite-hook.test.mjs'), "import { afterAll, describe, test } from 'vitest';\ndescribe('suite', () => {\n  afterAll(() => new Promise(resolve => setTimeout(resolve, 600_000)), 300);\n  test('passes', () => {});\n});\n");
    const run = runner(['vitest', '--timeout', '10', '--cwd', directory]);
    assert.notEqual(run.status, 0);
    assert.match(run.stdout, /✖ .*file-hook\.test\.mjs \(\d+\.\ds\)\n\s+(?:Error: )?Hook timed out in 300ms/);
    assert.match(run.stdout, /✖ .*suite-hook\.test\.mjs › suite \(\d+\.\ds\)\n\s+(?:Error: )?Hook timed out in 300ms/);
    assert.match(run.stdout, /✖ vitest: 2 passed, 0 failed, 0 timed out, 0 skipped, 3 groups failed/);
  });
});
