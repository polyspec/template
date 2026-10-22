// The Rust generated conformance builds its test crate before it runs the tests with the timeout of a case (T26.7-79).
import assert from 'node:assert/strict';
import test from 'node:test';
import { rustBuildArgs, rustRunArgs } from '../runner/rust-steps.mts';

test('the test crate is built without running it, and only the run has the timeout of a case', () => {
  assert.deepEqual(rustBuildArgs('generated_conformance_check'), ['test', '--no-run', '--locked', '--offline', '--test', 'generated_conformance_check']);
  const run = rustRunArgs('generated_conformance_check', '/tmp/crate', 30);
  assert.deepEqual(run.slice(0, 5), ['cargo', '--timeout', '30', '--cwd', '/tmp/crate']);
  assert.equal(run.includes('--no-run'), false);
});
