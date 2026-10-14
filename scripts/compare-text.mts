// The comparator of the sorts of the scripts and their tests: the order of UTF-16 code units, which
// Array.prototype.sort uses without a comparator, named so that each sort states its order (T24.6).

/**
 * Compares two strings by their UTF-16 code units.
 */
export function compareText(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}
