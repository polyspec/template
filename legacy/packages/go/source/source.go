// Package source publishes the template source: UTF-8 validation, BOM removal and byte positions (LEX-1, LEX-2, LEX-16).
package source

import (
	"bytes"
	"fmt"
	"unicode/utf8"

	"github.com/polyspec/template/packages/go/errs"
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

// FromText validates and captures text through the UTF-8 byte constructor.
func FromText(name, text string) (*Source, error) { return FromBytes(name, []byte(text)) }

// Bytes returns the normalized UTF-8 bytes as an independent buffer.
func (s *Source) Bytes() []byte { return []byte(s.Text) }

// Length is the number of native byte indexes, excluding the end position.
func (s *Source) Length() int { return len(s.Text) }

// ByteAt maps a native byte index, including the end position, to a byte offset.
func (s *Source) ByteAt(index int) int {
	if index < 0 || index > len(s.Text) {
		panic("source index is outside the source")
	}
	return index
}

// Span returns the byte span of a text range.
func (s *Source) Span(start, end int) errs.Span {
	if start > end {
		panic("source range is reversed")
	}
	return errs.Span{s.ByteAt(start), s.ByteAt(end)}
}

// Error creates an error located in this source.
func (s *Source) Error(code errs.Code, start, end int, message string) *errs.Error {
	return errs.At(code, s.Name, s.Lines, errs.Span{start, end}, message)
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
