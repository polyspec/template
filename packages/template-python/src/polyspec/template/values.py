"""Value types, safe strings, truthiness, equality and ordering as defined in
docs/spec/data-model.md and docs/spec/expressions.md."""

from __future__ import annotations

import math
import re
from typing import Any

# A value that a template operates on (VAL-1): None, bool, float, str, SafeString,
# list (ListValue) or dict (MapValue, ordered entries with string keys) or NativeObject.
Value = Any


class SafeString:
    """A string that the echo tag writes without HTML escaping (VAL-6).

    The functions `raw` and `escape` produce one.
    """

    __slots__ = ('text',)

    def __init__(self, text: str):
        self.text = text


class NativeObject:
    """A native assigned object whose public members and methods are visible to templates."""

    __slots__ = ('target',)

    def __init__(self, target: object):
        self.target = target


def type_of(value: Value) -> str:
    if value is None:
        return 'null'
    if isinstance(value, bool):
        return 'bool'
    if isinstance(value, float) or isinstance(value, int):
        return 'number'
    if isinstance(value, str) or isinstance(value, SafeString):
        return 'string'
    if isinstance(value, list):
        return 'list'
    if isinstance(value, NativeObject):
        return 'object'
    return 'map'


def is_number(value: Value) -> bool:
    return isinstance(value, (float, int)) and not isinstance(value, bool)


def is_string(value: Value) -> bool:
    return isinstance(value, str) or isinstance(value, SafeString)


def text_of(value: 'str | SafeString') -> str:
    return value if isinstance(value, str) else value.text


def code_point_length(text: str) -> int:
    return len(text)


def code_points(text: str) -> list[str]:
    return list(text)


def compare_code_points(a: str, b: str) -> int:
    """Compares two strings by code point sequence; returns a negative, zero or positive number."""
    if a == b:
        return 0
    return -1 if a < b else 1


def combine_surrogate_pairs(text: str) -> str:
    """Merges an adjacent high and low surrogate of a string into one character.

    The reference binding keeps UTF-16 text, where an escaped pair and the
    character it spells are the same string; a Python string holds the character.
    """
    if not any('\ud800' <= char <= '\udfff' for char in text):
        return text
    out = []
    index = 0
    while index < len(text):
        code = ord(text[index])
        if (0xd800 <= code <= 0xdbff and index + 1 < len(text)
                and 0xdc00 <= ord(text[index + 1]) <= 0xdfff):
            out.append(chr(0x10000 + ((code - 0xd800) << 10) + ord(text[index + 1]) - 0xdc00))
            index += 2
            continue
        out.append(text[index])
        index += 1
    return ''.join(out)


def is_truthy(value: Value) -> bool:
    """EXP-33: falsy values."""
    if value is None or value is False:
        return False
    if value is True:
        return True
    if isinstance(value, (float, int)):
        return value != 0
    if isinstance(value, str):
        return len(value) > 0
    if isinstance(value, SafeString):
        return len(value.text) > 0
    if isinstance(value, list):
        return len(value) > 0
    if isinstance(value, NativeObject):
        return True
    return len(value) > 0


_NUMBER_GRAMMAR = re.compile(r'[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?\Z')
_ASCII_SPACE = ' \t\r\n'


def parse_numeric_string(text: str) -> 'float | None':
    """The numeric value of a string under the conversion grammar of EXP-23, or None."""
    trimmed = text.strip(_ASCII_SPACE)
    if not _NUMBER_GRAMMAR.match(trimmed):
        return None
    parsed = float(trimmed)
    return parsed if math.isfinite(parsed) else None


def loose_equals(a: Value, b: Value) -> bool:
    """EXP-34 and EXP-35."""
    ta, tb = type_of(a), type_of(b)
    if ta == tb:
        return _same_type_equals(a, b, ta)
    if ta == 'number' and tb == 'string':
        number = parse_numeric_string(text_of(b))
        return number is not None and number == a
    if ta == 'string' and tb == 'number':
        number = parse_numeric_string(text_of(a))
        return number is not None and number == b
    return False


def strict_equals(a: Value, b: Value) -> bool:
    """EXP-37."""
    ta = type_of(a)
    return ta == type_of(b) and _same_type_equals(a, b, ta)


def _same_type_equals(a: Value, b: Value, kind: str) -> bool:
    if kind == 'null':
        return True
    if kind in ('bool', 'number'):
        return a == b
    if kind == 'string':
        return text_of(a) == text_of(b)
    if kind == 'list':
        return len(a) == len(b) and all(loose_equals(item, other) for item, other in zip(a, b))
    if kind == 'map':
        if len(a) != len(b):
            return False
        for key, value in a.items():
            if key not in b or not loose_equals(value, b[key]):
                return False
        return True
    # EXP-39: two native objects are equal when they hold the same instance.
    return a.target is b.target


def compare_values(a: Value, b: Value) -> 'float | None':
    """EXP-38: a negative, zero or positive number, or None when the pair has no order."""
    if is_number(a) and is_number(b):
        return -1 if a < b else (1 if a > b else 0)
    if is_string(a) and is_string(b):
        return compare_code_points(text_of(a), text_of(b))
    return None

