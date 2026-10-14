// The comparator of the sorts of the scripts and their tests: the order of UTF-16 code units, which
// Array.prototype.sort uses without a comparator, named so that each sort states its order (T24.6).

/**
 * Compares two strings by their UTF-16 code units.
 * @param {string} left
 * @param {string} right
 * @returns {number}
 */
export function compareText(left, right) {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}
