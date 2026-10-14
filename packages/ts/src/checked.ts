// Checked reads for values that the type checker cannot prove present: an element at an index the
// caller has already bounded, and a value that an earlier check has already guaranteed. A miss is
// an internal failure, so both raise a RangeError, which `internalBoundary` reports as E_INTERNAL
// (ERR-12).

// Returns the element at `index`, which the caller has checked to lie inside `items`.
export function elementAt<T>(items: ArrayLike<T>, index: number): T {
  const item = items[index];
  if (item === undefined) throw new RangeError(`index ${index} is outside a sequence of length ${items.length}`);
  return item;
}

// Returns a value that an earlier check guarantees, such as a required function argument after
// the arity check or a regular expression group that is not optional.
export function defined<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new RangeError(`${what} is missing`);
  return value;
}
