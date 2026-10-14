// Tag structure: the block constructs of the accepted tags (GRM-18), the construct at a position and the next tag of a construct (EDT-10, EDT-11).

/** One tag of a construct. `start` and `end` are string indexes into the text. */
export interface ConstructTag {
  kind: 'if' | 'elseif' | 'else' | 'for' | 'ifblock' | 'close';
  start: number;
  end: number;
}

/** A block construct: the opening tag, its branch tags and the close tag, in source order. */
export interface Construct {
  kind: 'if' | 'for' | 'ifblock';
  /** String index of the opening tag. */
  start: number;
  /** String index after the close tag. */
  end: number;
  tags: ConstructTag[];
}

/** A tag range with the grammar kind of the parser. */
export interface KindedRange {
  kind: string;
  start: number;
  end: number;
}

/**
 * Returns the closed constructs of the tags, in the order of their opening tags. Loop, if and if-block tags open a
 * construct, else-if and else tags belong to the innermost open construct, and the close tag ends it. A construct
 * that is not closed is left out.
 */
export function constructsOf(tags: readonly KindedRange[]): Construct[] {
  const opened: Construct[] = [];
  const open: Construct[] = [];
  const closed = new Set<Construct>();
  for (const tag of tags) {
    const range = { start: tag.start, end: tag.end };
    switch (tag.kind) {
      case 'if':
      case 'for':
      case 'ifblock': {
        const construct: Construct = { kind: tag.kind, start: range.start, end: range.end, tags: [{ kind: tag.kind, ...range }] };
        opened.push(construct);
        open.push(construct);
        break;
      }
      case 'elseif':
      case 'else':
        open[open.length - 1]?.tags.push({ kind: tag.kind, ...range });
        break;
      case 'close': {
        const construct = open.pop();
        if (construct === undefined) break;
        construct.tags.push({ kind: 'close', ...range });
        construct.end = range.end;
        closed.add(construct);
        break;
      }
      default:
        break;
    }
  }
  return opened.filter(construct => closed.has(construct));
}

/** Returns the construct that has a tag containing the string index, including the index after the tag. */
export function constructAt(constructs: readonly Construct[], index: number): { construct: Construct; tag: number } | null {
  for (const construct of constructs) {
    const tag = construct.tags.findIndex(item => item.start <= index && index <= item.end);
    if (tag >= 0) return { construct, tag };
  }
  return null;
}

/**
 * Returns the start of the next tag of the construct under the index, the opening tag after the last one. Outside
 * every tag it returns the next tag of the innermost construct around the index, or null.
 */
export function matchingTagOf(constructs: readonly Construct[], index: number): number | null {
  const found = constructAt(constructs, index);
  if (found !== null) {
    const next = found.construct.tags[(found.tag + 1) % found.construct.tags.length];
    return next === undefined ? null : next.start;
  }
  let inner: Construct | null = null;
  for (const construct of constructs) {
    if (construct.start < index && index < construct.end && (inner === null || construct.start >= inner.start)) inner = construct;
  }
  if (inner === null) return null;
  return (inner.tags.find(tag => tag.start > index) ?? inner.tags[0])?.start ?? null;
}
