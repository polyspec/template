// The cases in which a legacy runtime differs from the specification, by the target of the generated conformance.
//
// The generated programs of Go, PHP and Python are compiled by the build compiler, whose parser follows the current
// rules, and run on the legacy runtime of their language, which keeps the rules of the day it moved to legacy/ and goes
// away with it (docs/spec/runtime.md#transition). The runners read the current cases, as the Rust core does, so each
// case that such a runtime renders where the specification gives an error is written here with the statement that
// the runtime does not implement. A runner requires exactly this difference: a case of the list that passes fails the
// run, and so does a case outside the list that differs (tests/runner/known-failures.mts).

/** The statement that the legacy runtimes do not implement, by the case that shows it. */
const RULES: Readonly<Record<string, string>> = {
  'expr/lookup-fraction-error': 'EXP-19',
  'expr/lookup-list-key-error': 'EXP-19',
  'expr/lookup-map-key-error': 'EXP-19',
  'functions/date-day-of-month-error': 'FUN-37',
  'functions/date-day-of-month-thirty-error': 'FUN-37',
  'functions/date-fraction-error': 'FUN-50',
  'functions/number-decimals-limit-error': 'FUN-20',
  'functions/round-fraction-error': 'FUN-50',
  'functions/slice-fraction-error': 'FUN-50',
  'functions/slice-magnitude-limit-error': 'FUN-50',
  'functions/truncate-fraction-error': 'FUN-50',
  'functions/truncate-negative-count-error': 'FUN-50',
};

/** The targets whose generated programs run on a legacy runtime. */
export type LegacyTarget = 'go' | 'php' | 'python';

const CASES: Readonly<Record<LegacyTarget, readonly string[]>> = {
  go: Object.keys(RULES),
  php: Object.keys(RULES),
  python: Object.keys(RULES),
};

/** The cases in which the legacy runtime of `target` differs, each with the statement that it does not implement. */
export function legacyRuntimeDifferences(target: LegacyTarget): ReadonlyMap<string, string> {
  return new Map(CASES[target].map(id => {
    const rule = RULES[id];
    if (rule === undefined) throw new Error(`${id} of ${target} names no statement in tests/runner/legacy-runtime-differences.mts`);
    return [id, rule];
  }));
}

/** The failure of a case of the list that passed: its entry is to be removed. */
export function differencePassed(target: LegacyTarget, id: string, rule: string): string {
  return `${id}: the legacy runtime of ${target} is recorded not to implement ${rule} and the case passes; remove it from tests/runner/legacy-runtime-differences.mts`;
}
