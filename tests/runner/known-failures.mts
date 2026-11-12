// The verdict of a generated runner on its known failures (docs/spec/compiler.md#transition): a case of the list is
// expected to fail, so a run fails when a case outside the list fails and when a case of the list passes.

/** The verdict of a run on the list of known failures. */
export interface KnownFailureVerdict {
  /** The cases that failed and are not in the list, in the order of `failed`. */
  unexpected: string[];
  /** The cases of the list that ran and passed, in the order of `ran`: each is to be removed from the list. */
  passed: string[];
  /** The number of cases of the list that ran and failed. */
  observed: number;
}

/**
 * Judges a run: `ran` are the ids of the cases that ran, `failed` those of them that failed, and `known` the ids of the
 * known failures. A case of the list that did not run is not judged.
 */
export function knownFailureVerdict(ran: readonly string[], failed: readonly string[], known: ReadonlySet<string>): KnownFailureVerdict {
  const failedSet = new Set(failed);
  return {
    unexpected: failed.filter(id => !known.has(id)),
    passed: ran.filter(id => known.has(id) && !failedSet.has(id)),
    observed: ran.filter(id => known.has(id) && failedSet.has(id)).length,
  };
}
