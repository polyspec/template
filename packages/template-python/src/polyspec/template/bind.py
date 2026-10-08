"""Host binding of Python values (VAL-13), the number rule (VAL-2, VAL-3) and the
depth limit (VAL-20)."""

from __future__ import annotations

import math
from typing import Any, Optional

from .number import MAX_SAFE
from .values import NativeObject, SafeString, Value

# The nesting depth limit of lists and maps (VAL-20).
MAX_DEPTH = 64

BIND_ERROR_CODES = ('E_DATA_NUMBER_RANGE', 'E_DATA_NUMBER_NOT_FINITE', 'E_DATA_UNSUPPORTED_TYPE',
                    'E_DATA_INVALID_UTF8', 'E_DATA_DEPTH', 'E_DATA_INVALID_JSON')


class BindError(Exception):
    """The error that host binding raises for a value that has no template value (VAL-11)."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.name = 'BindError'
        self.code = code


def check_number(value: 'int | float') -> float:
    """VAL-2, VAL-3: a number is accepted when it is finite and its magnitude is
    at most 2^53 - 1."""
    number = float(value)
    if not math.isfinite(number):
        raise BindError('E_DATA_NUMBER_NOT_FINITE', 'number is not finite')
    if abs(number) > MAX_SAFE:
        raise BindError('E_DATA_NUMBER_RANGE', f'number {number_to_text(number)} is outside the safe range')
    return number


def number_to_text(value: float) -> str:
    from .number import number_to_string
    return number_to_string(value)


def check_text(text: str) -> str:
    """VAL-13, VAL-17: a string or a map key must hold no unpaired surrogate, so
    that it has a UTF-8 form."""
    index = 0
    while index < len(text):
        code = ord(text[index])
        if 0xd800 <= code <= 0xdbff:
            following = ord(text[index + 1]) if index + 1 < len(text) else 0
            if 0xdc00 <= following <= 0xdfff:
                index += 2
                continue
            raise BindError('E_DATA_INVALID_UTF8', 'string contains an unpaired surrogate')
        if 0xdc00 <= code <= 0xdfff:
            raise BindError('E_DATA_INVALID_UTF8', 'string contains an unpaired surrogate')
        index += 1
    return text


def check_level(level: int) -> None:
    """VAL-20: fails when a list or map would be entered at a level greater than
    the limit; `level` counts the enclosing lists and maps, including the one
    being entered."""
    if level > MAX_DEPTH:
        raise BindError('E_DATA_DEPTH', f'lists and maps nest deeper than {MAX_DEPTH} levels')


def bind_value(value: Any) -> Value:
    """Converts a Python value into a template value (VAL-13)."""
    return _bind_at(value, 0)


def _bind_at(value: Any, level: int) -> Value:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        # A Python int covers the whole integer range; the binding rule accepts
        # only the safe range of the double and keeps every number a float.
        if value > MAX_SAFE or value < -MAX_SAFE:
            raise BindError('E_DATA_NUMBER_RANGE', f'integer {value} is outside the safe range')
        return float(value)
    if isinstance(value, float):
        return check_number(value)
    if isinstance(value, str):
        return check_text(value)
    if isinstance(value, SafeString):
        return check_text(value.text)
    if isinstance(value, NativeObject):
        return value
    if isinstance(value, BoundMap):
        raise BindError('E_DATA_UNSUPPORTED_TYPE',
                        'a bound map is accepted only as assign and as definition data')
    if isinstance(value, (list, tuple)):
        check_level(level + 1)
        return [_bind_at(item, level + 1) for item in value]
    if isinstance(value, dict):
        check_level(level + 1)
        bound: dict[str, Value] = {}
        for key, item in value.items():
            if not isinstance(key, str):
                raise BindError('E_DATA_UNSUPPORTED_TYPE', 'map key is not a string')
            bound[check_text(key)] = _bind_at(item, level + 1)
        return bound
    raise BindError('E_DATA_UNSUPPORTED_TYPE', f'a {type(value).__name__} value has no binding')


def bind_map(value: Any) -> dict[str, Value]:
    """Binds assign data (RT-4): None is the empty map, a bound map gives its
    entries without binding them again (VAL-22), and every other value must bind
    to a map."""
    if value is None:
        return {}
    if isinstance(value, BoundMap):
        return value.entries
    bound = bind_value(value)
    if not isinstance(bound, dict):
        raise BindError('E_DATA_UNSUPPORTED_TYPE', 'assign is not a map')
    return bound


def bind_data(value: Any) -> Value:
    """Binds the data of a template definition (RT-24)."""
    if isinstance(value, BoundMap):
        return value.entries
    return bind_value(value)


def depth_within(value: Value, limit: int) -> bool:
    """VAL-20: whether the depth of a template value is at most `limit`."""
    if isinstance(value, list):
        return limit > 0 and all(depth_within(item, limit - 1) for item in value)
    if isinstance(value, dict):
        if limit == 0:
            return False
        return all(depth_within(item, limit - 1) for item in value.values())
    return True


def host_argument(value: Value) -> Any:
    """VAL-18, VAL-21: converts a template value passed to host code into a new
    host value, so a change that host code makes to an argument changes no
    template value."""
    if isinstance(value, SafeString):
        return value.text
    if isinstance(value, NativeObject):
        return value.target
    if isinstance(value, list):
        return [host_argument(item) for item in value]
    if isinstance(value, dict):
        return {key: host_argument(item) for key, item in value.items()}
    return value


class BoundMap:
    """A map that passed host binding (VAL-22); `bind` and `merge` create it."""

    __slots__ = ('entries',)

    def __init__(self, entries: dict[str, Value]):
        self.entries = entries
