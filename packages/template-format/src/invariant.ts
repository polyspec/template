// Safety invariant: two templates are equivalent when their ASTs are equal after every `span` field is removed (AST-2, AST-7).

/** Returns a copy of an AST value without `span` fields. */
export function withoutSpans(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutSpans);
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(value)) {
      if (key !== 'span') result[key] = withoutSpans(field);
    }
    return result;
  }
  return value;
}

/** Compares two AST values structurally, ignoring object key order and every `span` field. */
export function sameTree(left: unknown, right: unknown): boolean {
  return equal(withoutSpans(left), withoutSpans(right));
}

function equal(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => equal(item, right[index]));
  }
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftKeys = Object.keys(left);
  const rightRecord = right as Record<string, unknown>;
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every(key => key in rightRecord && equal((left as Record<string, unknown>)[key], rightRecord[key]));
}
