// Position conversion between UTF-8 byte offsets of the parser (LEX-16) and string indexes.

/** Returns the string index of a UTF-8 byte offset into the text. An offset inside a character maps to that character. */
export function indexOfByte(text: string, offset: number): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index++) {
    if (bytes >= offset) return index;
    const code = text.codePointAt(index) as number;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    if (code >= 0x10000) index++;
  }
  return text.length;
}

