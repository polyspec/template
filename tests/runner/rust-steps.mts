// The cargo steps of the Rust generated conformance: the test crate of the generated programs is built first, without a limit,
// because its compile takes longer than the timeout of one test, and run-tests counts the time before the first test against
// that timeout (kit K371-1); then its tests run, each with the timeout of a case.

/** The cargo arguments that build the test crate `test` without running it. */
export const rustBuildArgs = (test: string): string[] => ['test', '--no-run', '--locked', '--offline', '--test', test];

/** The run-tests arguments that run the tests of the built crate in `cwd`, each within `timeoutSeconds`. */
export const rustRunArgs = (test: string, cwd: string, timeoutSeconds: number): string[] =>
  ['cargo', '--timeout', String(timeoutSeconds), '--cwd', cwd, '--', '--locked', '--offline', '--test', test];
