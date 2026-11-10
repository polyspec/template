// The cargo steps of the Rust generated conformance: the test crate of the generated programs is built first, so a compile
// failure is reported as the build of the crate; then its tests run through run-tests.

/** The cargo arguments that build the test crate `test` without running it. */
export const rustBuildArgs = (test: string): string[] => ['test', '--no-run', '--locked', '--offline', '--test', test];

/** The run-tests arguments that run the tests of the built crate in `cwd`. */
export const rustRunArgs = (test: string, cwd: string): string[] =>
  ['cargo', '--cwd', cwd, '--', '--locked', '--offline', '--test', test, '--', '--test-threads=1'];
