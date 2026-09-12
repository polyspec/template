// Package errs defines the error object and the error codes of docs/spec/errors.md.
package errs

import (
	"encoding/json"
	"sort"
)

// Code is an error code such as E_PARSE_UNEXPECTED_TOKEN.
type Code string

// Error codes.
const (
	LexInvalidUTF8           Code = "E_LEX_INVALID_UTF8"
	ParseUnterminatedTag     Code = "E_PARSE_UNTERMINATED_TAG"
	ParseUnterminatedComment Code = "E_PARSE_UNTERMINATED_COMMENT"
	ParseUnterminatedString  Code = "E_PARSE_UNTERMINATED_STRING"
	ParseUnexpectedToken     Code = "E_PARSE_UNEXPECTED_TOKEN"
	ParseInvalidNumber       Code = "E_PARSE_INVALID_NUMBER"
	ParseInvalidEscape       Code = "E_PARSE_INVALID_ESCAPE"
	ParseUnexpectedClose     Code = "E_PARSE_UNEXPECTED_CLOSE"
	ParseUnclosedBlock       Code = "E_PARSE_UNCLOSED_BLOCK"
	ParseElseOutsideBlock    Code = "E_PARSE_ELSE_OUTSIDE_BLOCK"
	ParseDuplicateElse       Code = "E_PARSE_DUPLICATE_ELSE"
	ParseElseifAfterElse     Code = "E_PARSE_ELSEIF_AFTER_ELSE"
	ParseElseifNotInIf       Code = "E_PARSE_ELSEIF_NOT_IN_IF"
	ParseReservedName        Code = "E_PARSE_RESERVED_NAME"
	ParseInvalidPath         Code = "E_PARSE_INVALID_PATH"
	ParseInvalidBlockTag     Code = "E_PARSE_INVALID_BLOCK_TAG"
	ParseInvalidWrapper      Code = "E_PARSE_INVALID_WRAPPER"
	ParseInvalidDirective    Code = "E_PARSE_INVALID_DIRECTIVE"
	LoadNotFound             Code = "E_LOAD_NOT_FOUND"
	LoadCycle                Code = "E_LOAD_CYCLE"
	LoadOutsideRoot          Code = "E_LOAD_OUTSIDE_ROOT"
	DataNumberRange          Code = "E_DATA_NUMBER_RANGE"
	DataNumberNotFinite      Code = "E_DATA_NUMBER_NOT_FINITE"
	DataInvalidUTF8          Code = "E_DATA_INVALID_UTF8"
	DataUnsupportedType      Code = "E_DATA_UNSUPPORTED_TYPE"
	RuntimeType              Code = "E_RUNTIME_TYPE"
	RuntimeCompare           Code = "E_RUNTIME_COMPARE"
	RuntimeDivZero           Code = "E_RUNTIME_DIV_ZERO"
	RuntimeStringify         Code = "E_RUNTIME_STRINGIFY"
	RuntimeUnknownFunction   Code = "E_RUNTIME_UNKNOWN_FUNCTION"
	RuntimeArity             Code = "E_RUNTIME_ARITY"
	RuntimeHostFunction      Code = "E_RUNTIME_HOST_FUNCTION"
	RuntimeUnknownLoop       Code = "E_RUNTIME_UNKNOWN_LOOP"
	RuntimeBlockUndefined    Code = "E_RUNTIME_BLOCK_UNDEFINED"
	RuntimeBlockRedefined    Code = "E_RUNTIME_BLOCK_REDEFINED"
	RuntimeDepth             Code = "E_RUNTIME_DEPTH"
	RuntimeLimit             Code = "E_RUNTIME_LIMIT"
)

// Span is a byte range [start, end) of a source.
type Span [2]int

// Error is the error object of ERR-1.
type Error struct {
	Code     Code   `json:"code"`
	Template string `json:"template"`
	Line     int    `json:"line"`
	Col      int    `json:"col"`
	Offset   int    `json:"offset"`
	End      int    `json:"end"`
	Message  string `json:"message"`
}

// Error implements the error interface.
func (e *Error) Error() string {
	return string(e.Code) + ": " + e.Message
}

// JSON returns the error object as JSON text.
func (e *Error) JSON() []byte {
	data, _ := json.Marshal(e)
	return data
}

// LineIndex holds the byte offsets of line starts.
type LineIndex []int

// NewLineIndex computes the line starts of a source.
func NewLineIndex(source []byte) LineIndex {
	starts := []int{0}
	for i, b := range source {
		if b == '\n' {
			starts = append(starts, i+1)
		}
	}
	return starts
}

// Position returns the 1-based line and byte column of an offset (ERR-2).
func (l LineIndex) Position(offset int) (line, col int) {
	if len(l) == 0 {
		return 0, 0
	}
	i := sort.Search(len(l), func(i int) bool { return l[i] > offset }) - 1
	if i < 0 {
		i = 0
	}
	return i + 1, offset - l[i] + 1
}

// At creates an error located at a span of a template.
func At(code Code, template string, lines LineIndex, span Span, message string) *Error {
	line, col := 0, 0
	if lines != nil {
		line, col = lines.Position(span[0])
	}
	return &Error{Code: code, Template: template, Line: line, Col: col, Offset: span[0], End: span[1], Message: message}
}

// WithoutPosition creates an error that has no source position (ERR-5, ERR-6).
func WithoutPosition(code Code, template, message string) *Error {
	return &Error{Code: code, Template: template, Message: message}
}
