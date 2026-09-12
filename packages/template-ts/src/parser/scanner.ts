// Tag start detection (LEX-5, LEX-6, LEX-9, LEX-17, LEX-18) and delimiter validation (LEX-21).

// The characters that open and close a tag (LEX-20). The default pair is `{` and `}`.
export interface Delimiters {
  open: string;
  close: string;
}

export const DEFAULT_DELIMITERS: Delimiters = { open: '{', close: '}' };

export const SIGILS = ['?#', ':?', '=', '@', '?', ':', '/', '+', '#', '*', '%'] as const;
export type Sigil = (typeof SIGILS)[number];

export interface Wrapper {
  opener: string;
  closer: string;
}

export const WRAPPERS: readonly Wrapper[] = [
  { opener: '"', closer: '"' },
  { opener: "'", closer: "'" },
  { opener: '/*', closer: '*/' },
  { opener: '<!--', closer: '-->' },
];

const ASSIGN_FORM = /^[A-Za-z_][A-Za-z0-9_]*[ \t]*(\+\+|--|[-+*/%]=|=(?![=>]))/;
const LOOP_FORM = /^[ \t]*[A-Za-z_][A-Za-z0-9_]*[ \t]*=/;

export function isHorizontalSpace(code: number): boolean {
  return code === 0x20 || code === 0x09;
}

export function skipHorizontalSpace(text: string, index: number): number {
  while (index < text.length && isHorizontalSpace(text.charCodeAt(index))) index++;
  return index;
}

// Returns the sigil that follows the open delimiter at `open`, or null (sigil form, LEX-5).
export function sigilAfter(text: string, open: number): Sigil | null {
  const index = skipHorizontalSpace(text, open + 1);
  for (const sigil of SIGILS) {
    if (text.startsWith(sigil, index)) return sigil;
  }
  return null;
}

// Whether the open delimiter at `open` starts a tag (LEX-5 or LEX-6).
// The sigil `/` starts a tag only before the close delimiter, and `@` only before `name =`.
export function startsTag(text: string, open: number, delimiters: Delimiters): boolean {
  const sigil = sigilAfter(text, open);
  if (sigil === null) return ASSIGN_FORM.test(text.slice(open + 1, open + 80));
  const after = skipHorizontalSpace(text, open + 1) + sigil.length;
  if (sigil === '/') return text[skipHorizontalSpace(text, after)] === delimiters.close;
  if (sigil === '@') return LOOP_FORM.test(text.slice(after, after + 80));
  return true;
}

// Returns the wrapper whose opener starts at `index` and is followed by a wrapped tag start (LEX-18), or null.
export function wrappedTagAt(text: string, index: number, delimiters: Delimiters): Wrapper | null {
  const { open } = delimiters;
  for (const wrapper of WRAPPERS) {
    if (!text.startsWith(wrapper.opener, index)) continue;
    const after = skipHorizontalSpace(text, index + wrapper.opener.length);
    if (text[after] === open && text[after + 1] === open && startsTag(text, after + 1, delimiters)) return wrapper;
    return null;
  }
  return null;
}

// consuming applications also use a single-brace tag inside a C-style or HTML
// comment wrapper (`/*{= value}*/`). When enabled by the host, remove only those wrappers and
// leave the contained tags for the normal parser. The default parser remains specification-only.
export function normalizeLegacyWrappers(text: string, delimiters: Delimiters): string {
  const wrappers = [
    { opener: '/*', closer: '*/' },
    { opener: '<!--', closer: '-->' },
  ];
  const active: string[] = [];
  let output = '';
  let index = 0;
  while (index < text.length) {
    const closer = active[active.length - 1];
    if (closer !== undefined && text.startsWith(closer, index)) {
      active.pop();
      index += closer.length;
      continue;
    }
    let opened = false;
    for (const wrapper of wrappers) {
      if (!text.startsWith(wrapper.opener, index)) continue;
      const after = skipHorizontalSpace(text, index + wrapper.opener.length);
      if (text[after] === delimiters.open && startsTag(text, after, delimiters)) {
        active.push(wrapper.closer);
        index += wrapper.opener.length;
        opened = true;
        break;
      }
    }
    if (opened) continue;
    output += text[index] as string;
    index++;
  }
  return output;
}

// LEX-21: one ASCII character that is not a letter, a digit, `_`, `\`, a space or a control character.
export function isDelimiterChar(char: string): boolean {
  if (char.length !== 1) return false;
  const code = char.charCodeAt(0);
  if (code <= 0x20 || code >= 0x7f) return false;
  if ((code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) return false;
  return code !== 0x5f && code !== 0x5c;
}

export function parseDelimiters(value: string): Delimiters | null {
  if (value.length !== 2) return null;
  const open = value[0] as string;
  const close = value[1] as string;
  if (!isDelimiterChar(open) || !isDelimiterChar(close)) return null;
  return { open, close };
}
