"""Error object and error codes as defined in docs/spec/errors.md."""

from __future__ import annotations

from typing import Optional

# Every code is listed with its condition and position in ERR-7 to ERR-12.
ERROR_CODES = (
    'E_LEX_INVALID_UTF8', 'E_PARSE_UNTERMINATED_TAG', 'E_PARSE_UNTERMINATED_COMMENT',
    'E_PARSE_UNTERMINATED_STRING', 'E_PARSE_UNEXPECTED_TOKEN', 'E_PARSE_INVALID_NUMBER',
    'E_PARSE_INVALID_ESCAPE', 'E_PARSE_UNEXPECTED_CLOSE', 'E_PARSE_UNCLOSED_BLOCK',
    'E_PARSE_ELSE_OUTSIDE_BLOCK', 'E_PARSE_DUPLICATE_ELSE', 'E_PARSE_ELSEIF_AFTER_ELSE',
    'E_PARSE_ELSEIF_NOT_IN_IF', 'E_PARSE_RESERVED_NAME', 'E_PARSE_INVALID_PATH',
    'E_PARSE_INVALID_BLOCK_TAG', 'E_PARSE_INVALID_WRAPPER', 'E_PARSE_INVALID_DIRECTIVE',
    'E_LOAD_NOT_FOUND', 'E_LOAD_CYCLE', 'E_LOAD_OUTSIDE_ROOT', 'E_LOAD_FAILED',
    'E_DATA_NUMBER_RANGE', 'E_DATA_NUMBER_NOT_FINITE', 'E_DATA_INVALID_UTF8',
    'E_DATA_UNSUPPORTED_TYPE', 'E_DATA_DEPTH', 'E_DATA_INVALID_JSON',
    'E_RUNTIME_TYPE', 'E_RUNTIME_COMPARE', 'E_RUNTIME_DIV_ZERO', 'E_RUNTIME_STRINGIFY',
    'E_RUNTIME_UNKNOWN_FUNCTION', 'E_RUNTIME_ARITY', 'E_RUNTIME_HOST_FUNCTION',
    'E_RUNTIME_UNKNOWN_LOOP', 'E_RUNTIME_BLOCK_UNDEFINED', 'E_RUNTIME_BLOCK_REDEFINED',
    'E_RUNTIME_DEPTH', 'E_RUNTIME_LIMIT', 'E_INTERNAL',
)

# A code of a template error, one of ERROR_CODES.
ErrorCode = str

# A byte span, the pair [start, end).
Span = tuple[int, int]

# Byte offsets of line starts, used to convert a byte offset into line and column.
LineIndex = list[int]


def line_index_of(data: bytes) -> LineIndex:
    starts = [0]
    for index, byte in enumerate(data):
        if byte == 0x0a:
            starts.append(index + 1)
    return starts


def position_of(lines: LineIndex, offset: int) -> tuple[int, int]:
    low, high = 0, len(lines) - 1
    while low < high:
        middle = (low + high + 1) >> 1
        if lines[middle] <= offset:
            low = middle
        else:
            high = middle - 1
    return low + 1, offset - lines[low] + 1


class TemplateError(Exception):
    """The error that parsing and rendering raise (ERR-1, ERR-2).

    It carries the position of the token or node it refers to; conformance
    compares `code`, `template`, `line` and `col` only.
    """

    def __init__(self, code: str, template: str, line: int, col: int, offset: int, end: int,
                 message: str):
        super().__init__(message)
        self.name = 'TemplateError'
        self.code = code
        self.template = template
        self.line = line
        self.col = col
        self.offset = offset
        self.end = end
        self.message = message

    def to_object(self) -> dict:
        """The fields as a plain object, which is the form the command line prints."""
        return {'code': self.code, 'template': self.template, 'line': self.line, 'col': self.col,
                'offset': self.offset, 'end': self.end, 'message': self.message}


def error_at(code: str, template: str, lines: Optional[LineIndex], span: Span,
             message: str) -> TemplateError:
    """Creates an error located at a byte span of a template whose line index is known."""
    line, col = position_of(lines, span[0]) if lines is not None else (0, 0)
    return TemplateError(code, template, line, col, span[0], span[1], message)


def error_without_position(code: str, template: str, message: str) -> TemplateError:
    """Creates an error with no source position."""
    return TemplateError(code, template, 0, 0, 0, 0, message)


# The errors that the engine raises for a programming defect (ERR-13).
RUNTIME_ERRORS = (TypeError, ValueError, ArithmeticError, IndexError, KeyError, AttributeError,
                  RecursionError, LookupError)


def internal_boundary(template: str, operation):
    """Runs one public parse, prepare or render operation and reports a language runtime
    error as E_INTERNAL for `template` (ERR-12, ERR-13).

    A template error and every other exception pass unchanged.
    """
    try:
        return operation()
    except RUNTIME_ERRORS as error:
        raise error_without_position('E_INTERNAL', template,
                                     f'internal failure: {error}') from None
