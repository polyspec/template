"""Tag start detection (LEX-5, LEX-6, LEX-9, LEX-17, LEX-18) and delimiter
validation (LEX-21)."""

from __future__ import annotations

import re
from typing import Optional

# The characters that open and close a tag (LEX-20); the default pair is `{` and `}`.
DEFAULT_DELIMITERS = ('{', '}')

SIGILS = ('?#', ':?', '=', '@', '?', ':', '/', '+', '#', '*', '%')

WRAPPERS = (
    ('"', '"'),
    ("'", "'"),
    ('/*', '*/'),
    ('<!--', '-->'),
)

_LOOP_FORM = re.compile(r'[ \t]*[A-Za-z_][A-Za-z0-9_]*[ \t]*=')


def is_horizontal_space(code: int) -> bool:
    return code == 0x20 or code == 0x09


def skip_horizontal_space(text: str, index: int) -> int:
    while index < len(text) and is_horizontal_space(ord(text[index])):
        index += 1
    return index


def sigil_after(text: str, open_index: int) -> 'str | None':
    """The sigil that follows the open delimiter at `open_index`, or None (sigil form, LEX-5)."""
    index = skip_horizontal_space(text, open_index + 1)
    for sigil in SIGILS:
        if text.startswith(sigil, index):
            return sigil
    return None


def starts_tag(text: str, open_index: int, delimiters: tuple[str, str]) -> bool:
    """Whether the open delimiter at `open_index` starts a tag (LEX-5 or LEX-6).

    The sigil `/` starts a tag only before the close delimiter, and `@` only
    before `name =`.
    """
    sigil = sigil_after(text, open_index)
    if sigil is None:
        return False
    after = skip_horizontal_space(text, open_index + 1) + len(sigil)
    if sigil == '/':
        return text[skip_horizontal_space(text, after):skip_horizontal_space(text, after) + 1] == delimiters[1]
    if sigil == '@':
        return _LOOP_FORM.match(text, after, after + 80) is not None
    return True


def wrapped_tag_at(text: str, index: int, delimiters: tuple[str, str]) -> 'tuple[str, str] | None':
    """The wrapper whose opener starts at `index` and is followed by a wrapped tag
    start (LEX-18), or None."""
    open_char = delimiters[0]
    for wrapper in WRAPPERS:
        if not text.startswith(wrapper[0], index):
            continue
        after = skip_horizontal_space(text, index + len(wrapper[0]))
        if (text[after:after + 1] == open_char and text[after + 1:after + 2] == open_char
                and starts_tag(text, after + 1, delimiters)):
            return wrapper
        return None
    return None


def is_delimiter_char(char: str) -> bool:
    """LEX-21: one ASCII character that is not a letter, a digit, `_`, `\\`, a
    space or a control character."""
    if len(char) != 1:
        return False
    code = ord(char)
    if code <= 0x20 or code >= 0x7f:
        return False
    if 0x30 <= code <= 0x39 or 0x41 <= code <= 0x5a or 0x61 <= code <= 0x7a:
        return False
    return code != 0x5f and code != 0x5c


def parse_delimiters(value: str) -> 'tuple[str, str] | None':
    if len(value) != 2:
        return None
    if not is_delimiter_char(value[0]) or not is_delimiter_char(value[1]):
        return None
    return (value[0], value[1])
