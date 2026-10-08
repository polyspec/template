"""HTML escaping as defined in RT-32 and FUN-10, and UTF-8 helpers."""

from __future__ import annotations

_REPLACEMENTS = {0x26: '&amp;', 0x3c: '&lt;', 0x3e: '&gt;', 0x22: '&quot;', 0x27: '&#39;'}


def escape_html(text: str) -> str:
    result = []
    last = 0
    for index, char in enumerate(text):
        replacement = _REPLACEMENTS.get(ord(char))
        if replacement is None:
            continue
        result.append(text[last:index])
        result.append(replacement)
        last = index + 1
    return text if last == 0 else ''.join(result) + text[last:]


def utf8_length(text: str) -> int:
    """The number of UTF-8 bytes of a string."""
    try:
        return len(text.encode('utf-8'))
    except UnicodeEncodeError:
        # An unpaired surrogate has no UTF-8 form; the value rules reject it before here.
        return sum(4 if 0xd800 <= ord(char) <= 0xdfff else len(char.encode('utf-8'))
                   for char in text)


def first_invalid_utf8(data: bytes) -> int:
    """The index of the first invalid byte of a UTF-8 sequence, or -1 when the bytes are valid."""
    index, length = 0, len(data)
    while index < length:
        lead = data[index]
        if lead < 0x80:
            index += 1
            continue
        if 0xc2 <= lead <= 0xdf:
            need, minimum, mask = 1, 0x80, 0x1f
        elif 0xe0 <= lead <= 0xef:
            need, minimum, mask = 2, 0x800, 0x0f
        elif 0xf0 <= lead <= 0xf4:
            need, minimum, mask = 3, 0x10000, 0x07
        else:
            return index
        code = lead & mask
        for step in range(1, need + 1):
            if index + step >= length:
                return index
            byte = data[index + step]
            if byte & 0xc0 != 0x80:
                return index
            code = code << 6 | (byte & 0x3f)
        if code < minimum or code > 0x10ffff or 0xd800 <= code <= 0xdfff:
            return index
        index += need + 1
    return -1
