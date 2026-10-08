"""Built-in function table and the host function contract (docs/spec/functions.md)."""

from __future__ import annotations

import math
import re
from typing import Any, Callable

from .escape import escape_html
from .number import number_to_string
from .stringify import StringifyError, stringify
from .values import (
    NativeObject,
    SafeString,
    Value,
    is_string,
    is_truthy,
    parse_numeric_string,
    text_of,
    type_of,
    code_points,
    loose_equals,
)


class FunctionError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.name = "FunctionError"
        self.code = code


def type_error(message: str) -> FunctionError:
    return FunctionError("E_RUNTIME_TYPE", message)


def json_text(value: str) -> str:
    import json

    return json.dumps(value)


# The render environment: the fixed time zone offset and the time that `now`
# returns (FUN-39, FUN-42).
class Env:
    __slots__ = ("timezone", "now")

    def __init__(self, timezone: str, now: float):
        self.timezone = timezone
        self.now = now


class FunctionContext:
    __slots__ = ("env",)

    def __init__(self, env: Env):
        self.env = env


class BuiltIn:
    __slots__ = ("minimum", "maximum", "call")

    def __init__(self, minimum: int, maximum: float, call: Callable):
        self.minimum = minimum
        self.maximum = maximum
        self.call = call


# A function that a host registers under a name (FUN-43). It receives template
# values, except that a native object, also inside a list or map, is the original
# instance (VAL-18). Its return value is bound by the host binding rules and an
# error it raises becomes E_RUNTIME_HOST_FUNCTION.
HostFunction = Callable[[list, FunctionContext], Any]


# Argument helpers shared by the function groups.
def arg_string(value: Value, name: str) -> str:
    if not is_string(value):
        raise type_error(f"{name} requires a string, got {type_of(value)}")
    return text_of(value)


def arg_list(value: Value, name: str) -> list:
    if not isinstance(value, list):
        raise type_error(f"{name} requires a list, got {type_of(value)}")
    return value


def is_number(value: Value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def to_number(value: Value) -> float:
    """EXP-23 to_number."""
    if value is None:
        return 0.0
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if is_number(value):
        return float(value)
    if is_string(value):
        parsed = parse_numeric_string(text_of(value))
        if parsed is None:
            raise type_error(f"{json_text(text_of(value))} is not a number")
        return parsed
    raise type_error(f"a {type_of(value)} is not a number")


def arg_number(value: Value, _name: str) -> float:
    return to_number(value)


def arg_integer(value: Value, name: str) -> int:
    return math.trunc(arg_number(value, name))


def stringify_arg(value: Value) -> str:
    try:
        return stringify(value)
    except StringifyError as error:
        raise FunctionError("E_RUNTIME_STRINGIFY", str(error)) from None


def safe(text: str) -> SafeString:
    return SafeString(text)


# --- encoding functions (FUN-10, FUN-11, FUN-18, FUN-19, FUN-26 to FUN-30) ---

_JSON_ESCAPES = {
    '"': '\\"',
    "\\": "\\\\",
    "\n": "\\n",
    "\r": "\\r",
    "\t": "\\t",
    "\b": "\\b",
    "\f": "\\f",
    "<": "\\u003c",
    ">": "\\u003e",
    "&": "\\u0026",
    "\u2028": "\\u2028",
    "\u2029": "\\u2029",
}


def _json_string(text: str) -> str:
    result = ['"']
    for char in text:
        escape = _JSON_ESCAPES.get(char)
        if escape is not None:
            result.append(escape)
        elif ord(char) < 0x20:
            result.append("\\u%04x" % ord(char))
        else:
            result.append(char)
    return "".join(result) + '"'


def to_json(value: Value) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if is_number(value):
        return number_to_string(float(value))
    if isinstance(value, str):
        return _json_string(value)
    if isinstance(value, SafeString):
        return _json_string(value.text)
    # FUN-26: a native object is opaque (VAL-19) and has no JSON text.
    if isinstance(value, NativeObject):
        raise type_error("json does not accept a native object")
    if isinstance(value, list):
        return "[" + ",".join(to_json(item) for item in value) + "]"
    return (
        "{"
        + ",".join(
            f"{_json_string(key)}:{to_json(entry)}" for key, entry in value.items()
        )
        + "}"
    )


def percent_encode(text: str) -> str:
    import urllib.parse

    return urllib.parse.quote(text, safe="-_.~")


_NL2BR = re.compile(r"\r\n|\n")


def _encoding_functions() -> dict[str, BuiltIn]:
    return {
        "escape": BuiltIn(
            1, 1, lambda args, _ctx: safe(escape_html(stringify_arg(args[0])))
        ),
        "raw": BuiltIn(1, 1, lambda args, _ctx: safe(stringify_arg(args[0]))),
        "json": BuiltIn(1, 1, lambda args, _ctx: to_json(args[0])),
        "url": BuiltIn(1, 1, lambda args, _ctx: percent_encode(stringify_arg(args[0]))),
        "nl2br": BuiltIn(
            1, 1, lambda args, _ctx: _NL2BR.sub("<br>\n", arg_string(args[0], "nl2br"))
        ),
        "str": BuiltIn(1, 1, lambda args, _ctx: stringify_arg(args[0])),
        "type": BuiltIn(1, 1, lambda args, _ctx: type_of(args[0])),
    }


# --- string functions (FUN-12, FUN-13) ---


def _ascii_upper(text: str) -> str:
    return "".join(chr(ord(c) - 32) if "a" <= c <= "z" else c for c in text)


def _ascii_lower(text: str) -> str:
    return "".join(chr(ord(c) + 32) if "A" <= c <= "Z" else c for c in text)


def _trim_chars(text: str, chars: str) -> str:
    strip = set(code_points(chars))
    return text.strip("".join(strip)) if strip else text


def _string_functions() -> dict[str, BuiltIn]:
    def truncate(args, _ctx):
        text = arg_string(args[0], "truncate")
        limit = arg_integer(args[1], "truncate")
        tail = "..." if len(args) < 3 else arg_string(args[2], "truncate")
        points = code_points(text)
        return "".join(points[: max(0, limit)]) + tail if len(points) > limit else text

    def contains(args, _ctx):
        haystack, needle = args[0], args[1]
        if is_string(haystack):
            if not is_string(needle):
                raise type_error(
                    "contains requires a string needle for a string haystack"
                )
            return text_of(needle) in text_of(haystack)
        if isinstance(haystack, list):
            return any(loose_equals(item, needle) for item in haystack)
        raise type_error("contains requires a string or a list")

    def length(args, _ctx):
        value = args[0]
        if value is None:
            return 0.0
        if is_string(value):
            return float(len(text_of(value)))
        if isinstance(value, list):
            return float(len(value))
        if isinstance(value, dict):
            return float(len(value))
        raise type_error("length requires a string, list, map or null")

    return {
        "upper": BuiltIn(
            1, 1, lambda args, _ctx: _ascii_upper(arg_string(args[0], "upper"))
        ),
        "lower": BuiltIn(
            1, 1, lambda args, _ctx: _ascii_lower(arg_string(args[0], "lower"))
        ),
        "trim": BuiltIn(
            1,
            2,
            lambda args, _ctx: _trim_chars(
                arg_string(args[0], "trim"),
                " \t\r\n" if len(args) < 2 else arg_string(args[1], "trim"),
            ),
        ),
        "replace": BuiltIn(
            3,
            3,
            lambda args, _ctx: (
                lambda text, search, replacement: (
                    text if search == "" else text.replace(search, replacement)
                )
            )(
                arg_string(args[0], "replace"),
                arg_string(args[1], "replace"),
                arg_string(args[2], "replace"),
            ),
        ),
        "split": BuiltIn(
            2,
            2,
            lambda args, _ctx: _split(
                arg_string(args[0], "split"), arg_string(args[1], "split")
            ),
        ),
        "truncate": BuiltIn(2, 3, truncate),
        "contains": BuiltIn(2, 2, contains),
        "starts_with": BuiltIn(
            2,
            2,
            lambda args, _ctx: arg_string(args[0], "starts_with").startswith(
                arg_string(args[1], "starts_with")
            ),
        ),
        "ends_with": BuiltIn(
            2,
            2,
            lambda args, _ctx: arg_string(args[0], "ends_with").endswith(
                arg_string(args[1], "ends_with")
            ),
        ),
        "length": BuiltIn(1, 1, length),
    }


def _split(text: str, separator: str) -> list:
    if separator == "":
        raise type_error("split requires a non-empty separator")
    return text.split(separator)


# --- collection functions (FUN-14, FUN-15, FUN-31 to FUN-36) ---

RANGE_LIMIT = 1_000_000
_INDEX = re.compile(r"(0|[1-9][0-9]*)\Z")


def _lookup_path(value: Value, path: str) -> Value:
    current = value
    for segment in path.split("."):
        if isinstance(current, dict):
            current = current.get(segment, None)
        elif isinstance(current, list) and _INDEX.match(segment):
            position = int(segment)
            current = current[position] if position < len(current) else None
        else:
            return None
    return current


def _sort_list(items: list, key: "str | None") -> list:
    keyed = [(item, item if key is None else _lookup_path(item, key)) for item in items]
    all_numbers = all(is_number(entry[1]) for entry in keyed)
    all_strings = all(is_string(entry[1]) for entry in keyed)
    if not all_numbers and not all_strings:
        raise type_error("sort requires all numbers or all strings")

    # A stable sort by the key; entries with an equal key keep their input order.
    def sort_key(index: int):
        sort_key_value = keyed[index][1]
        return text_of(sort_key_value) if is_string(sort_key_value) else sort_key_value

    return [keyed[index][0] for index in sorted(range(len(keyed)), key=sort_key)]


def _collection_functions() -> dict[str, BuiltIn]:
    def keys(args, _ctx):
        value = args[0]
        if isinstance(value, dict):
            return list(value.keys())
        if isinstance(value, list):
            return [float(index) for index in range(len(value))]
        raise type_error("keys requires a map or a list")

    def values(args, _ctx):
        value = args[0]
        if isinstance(value, dict):
            return list(value.values())
        if isinstance(value, list):
            return value
        raise type_error("values requires a map or a list")

    def first(args, _ctx):
        value = args[0]
        if isinstance(value, list):
            return value[0] if value else None
        if is_string(value):
            points = code_points(text_of(value))
            return points[0] if points else None
        raise type_error("first requires a list or a string")

    def last(args, _ctx):
        value = args[0]
        if isinstance(value, list):
            return value[-1] if value else None
        if is_string(value):
            points = code_points(text_of(value))
            return points[-1] if points else None
        raise type_error("last requires a list or a string")

    def reverse(args, _ctx):
        value = args[0]
        if isinstance(value, list):
            return list(reversed(value))
        if is_string(value):
            return "".join(reversed(code_points(text_of(value))))
        raise type_error("reverse requires a list or a string")

    def slice(args, _ctx):
        value = args[0]
        if isinstance(value, list):
            items = value
        elif is_string(value):
            items = code_points(text_of(value))
        else:
            raise type_error("slice requires a list or a string")
        start = arg_integer(args[1], "slice")
        if start < 0:
            start = max(0, start + len(items))
        if start >= len(items):
            return [] if isinstance(value, list) else ""
        count = len(items) - start if len(args) < 3 else arg_integer(args[2], "slice")
        if count < 0:
            count = 0
        part = items[start : start + count]
        return part if isinstance(value, list) else "".join(part)

    def sort(args, _ctx):
        return _sort_list(
            arg_list(args[0], "sort"),
            None if len(args) < 2 else arg_string(args[1], "sort"),
        )

    def join(args, _ctx):
        separator = "," if len(args) < 2 else arg_string(args[1], "join")
        return separator.join(stringify_arg(item) for item in arg_list(args[0], "join"))

    def range_fn(args, _ctx):
        start = arg_number(args[0], "range")
        end = arg_number(args[1], "range")
        increment = 1.0 if len(args) < 3 else arg_number(args[2], "range")
        if increment == 0:
            raise type_error("range requires a non-zero step")
        count = math.floor((end - start) / increment) + 1
        if count > RANGE_LIMIT:
            raise FunctionError(
                "E_RUNTIME_LIMIT",
                f"range would produce more than {RANGE_LIMIT} elements",
            )
        return [start + index * increment for index in range(int(count))]

    return {
        "keys": BuiltIn(1, 1, keys),
        "values": BuiltIn(1, 1, values),
        "first": BuiltIn(1, 1, first),
        "last": BuiltIn(1, 1, last),
        "reverse": BuiltIn(1, 1, reverse),
        "slice": BuiltIn(2, 3, slice),
        "sort": BuiltIn(1, 2, sort),
        "join": BuiltIn(1, 2, join),
        "range": BuiltIn(2, 3, range_fn),
        "default": BuiltIn(
            2, 2, lambda args, _ctx: args[0] if is_truthy(args[0]) else args[1]
        ),
    }


# --- number functions (FUN-16, FUN-17, FUN-20 to FUN-25) ---


def _number_functions() -> dict[str, BuiltIn]:
    from .number import format_number, round_number

    def finite(value: float) -> float:
        if not math.isfinite(value):
            raise type_error("arithmetic result is not finite")
        return value

    def number_fn(args, _ctx):
        places = 0 if len(args) < 2 else arg_integer(args[1], "number")
        if places < 0:
            raise type_error("number requires a non-negative decimal count")
        return format_number(
            arg_number(args[0], "number"),
            places,
            "." if len(args) < 3 else arg_string(args[2], "number"),
            "," if len(args) < 4 else arg_string(args[3], "number"),
        )

    def round_fn(args, _ctx):
        places = 0 if len(args) < 2 else arg_integer(args[1], "round")
        if places < 0:
            raise type_error("round requires a non-negative decimal count")
        return round_number(arg_number(args[0], "round"), places)

    def require_number(value: Value, name: str) -> float:
        if not is_number(value):
            raise type_error(f"{name} accepts only numbers")
        return float(value)

    return {
        "number": BuiltIn(1, 4, number_fn),
        "round": BuiltIn(1, 2, round_fn),
        "floor": BuiltIn(
            1, 1, lambda args, _ctx: finite(math.floor(arg_number(args[0], "floor")))
        ),
        "ceil": BuiltIn(
            1, 1, lambda args, _ctx: finite(math.ceil(arg_number(args[0], "ceil")))
        ),
        "abs": BuiltIn(1, 1, lambda args, _ctx: abs(arg_number(args[0], "abs"))),
        "min": BuiltIn(
            1,
            math.inf,
            lambda args, _ctx: min(require_number(arg, "min") for arg in args),
        ),
        "max": BuiltIn(
            1,
            math.inf,
            lambda args, _ctx: max(require_number(arg, "max") for arg in args),
        ),
        "num": BuiltIn(1, 1, lambda args, _ctx: arg_number(args[0], "num")),
    }


# --- date functions (FUN-37 to FUN-42) ---

_DAY_SHORT = ("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
_DAY_LONG = (
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
)
_MONTH_SHORT = (
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
)
_MONTH_LONG = (
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
)

_OFFSET = re.compile(r"([+-])(\d{2}):(\d{2})\Z")
_DATE_TEXT = re.compile(
    r"(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?(Z|[+-]\d{2}:\d{2})?\Z"
)


def parse_offset(text: str) -> "'float | None'":
    """The offset in seconds of `Z` or `±HH:MM`, or None when the text is not an offset."""
    if text == "Z":
        return 0.0
    match = _OFFSET.fullmatch(text)
    if not match:
        return None
    sign = -1 if match.group(1) == "-" else 1
    hours, minutes = int(match.group(2)), int(match.group(3))
    if hours > 23 or minutes > 59:
        return None
    return float(sign * (hours * 3600 + minutes * 60))


def _days_from_civil(year: int, month: int, day: int) -> int:
    """Days since 1970-01-01 of a proleptic Gregorian date."""
    y = year - 1 if month <= 2 else year
    era = math.floor(y / 400)
    yoe = y - era * 400
    mp = (month + 9) % 12
    doy = math.floor((153 * mp + 2) / 5) + day - 1
    doe = yoe * 365 + math.floor(yoe / 4) - math.floor(yoe / 100) + doy
    return era * 146097 + doe - 719468


def _civil_from_days(days: int) -> tuple[int, int, int]:
    z = days + 719468
    era = math.floor(z / 146097)
    doe = z - era * 146097
    yoe = math.floor(
        (
            doe
            - math.floor(doe / 1460)
            + math.floor(doe / 36524)
            - math.floor(doe / 146096)
        )
        / 365
    )
    y = yoe + era * 400
    doy = doe - (365 * yoe + math.floor(yoe / 4) - math.floor(yoe / 100))
    mp = math.floor((5 * doy + 2) / 153)
    day = doy - math.floor((153 * mp + 2) / 5) + 1
    month = mp + 3 if mp < 10 else mp - 9
    return (y + 1 if month <= 2 else y, month, day)


def to_unix_seconds(value: Value, env_offset: float) -> float:
    """Unix seconds of a date value (FUN-37)."""
    if is_number(value):
        return float(math.trunc(float(value)))
    if is_string(value):
        text = text_of(value)
        match = _DATE_TEXT.fullmatch(text)
        if not match:
            raise type_error(f"{json_text(text)} is not a date")
        year, month, day = int(match.group(1)), int(match.group(2)), int(match.group(3))
        hour = int(match.group(4) or 0)
        minute = int(match.group(5) or 0)
        second = int(match.group(6) or 0)
        if (
            month < 1
            or month > 12
            or day < 1
            or day > 31
            or hour > 23
            or minute > 59
            or second > 59
        ):
            raise type_error(f"{json_text(text)} is not a date")
        offset = env_offset if match.group(7) is None else parse_offset(match.group(7))
        return float(
            _days_from_civil(year, month, day) * 86400
            + hour * 3600
            + minute * 60
            + second
            - offset
        )
    raise type_error("date requires a number or a string")


def _pad(value: "int | float", width: int) -> str:
    if isinstance(value, float):
        return number_to_string(value).rjust(width, "0")
    return str(value).rjust(width, "0")


def format_date(seconds: float, fmt: str, offset: float) -> str:
    local = seconds + offset
    days = math.floor(local / 86400)
    second_of_day = local - days * 86400
    year, month, day = _civil_from_days(days)
    hour = math.floor(second_of_day / 3600)
    minute = math.floor((second_of_day % 3600) / 60)
    second = second_of_day % 60
    weekday = (days % 7 + 11) % 7  # 1970-01-01 is a Thursday (4).
    sign = "-" if offset < 0 else "+"
    absolute = abs(offset)
    result = []
    index = 0
    while index < len(fmt):
        char = fmt[index]
        if char == "\\":
            result.append(fmt[index + 1] if index + 1 < len(fmt) else "")
            index += 2
            continue
        if char == "Y":
            result.append(_pad(year, 4))
        elif char == "y":
            result.append(_pad(year % 100, 2))
        elif char == "m":
            result.append(_pad(month, 2))
        elif char == "n":
            result.append(str(month))
        elif char == "d":
            result.append(_pad(day, 2))
        elif char == "j":
            result.append(str(day))
        elif char == "H":
            result.append(_pad(hour, 2))
        elif char == "G":
            result.append(str(hour))
        elif char == "i":
            result.append(_pad(minute, 2))
        elif char == "s":
            result.append(_pad(int(second), 2))
        elif char == "D":
            result.append(_DAY_SHORT[weekday])
        elif char == "l":
            result.append(_DAY_LONG[weekday])
        elif char == "N":
            result.append(str(7 if weekday == 0 else weekday))
        elif char == "w":
            result.append(str(weekday))
        elif char == "M":
            result.append(_MONTH_SHORT[month - 1])
        elif char == "F":
            result.append(_MONTH_LONG[month - 1])
        elif char == "U":
            result.append(number_to_string(seconds))
        elif char == "P":
            result.append(
                f"{sign}{_pad(math.floor(absolute / 3600), 2)}:"
                f"{_pad(math.floor((absolute % 3600) / 60), 2)}"
            )
        else:
            result.append(char)
        index += 1
    return "".join(result)


def _env_offset(context: FunctionContext) -> float:
    offset = parse_offset(context.env.timezone)
    if offset is None:
        raise type_error(f"{json_text(context.env.timezone)} is not a time zone offset")
    return offset


def _date_functions() -> dict[str, BuiltIn]:
    def date_fn(args, context):
        value, fmt = args[0], args[1]
        if value is None:
            return ""
        offset = _env_offset(context)
        return format_date(
            to_unix_seconds(value, offset), arg_string(fmt, "date"), offset
        )

    return {
        "date": BuiltIn(2, 2, date_fn),
        "now": BuiltIn(0, 0, lambda _args, context: context.env.now),
    }


def _build_builtins() -> dict[str, BuiltIn]:
    table: dict[str, BuiltIn] = {}
    for group in (
        _encoding_functions,
        _string_functions,
        _collection_functions,
        _number_functions,
        _date_functions,
    ):
        table.update(group())
    return table


BUILTINS: dict[str, BuiltIn] = _build_builtins()
