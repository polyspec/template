// Package parser implements the template parser of docs/spec/lexical.md and docs/spec/grammar.md.
package parser

import (
	"regexp"
	"strings"
)

// Delimiters are the open and close delimiter characters (LEX-20).
type Delimiters struct {
	Open  string
	Close string
}

// DefaultDelimiters is `{}`.
var DefaultDelimiters = Delimiters{Open: "{", Close: "}"}

var sigils = []string{"?#", ":?", "=", "@", "?", ":", "/", "+", "#", "*", "%"}

// Wrapper is a wrapper pair of LEX-17.
type Wrapper struct {
	Opener string
	Closer string
}

var wrappers = []Wrapper{{"\"", "\""}, {"'", "'"}, {"/*", "*/"}, {"<!--", "-->"}}

var assignForm = regexp.MustCompile(`^[ \t]*[A-Za-z_][A-Za-z0-9_]*[ \t]*(\+\+|--|[-+*/%]=|=([^=>]|$))`)
var loopForm = regexp.MustCompile(`^[ \t]*[A-Za-z_][A-Za-z0-9_]*[ \t]*=`)

func isHorizontalSpace(c byte) bool { return c == ' ' || c == '\t' }

func skipHorizontalSpace(text string, index int) int {
	for index < len(text) && isHorizontalSpace(text[index]) {
		index++
	}
	return index
}

// sigilAfter returns the sigil after the open delimiter at open, or "".
func sigilAfter(text string, open int) string {
	index := skipHorizontalSpace(text, open+1)
	for _, sigil := range sigils {
		if strings.HasPrefix(text[index:], sigil) {
			return sigil
		}
	}
	return ""
}

func limit(text string, from, count int) string {
	if from > len(text) {
		return ""
	}
	end := from + count
	if end > len(text) {
		end = len(text)
	}
	return text[from:end]
}

// startsTag reports whether the open delimiter at open starts a tag (LEX-5, LEX-6).
func startsTag(text string, open int, d Delimiters) bool {
	sigil := sigilAfter(text, open)
	if sigil == "" {
		return false
	}
	after := skipHorizontalSpace(text, open+1) + len(sigil)
	switch sigil {
	case "/":
		at := skipHorizontalSpace(text, after)
		return strings.HasPrefix(text[at:], d.Close)
	case "@":
		return loopForm.MatchString(limit(text, after, 80))
	}
	return true
}

// wrappedTagAt returns the wrapper whose opener starts at index and is followed by a wrapped tag start (LEX-18).
func wrappedTagAt(text string, index int, d Delimiters) *Wrapper {
	for i := range wrappers {
		w := &wrappers[i]
		if !strings.HasPrefix(text[index:], w.Opener) {
			continue
		}
		after := skipHorizontalSpace(text, index+len(w.Opener))
		if strings.HasPrefix(text[after:], d.Open+d.Open) && startsTag(text, after+1, d) {
			return w
		}
		return nil
	}
	return nil
}

// IsDelimiterChar implements LEX-21.
func IsDelimiterChar(c byte) bool {
	if c <= 0x20 || c >= 0x7f {
		return false
	}
	if c >= '0' && c <= '9' || c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' {
		return false
	}
	return c != '_' && c != '\\'
}

// ParseDelimiters parses a two-character delimiter option; ok is false when it is invalid.
func ParseDelimiters(value string) (Delimiters, bool) {
	if len(value) != 2 || !IsDelimiterChar(value[0]) || !IsDelimiterChar(value[1]) {
		return Delimiters{}, false
	}
	return Delimiters{Open: value[:1], Close: value[1:]}, true
}
