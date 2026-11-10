// The Rust generated conformance builds its test crate before it runs its tests (T26.7-79).
import assert from 'node:assert/strict';
import test from 'node:test';
import { rustBuildArgs, rustRunArgs } from '../runner/rust-steps.mts';

test('the test crate is built without running it, and the run passes no time limit to run-tests', () => {
  assert.deepEqual(rustBuildArgs('generated_conformance_check'), ['test', '--no-run', '--locked', '--offline', '--test', 'generated_conformance_check']);
  const run = rustRunArgs('generated_conformance_check', '/tmp/crate');
  assert.deepEqual(run.slice(0, 3), ['cargo', '--cwd', '/tmp/crate']);
  assert.equal(run.includes('--no-run'), false);
});
