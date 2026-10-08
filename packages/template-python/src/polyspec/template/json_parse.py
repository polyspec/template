"""JSON text parser that preserves document order and applies VAL-2, VAL-12 and VAL-20."""

from __future__ import annotations

import re

from .bind import BindError, check_level, check_number, check_text
from .escape import first_invalid_utf8
from .values import Value

_NUMBER = re.compile(r"-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?")


def parse_json_bytes(data: bytes) -> Value:
    """Parses JSON bytes; invalid UTF-8 is a BindError with code E_DATA_INVALID_UTF8."""
    invalid = first_invalid_utf8(data)
    if invalid >= 0:
        raise BindError("E_DATA_INVALID_UTF8", f"invalid UTF-8 at byte {invalid}")
    return parse_json(data.decode("utf-8"))


def parse_json(text: str) -> Value:
    """Parses JSON text into a value.

    Object keys keep their document order. A number outside the binding range,
    an unpaired surrogate, nesting deeper than the limit and text that is not
    one JSON document raise a BindError at the first occurrence in document
    order (VAL-2, VAL-12, VAL-20).
    """
    check_text(text)
    parser = _JsonParser(text)
    value = parser.parse_value()
    parser.skip_whitespace()
    if parser.index < len(text):
        parser.fail("unexpected character after the JSON value")
    return value


class _JsonParser:
    def __init__(self, text: str):
        self.text = text
        self.index = 0
        self.level = 0

    def fail(self, message: str):
        # VAL-12: text that is not one JSON document is E_DATA_INVALID_JSON.
        raise BindError("E_DATA_INVALID_JSON", f"{message} at offset {self.index}")

    def skip_whitespace(self):
        while self.index < len(self.text) and self.text[self.index] in " \t\n\r":
            self.index += 1

    def parse_value(self) -> Value:
        self.skip_whitespace()
        char = self.text[self.index] if self.index < len(self.text) else ""
        if char == "{":
            return self.parse_object()
        if char == "[":
            return self.parse_array()
        if char == '"':
            return self.parse_string()
        if char == "t":
            return self.parse_word("true", True)
        if char == "f":
            return self.parse_word("false", False)
        if char == "n":
            return self.parse_word("null", None)
        if char == "-" or "0" <= char <= "9":
            return self.parse_number()
        self.fail("unexpected character")

    def parse_word(self, word: str, value: Value) -> Value:
        if self.text.startswith(word, self.index):
            self.index += len(word)
            return value
        self.fail(f"expected {word}")

    def parse_object(self) -> dict[str, Value]:
        self.level += 1
        check_level(self.level)
        mapping: dict[str, Value] = {}
        self.index += 1
        self.skip_whitespace()
        if self.text[self.index : self.index + 1] == "}":
            self.index += 1
            self.level -= 1
            return mapping
        while True:
            self.skip_whitespace()
            if self.text[self.index : self.index + 1] != '"':
                self.fail("expected a string key")
            key = self.parse_string()
            self.skip_whitespace()
            if self.text[self.index : self.index + 1] != ":":
                self.fail('expected ":"')
            self.index += 1
            mapping[key] = self.parse_value()
            self.skip_whitespace()
            following = self.text[self.index : self.index + 1]
            if following == ",":
                self.index += 1
                continue
            if following == "}":
                self.index += 1
                self.level -= 1
                return mapping
            self.fail('expected "," or "}"')

    def parse_array(self) -> list[Value]:
        self.level += 1
        check_level(self.level)
        items: list[Value] = []
        self.index += 1
        self.skip_whitespace()
        if self.text[self.index : self.index + 1] == "]":
            self.index += 1
            self.level -= 1
            return items
        while True:
            items.append(self.parse_value())
            self.skip_whitespace()
            following = self.text[self.index : self.index + 1]
            if following == ",":
                self.index += 1
                continue
            if following == "]":
                self.index += 1
                self.level -= 1
                return items
            self.fail('expected "," or "]"')

    def parse_string(self) -> str:
        self.index += 1
        result = []
        start = self.index
        while True:
            if self.index >= len(self.text):
                self.fail("unterminated string")
            char = self.text[self.index]
            if char == '"':
                result.append(self.text[start : self.index])
                self.index += 1
                from .values import combine_surrogate_pairs

                return combine_surrogate_pairs(check_text("".join(result)))
            if char == "\\":
                result.append(self.text[start : self.index])
                self.index += 1
                escape = self.text[self.index] if self.index < len(self.text) else ""
                if escape == '"':
                    result.append('"')
                elif escape == "\\":
                    result.append("\\")
                elif escape == "/":
                    result.append("/")
                elif escape == "b":
                    result.append("\b")
                elif escape == "f":
                    result.append("\f")
                elif escape == "n":
                    result.append("\n")
                elif escape == "r":
                    result.append("\r")
                elif escape == "t":
                    result.append("\t")
                elif escape == "u":
                    digits = self.text[self.index + 1 : self.index + 5]
                    if len(digits) != 4 or not all(
                        c in "0123456789abcdefABCDEF" for c in digits
                    ):
                        self.fail("invalid unicode escape")
                    result.append(chr(int(digits, 16)))
                    self.index += 4
                else:
                    self.fail("invalid escape")
                self.index += 1
                start = self.index
                continue
            if ord(char) < 0x20:
                self.fail("control character in string")
            self.index += 1

    def parse_number(self) -> float:
        match = _NUMBER.match(self.text, self.index)
        if not match:
            self.fail("invalid number")
        literal = match.group(0)
        self.index += len(literal)
        # The nearest double decides, whatever the spelling of the literal (VAL-2).
        return check_number(float(literal))
