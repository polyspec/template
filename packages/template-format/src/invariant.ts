// Safety invariant: two templates are equivalent when their ASTs are equal after every `span` field is removed (AST-2, AST-7),
// and, for indented lines, after the spaces and tabs at the start of every line of text are removed.

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

/**
 * Returns a copy of an AST value whose `Text` nodes have no spaces or tabs at the start of a line. A `Text` node that
 * becomes empty is removed: indentation after a line that the renderer removes is a `Text` node of its own.
 */
export function withoutLineIndentation(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withoutLineIndentation).filter(item => !(item !== null && typeof item === 'object' && (item as Record<string, unknown>).type === 'Text' && (item as Record<string, unknown>).value === ''));
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(record)) {
      result[key] = record.type === 'Text' && key === 'value' && typeof field === 'string' ? field.replace(/(^|\n)[ \t]+/g, '$1') : withoutLineIndentation(field);
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
