// The values that a script requires: a value that is missing fails with an error that names it, instead of a default
// that hides it (no silent fallback).

/** `value`, or an error that names `what` when it is undefined or null. */
export function required<T>(value: T | null | undefined, what: string): T {
  if (value === undefined || value === null) throw new Error(`${what} is missing`);
  return value;
}

/** The group `index` of a regular expression match, or an error that names `what` when the text did not match or the group took no part. */
export function captured(match: RegExpMatchArray | null, index: number, what: string): string {
  if (match === null) throw new Error(`${what} is missing: the text does not match`);
  const value = match[index];
  if (value === undefined) throw new Error(`${what} is missing: group ${index} of ${JSON.stringify(match[0])} took no part in the match`);
  return value;
}
