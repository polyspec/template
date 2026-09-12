// HTML escaping as defined in RT-32 and FUN-10, and UTF-8 helpers.

export function escapeHtml(text: string): string {
  let result = '';
  let last = 0;
  for (let i = 0; i < text.length; i++) {
    let replacement: string;
    switch (text.charCodeAt(i)) {
      case 0x26: replacement = '&amp;'; break;
      case 0x3c: replacement = '&lt;'; break;
      case 0x3e: replacement = '&gt;'; break;
      case 0x22: replacement = '&quot;'; break;
      case 0x27: replacement = '&#39;'; break;
      default: continue;
    }
    result += text.slice(last, i) + replacement;
    last = i + 1;
  }
  return last === 0 ? text : result + text.slice(last);
}

// Number of UTF-8 bytes of a string.
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

// Returns the index of the first invalid byte of a UTF-8 sequence, or -1 when the bytes are valid.
export function firstInvalidUtf8(bytes: Uint8Array): number {
  let i = 0;
  const n = bytes.length;
  while (i < n) {
    const b0 = bytes[i] as number;
    if (b0 < 0x80) {
      i++;
      continue;
    }
    let need: number;
    let min: number;
    if (b0 >= 0xc2 && b0 <= 0xdf) { need = 1; min = 0x80; }
    else if (b0 >= 0xe0 && b0 <= 0xef) { need = 2; min = 0x800; }
    else if (b0 >= 0xf0 && b0 <= 0xf4) { need = 3; min = 0x10000; }
    else return i;
    let code = b0 & (need === 1 ? 0x1f : need === 2 ? 0x0f : 0x07);
    for (let k = 1; k <= need; k++) {
      const b = bytes[i + k];
      if (b === undefined || (b & 0xc0) !== 0x80) return i;
      code = (code << 6) | (b & 0x3f);
    }
    if (code < min || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return i;
    i += need + 1;
  }
  return -1;
}

export const utf8Decoder = new TextDecoder('utf-8');
export const utf8Encoder = new TextEncoder();
