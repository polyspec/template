// A check that a call is refused: only the expected failure counts as the refusal, and any other error is the check's own and
// propagates, so a call that fails for another reason never passes as rejected.

/** True when `run` throws an Error whose message matches `expected`; false when it returns; any other throw propagates. */
export function rejects(run: () => unknown, expected: RegExp): boolean {
  try {
    run();
  } catch (error) {
    if (error instanceof Error && expected.test(error.message)) return true;
    throw error;
  }
  return false;
}
