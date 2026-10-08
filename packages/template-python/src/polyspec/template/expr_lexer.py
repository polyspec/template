"""Expression tokens as defined in EXP-1 to EXP-6 and CNF-13."""

from __future__ import annotations

import re

from .errors import ErrorCode, TemplateError, error_at
from .source import Source

OPERATORS = (
    ("===", "SEQ"),
    ("!==", "SNE"),
    ("...", "SPREAD"),
    ("==", "EQ"),
    ("!=", "NE"),
    ("<=", "LE"),
    (">=", "GE"),
    ("&&", "AND"),
    ("||", "OR"),
    ("??", "COALESCE"),
    ("?:", "ELVIS"),
    ("::", "DOUBLE_COLON"),
    ("=>", "ARROW"),
    ("(", "LPAREN"),
    (")", "RPAREN"),
    ("[", "LBRACKET"),
    ("]", "RBRACKET"),
    (",", "COMMA"),
    ("|", "PIPE"),
    ("?", "QUESTION"),
    (":", "COLON"),
    ("+", "PLUS"),
    ("-", "MINUS"),
    ("*", "STAR"),
    ("/", "SLASH"),
    ("%", "PERCENT"),
    ("!", "BANG"),
    ("<", "LT"),
    (">", "GT"),
)

# Characters that start an expression token; a close delimiter among them is lexed as its token.
EXPRESSION_CHARS = set("()[],|?:=>.+-*/%!<&'\"")

POSTFIX_END = frozenset(
    (
        "IDENT",
        "NUMBER",
        "STRING",
        "NULL",
        "TRUE",
        "FALSE",
        "RPAREN",
        "RBRACKET",
        "DOT_IDENT",
        "DOT_INDEX",
    )
)

_HEX4 = re.compile(r"[0-9a-fA-F]{4}\Z")


class Token:
    __slots__ = ("type", "value", "start", "end", "decoded")

    def __init__(
        self, type: str, value: str, start: int, end: int, decoded: "str | None" = None
    ):
        self.type = type
        self.value = value
        self.start = start
        self.end = end
        # Decoded string value for STRING tokens.
        self.decoded = decoded


def is_ident_start(code: int) -> bool:
    return 0x41 <= code <= 0x5A or 0x61 <= code <= 0x7A or code == 0x5F


def is_ident_part(code: int) -> bool:
    return is_ident_start(code) or 0x30 <= code <= 0x39


def is_digit(code: int) -> bool:
    return 0x30 <= code <= 0x39


def is_whitespace(code: int) -> bool:
    return code in (0x20, 0x09, 0x0D, 0x0A)


def _replace_lone_surrogates(text: str) -> str:
    # EXP-3: a surrogate escape outside a high-low pair produces U+FFFD.
    result = []
    index = 0
    while index < len(text):
        code = ord(text[index])
        if 0xD800 <= code <= 0xDBFF:
            if index + 1 < len(text) and 0xDC00 <= ord(text[index + 1]) <= 0xDFFF:
                result.append(text[index : index + 2])
                index += 2
                continue
            result.append("�")
            index += 1
            continue
        if 0xDC00 <= code <= 0xDFFF:
            result.append("�")
            index += 1
            continue
        result.append(text[index])
        index += 1
    return "".join(result)


def lex_string_literal(source: Source, start: int, template: str) -> tuple[str, int]:
    """Reads a string literal starting at the quote at `start` (EXP-3)."""
    text = source.text
    quote = text[start]

    def fail(
        code: "ErrorCode", from_index: int, to_index: int, message: str
    ) -> TemplateError:
        return error_at(
            code, template, source.lines, source.span(from_index, to_index), message
        )

    decoded: list[str] = []
    index = start + 1
    while True:
        if index >= len(text):
            raise fail(
                "E_PARSE_UNTERMINATED_STRING",
                start,
                start + 1,
                "string literal is not terminated",
            )
        char = text[index]
        if char == quote:
            from .values import combine_surrogate_pairs

            return combine_surrogate_pairs(
                _replace_lone_surrogates("".join(decoded))
            ), index + 1
        if char != "\\":
            decoded.append(char)
            index += 1
            continue
        escape = text[index + 1] if index + 1 < len(text) else ""
        if escape == "\\":
            decoded.append("\\")
            index += 2
        elif escape == "'":
            decoded.append("'")
            index += 2
        elif escape == '"':
            decoded.append('"')
            index += 2
        elif escape == "n":
            decoded.append("\n")
            index += 2
        elif escape == "r":
            decoded.append("\r")
            index += 2
        elif escape == "t":
            decoded.append("\t")
            index += 2
        elif escape == "u":
            digits = text[index + 2 : index + 6]
            if not _HEX4.match(digits):
                raise fail(
                    "E_PARSE_INVALID_ESCAPE",
                    index,
                    index + 2,
                    "invalid escape sequence",
                )
            decoded.append(chr(int(digits, 16)))
            index += 6
        else:
            raise fail(
                "E_PARSE_INVALID_ESCAPE", index, index + 2, "invalid escape sequence"
            )


class LexerOptions:
    def __init__(self, close: "str | None", close_count: int, open_index: "int | None"):
        # The close delimiter character and how many times it is repeated to end
        # the tag; None for a bare expression.
        self.close = close
        self.close_count = close_count
        # The code point index of the tag start, used for E_PARSE_UNTERMINATED_TAG;
        # None for a bare expression.
        self.open_index = open_index


class ExpressionLexer:
    def __init__(
        self, source: Source, start: int, options: LexerOptions, template: str
    ):
        self.source = source
        self.options = options
        self.template = template
        self.index = start
        self.previous: "Token | None" = None
        self.lookahead: "Token | None" = None
        self.nesting_depth = 0
        # Tokens consumed by the parser, including the closing delimiter.
        self.consumed: list[Token] = []

    @property
    def position(self) -> int:
        return self.lookahead.start if self.lookahead else self.index

    def error(
        self, code: "ErrorCode", start: int, end: int, message: str
    ) -> TemplateError:
        return error_at(
            code,
            self.template,
            self.source.lines,
            self.source.span(start, end),
            message,
        )

    def peek(self) -> Token:
        if not self.lookahead:
            self.lookahead = self._read()
        return self.lookahead

    def next(self) -> Token:
        token = self.peek()
        self.lookahead = None
        self.previous = token
        if token.type in ("LPAREN", "LBRACKET"):
            self.nesting_depth += 1
        if token.type in ("RPAREN", "RBRACKET"):
            self.nesting_depth -= 1
        self.consumed.append(token)
        return token

    @property
    def consumed_end(self) -> int:
        """The byte offset after the last consumed token."""
        return self.previous.end if self.previous else self.index

    def _read(self) -> Token:
        text = self.source.text
        while self.index < len(text) and is_whitespace(ord(text[self.index])):
            self.index += 1
        start = self.index
        if start >= len(text):
            return Token("EOF", "", start, start)

        close = self.options.close
        if close is not None and (
            (
                self.previous is not None
                and self.previous.type in POSTFIX_END
                and self.nesting_depth == 0
            )
            or close not in EXPRESSION_CHARS
        ):
            sequence = close * self.options.close_count
            if text.startswith(sequence, start):
                self.index = start + len(sequence)
                return Token("CLOSE", sequence, start, self.index)

        code = ord(text[start])
        if is_ident_start(code):
            end = start + 1
            while end < len(text) and is_ident_part(ord(text[end])):
                end += 1
            self.index = end
            value = text[start:end]
            if value == "null":
                kind = "NULL"
            elif value == "true":
                kind = "TRUE"
            elif value == "false":
                kind = "FALSE"
            elif value == "in":
                kind = "IN"
            else:
                kind = "IDENT"
            return Token(kind, value, start, end)
        if is_digit(code):
            return self._read_number(start)
        if code in (0x22, 0x27):
            return self._read_string(start)
        if code == 0x2E:
            return self._read_dot(start)
        for operator, kind in OPERATORS:
            if text.startswith(operator, start):
                self.index = start + len(operator)
                return Token(kind, operator, start, self.index)
        raise self.error(
            "E_PARSE_UNEXPECTED_TOKEN",
            start,
            start + 1,
            f"unexpected character {json_char(text[start])}",
        )

    def _read_number(self, start: int) -> Token:
        text = self.source.text
        end = start
        while end < len(text) and is_digit(ord(text[end])):
            end += 1
        if (
            text[end : end + 1] == "."
            and end + 1 < len(text)
            and is_digit(ord(text[end + 1]))
        ):
            end += 1
            while end < len(text) and is_digit(ord(text[end])):
                end += 1
        if text[end : end + 1] in ("e", "E"):
            cursor = end + 1
            if text[cursor : cursor + 1] in ("+", "-"):
                cursor += 1
            if cursor < len(text) and is_digit(ord(text[cursor])):
                while cursor < len(text) and is_digit(ord(text[cursor])):
                    cursor += 1
                end = cursor
            else:
                raise self.error(
                    "E_PARSE_INVALID_NUMBER",
                    start,
                    cursor,
                    f"invalid number {json_char(text[start:cursor])}",
                )
        following = ord(text[end]) if end < len(text) else -1
        close_at_end = (
            self.options.close is not None
            and self.nesting_depth == 0
            and text.startswith(self.options.close, end)
        )
        if end < len(text) and (
            is_ident_part(following) or (following == 0x2E and not close_at_end)
        ):
            cursor = end + 1
            while cursor < len(text) and (
                is_ident_part(ord(text[cursor])) or text[cursor] == "."
            ):
                cursor += 1
            raise self.error(
                "E_PARSE_INVALID_NUMBER",
                start,
                cursor,
                f"invalid number {json_char(text[start:cursor])}",
            )
        self.index = end
        return Token("NUMBER", text[start:end], start, end)

    def _read_dot(self, start: int) -> Token:
        text = self.source.text
        if text.startswith("...", start):
            self.index = start + 3
            return Token("SPREAD", "...", start, self.index)
        next_code = ord(text[start + 1]) if start + 1 < len(text) else -1
        adjacent = (
            self.previous is not None
            and self.previous.end == start
            and self.previous.type in POSTFIX_END
        )
        if adjacent and is_ident_start(next_code):
            end = start + 2
            while end < len(text) and is_ident_part(ord(text[end])):
                end += 1
            self.index = end
            return Token("DOT_IDENT", text[start:end], start, end)
        if adjacent and is_digit(next_code):
            end = start + 2
            while end < len(text) and is_digit(ord(text[end])):
                end += 1
            self.index = end
            return Token("DOT_INDEX", text[start:end], start, end)
        if is_digit(next_code):
            end = start + 1
            while end < len(text) and (
                is_ident_part(ord(text[end])) or text[end] == "."
            ):
                end += 1
            raise self.error(
                "E_PARSE_INVALID_NUMBER",
                start,
                end,
                f"invalid number {json_char(text[start:end])}",
            )
        raise self.error("E_PARSE_UNEXPECTED_TOKEN", start, start + 1, 'unexpected "."')

    def _read_string(self, start: int) -> Token:
        decoded, end = lex_string_literal(self.source, start, self.template)
        self.index = end
        return Token("STRING", self.source.text[start:end], start, end, decoded)


def json_char(value: str) -> str:
    """The JSON text of a short string, for error messages."""
    import json

    return json.dumps(value)
