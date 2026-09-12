// Package lexer holds the template source: UTF-8 validation, BOM removal and byte positions (LEX-1, LEX-2, LEX-16).
package lexer

import (
	"bytes"
	"fmt"
	"unicode/utf8"

	"github.com/polyspec/template/errs"
)

// Source is a validated template source.
type Source struct {
	Name  string
	Text  string
	Lines errs.LineIndex
}

var bom = []byte{0xef, 0xbb, 0xbf}

// FromBytes validates UTF-8, removes a leading BOM and builds the line index.
func FromBytes(name string, input []byte) (*Source, error) {
	if invalid := firstInvalidUTF8(input); invalid >= 0 {
		return nil, errs.At(errs.LexInvalidUTF8, name, errs.NewLineIndex(input), errs.Span{invalid, invalid + 1}, fmt.Sprintf("invalid UTF-8 byte at offset %d", invalid))
	}
	data := input
	if bytes.HasPrefix(data, bom) {
		data = data[3:]
	}
	return &Source{Name: name, Text: string(data), Lines: errs.NewLineIndex(data)}, nil
}

// FromString builds a source from text.
func FromString(name, text string) *Source {
	source, _ := FromBytes(name, []byte(text))
	return source
}

// Span returns the byte span of a text range.
func (s *Source) Span(start, end int) errs.Span {
	return errs.Span{start, end}
}

// Error creates an error located in this source.
func (s *Source) Error(code errs.Code, start, end int, message string) *errs.Error {
	return errs.At(code, s.Name, s.Lines, s.Span(start, end), message)
}

func firstInvalidUTF8(data []byte) int {
	for i := 0; i < len(data); {
		r, size := utf8.DecodeRune(data[i:])
		if r == utf8.RuneError && size <= 1 {
			return i
		}
		i += size
	}
	return -1
}
