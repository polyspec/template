// Tag anatomy: splits one accepted tag into the delimiter prefix, the body between the delimiters and the delimiter suffix (LEX-5, LEX-17, LEX-20).

/** The open and close delimiter characters in effect for a tag. */
export interface Delimiters {
  open: string;
  close: string;
}

/** One tag split at its delimiters. `bodyStart` and `bodyEnd` are string indexes into the source. */
export interface TagParts {
  prefix: string;
  body: string;
  suffix: string;
  bodyStart: number;
  bodyEnd: number;
}

const WRAPPERS: readonly (readonly [string, string])[] = [
  ['"', '"'],
  ["'", "'"],
  ['/*', '*/'],
  ['<!--', '-->'],
];

function isHorizontalSpace(char: string | undefined): boolean {
  return char === ' ' || char === '\t';
}

/** Parses the two characters of a delimiter option or directive value. */
export function delimitersOf(value: string): Delimiters {
  return { open: value[0] as string, close: value[1] as string };
}

/**
 * Splits the tag that covers `[start, end)` of `text`. A wrapped tag keeps its wrapper, the
 * whitespace next to the wrapper and the doubled delimiters in the prefix and the suffix.
 * Returns null when the range does not have the form of a tag with the given delimiters.
 */
export function tagParts(text: string, start: number, end: number, delimiters: Delimiters): TagParts | null {
  const { open, close } = delimiters;
  for (const [opener, closer] of WRAPPERS) {
    if (!text.startsWith(opener, start)) continue;
    let index = start + opener.length;
    while (isHorizontalSpace(text[index])) index++;
    if (text[index] !== open || text[index + 1] !== open) continue;
    const bodyStart = index + 2;
    if (!text.slice(bodyStart, end).endsWith(closer)) continue;
    let tail = end - closer.length;
    while (tail > bodyStart && isHorizontalSpace(text[tail - 1])) tail--;
    if (text[tail - 1] !== close || text[tail - 2] !== close || tail - 2 < bodyStart) continue;
    const bodyEnd = tail - 2;
    return { prefix: text.slice(start, bodyStart), body: text.slice(bodyStart, bodyEnd), suffix: text.slice(bodyEnd, end), bodyStart, bodyEnd };
  }
  if (text[start] !== open || text[end - 1] !== close || end - start < 2) return null;
  return { prefix: open, body: text.slice(start + 1, end - 1), suffix: close, bodyStart: start + 1, bodyEnd: end - 1 };
}
