// Package expr implements the expression lexer and parser of docs/spec/expressions.md.
package expr

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/polyspec/template/errs"
	"github.com/polyspec/template/lexer"
)

// TokenType is a token type name of CNF-13; CLOSE is the tag end.
type TokenType string

// Token is one expression token; Start and End are byte offsets.
type Token struct {
	Type    TokenType
	Value   string
	Start   int
	End     int
	Decoded string
}

var operators = []struct {
	text string
	typ  TokenType
}{
	{"===", "SEQ"}, {"!==", "SNE"}, {"...", "SPREAD"},
	{"==", "EQ"}, {"!=", "NE"}, {"<=", "LE"}, {">=", "GE"}, {"&&", "AND"}, {"||", "OR"},
	{"??", "COALESCE"}, {"?:", "ELVIS"}, {"=>", "ARROW"},
	{"(", "LPAREN"}, {")", "RPAREN"}, {"[", "LBRACKET"}, {"]", "RBRACKET"}, {",", "COMMA"},
	{"|", "PIPE"}, {"?", "QUESTION"}, {":", "COLON"}, {"+", "PLUS"}, {"-", "MINUS"},
	{"*", "STAR"}, {"/", "SLASH"}, {"%", "PERCENT"}, {"!", "BANG"}, {"<", "LT"}, {">", "GT"},
}

const expressionChars = "()[],|?:=>.+-*/%!<&'\""

var postfixEnd = map[TokenType]bool{"IDENT": true, "NUMBER": true, "STRING": true, "NULL": true, "TRUE": true, "FALSE": true, "RPAREN": true, "RBRACKET": true, "DOT_IDENT": true, "DOT_INDEX": true}

func isIdentStart(c byte) bool { return c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c == '_' }
func isDigit(c byte) bool      { return c >= '0' && c <= '9' }
func isIdentPart(c byte) bool  { return isIdentStart(c) || isDigit(c) }
func isWhitespace(c byte) bool { return c == ' ' || c == '\t' || c == '\r' || c == '\n' }

// Options select the close delimiter of the enclosing tag.
type Options struct {
	Close      string // "" for a bare expression
	CloseCount int
	OpenIndex  int // -1 for a bare expression
}

// Lexer produces expression tokens.
type Lexer struct {
	source       *lexer.Source
	options      Options
	index        int
	previous     *Token
	lookahead    *Token
	closeExpr    bool
	nestingDepth int
}

// NewLexer creates a lexer starting at a byte offset.
func NewLexer(source *lexer.Source, start int, options Options) *Lexer {
	return &Lexer{source: source, options: options, index: start, closeExpr: options.Close != "" && strings.Contains(expressionChars, options.Close)}
}

// Error creates an error located in the source.
func (l *Lexer) Error(code errs.Code, start, end int, message string) *errs.Error {
	return l.source.Error(code, start, end, message)
}

// Peek returns the next token without consuming it.
func (l *Lexer) Peek() (*Token, error) {
	if l.lookahead == nil {
		tok, err := l.read()
		if err != nil {
			return nil, err
		}
		l.lookahead = tok
	}
	return l.lookahead, nil
}

// Next consumes and returns the next token.
func (l *Lexer) Next() (*Token, error) {
	tok, err := l.Peek()
	if err != nil {
		return nil, err
	}
	l.lookahead = nil
	l.previous = tok
	if tok.Type == "LPAREN" || tok.Type == "LBRACKET" {
		l.nestingDepth++
	}
	if tok.Type == "RPAREN" || tok.Type == "RBRACKET" {
		l.nestingDepth--
	}
	return tok, nil
}

// ConsumedEnd is the byte offset after the last consumed token.
func (l *Lexer) ConsumedEnd() int {
	if l.previous != nil {
		return l.previous.End
	}
	return l.index
}

func (l *Lexer) read() (*Token, error) {
	text := l.source.Text
	for l.index < len(text) && isWhitespace(text[l.index]) {
		l.index++
	}
	start := l.index
	if start >= len(text) {
		return &Token{Type: "EOF", Start: start, End: start}, nil
	}
	if l.options.Close != "" && (l.previous != nil && postfixEnd[l.previous.Type] && l.nestingDepth == 0 || !l.closeExpr) {
		sequence := strings.Repeat(l.options.Close, l.options.CloseCount)
		if strings.HasPrefix(text[start:], sequence) {
			l.index = start + len(sequence)
			return &Token{Type: "CLOSE", Value: sequence, Start: start, End: l.index}, nil
		}
	}
	c := text[start]
	switch {
	case isIdentStart(c):
		end := start + 1
		for end < len(text) && isIdentPart(text[end]) {
			end++
		}
		l.index = end
		value := text[start:end]
		typ := TokenType("IDENT")
		switch value {
		case "null":
			typ = "NULL"
		case "true":
			typ = "TRUE"
		case "false":
			typ = "FALSE"
		case "in":
			typ = "IN"
		}
		return &Token{Type: typ, Value: value, Start: start, End: end}, nil
	case isDigit(c):
		return l.readNumber(start)
	case c == '"' || c == '\'':
		literal, err := LexStringLiteral(l.source, start)
		if err != nil {
			return nil, err
		}
		l.index = literal.End
		return &Token{Type: "STRING", Value: text[start:literal.End], Start: start, End: literal.End, Decoded: literal.Decoded}, nil
	case c == '.':
		return l.readDot(start)
	}
	for _, op := range operators {
		if strings.HasPrefix(text[start:], op.text) {
			l.index = start + len(op.text)
			return &Token{Type: op.typ, Value: op.text, Start: start, End: l.index}, nil
		}
	}
	return nil, l.Error(errs.ParseUnexpectedToken, start, start+1, fmt.Sprintf("unexpected character %q", text[start:start+1]))
}

func (l *Lexer) readNumber(start int) (*Token, error) {
	text := l.source.Text
	end := start
	for end < len(text) && isDigit(text[end]) {
		end++
	}
	if end+1 < len(text) && text[end] == '.' && isDigit(text[end+1]) {
		end++
		for end < len(text) && isDigit(text[end]) {
			end++
		}
	}
	if end < len(text) && (text[end] == 'e' || text[end] == 'E') {
		cursor := end + 1
		if cursor < len(text) && (text[cursor] == '+' || text[cursor] == '-') {
			cursor++
		}
		if cursor < len(text) && isDigit(text[cursor]) {
			for cursor < len(text) && isDigit(text[cursor]) {
				cursor++
			}
			end = cursor
		} else {
			return nil, l.Error(errs.ParseInvalidNumber, start, cursor, fmt.Sprintf("invalid number %q", text[start:cursor]))
		}
	}
	closeAtEnd := l.options.Close != "" && l.nestingDepth == 0 && strings.HasPrefix(text[end:], l.options.Close)
	if end < len(text) && (isIdentPart(text[end]) || (text[end] == '.' && !closeAtEnd)) {
		cursor := end + 1
		for cursor < len(text) && (isIdentPart(text[cursor]) || text[cursor] == '.') {
			cursor++
		}
		return nil, l.Error(errs.ParseInvalidNumber, start, cursor, fmt.Sprintf("invalid number %q", text[start:cursor]))
	}
	l.index = end
	return &Token{Type: "NUMBER", Value: text[start:end], Start: start, End: end}, nil
}

func (l *Lexer) readDot(start int) (*Token, error) {
	text := l.source.Text
	if strings.HasPrefix(text[start:], "...") {
		l.index = start + 3
		return &Token{Type: "SPREAD", Value: "...", Start: start, End: l.index}, nil
	}
	var next byte
	if start+1 < len(text) {
		next = text[start+1]
	}
	adjacent := l.previous != nil && l.previous.End == start && postfixEnd[l.previous.Type]
	if adjacent && isIdentStart(next) {
		end := start + 2
		for end < len(text) && isIdentPart(text[end]) {
			end++
		}
		l.index = end
		return &Token{Type: "DOT_IDENT", Value: text[start:end], Start: start, End: end}, nil
	}
	if adjacent && isDigit(next) {
		end := start + 2
		for end < len(text) && isDigit(text[end]) {
			end++
		}
		l.index = end
		return &Token{Type: "DOT_INDEX", Value: text[start:end], Start: start, End: end}, nil
	}
	if isDigit(next) {
		end := start + 1
		for end < len(text) && (isIdentPart(text[end]) || text[end] == '.') {
			end++
		}
		return nil, l.Error(errs.ParseInvalidNumber, start, end, fmt.Sprintf("invalid number %q", text[start:end]))
	}
	return nil, l.Error(errs.ParseUnexpectedToken, start, start+1, "unexpected \".\"")
}

// StringLiteral is a decoded string literal.
type StringLiteral struct {
	Decoded string
	End     int
}

// LexStringLiteral reads a string literal starting at the quote at start (EXP-3).
func LexStringLiteral(source *lexer.Source, start int) (StringLiteral, error) {
	text := source.Text
	quote := text[start]
	var decoded strings.Builder
	index := start + 1
	for {
		if index >= len(text) {
			return StringLiteral{}, source.Error(errs.ParseUnterminatedString, start, start+1, "string literal is not terminated")
		}
		c := text[index]
		if c == quote {
			return StringLiteral{Decoded: decoded.String(), End: index + 1}, nil
		}
		if c != '\\' {
			decoded.WriteByte(c)
			index++
			continue
		}
		var escape byte
		if index+1 < len(text) {
			escape = text[index+1]
		}
		switch escape {
		case '\\':
			decoded.WriteByte('\\')
			index += 2
		case '\'':
			decoded.WriteByte('\'')
			index += 2
		case '"':
			decoded.WriteByte('"')
			index += 2
		case 'n':
			decoded.WriteByte('\n')
			index += 2
		case 'r':
			decoded.WriteByte('\r')
			index += 2
		case 't':
			decoded.WriteByte('\t')
			index += 2
		case 'u':
			if index+6 > len(text) || !isHex(text[index+2:index+6]) {
				return StringLiteral{}, source.Error(errs.ParseInvalidEscape, index, index+2, "invalid escape sequence")
			}
			code, _ := strconv.ParseUint(text[index+2:index+6], 16, 32)
			index += 6
			if code >= 0xd800 && code <= 0xdbff && index+6 <= len(text) && text[index] == '\\' && text[index+1] == 'u' && isHex(text[index+2:index+6]) {
				low, _ := strconv.ParseUint(text[index+2:index+6], 16, 32)
				if low >= 0xdc00 && low <= 0xdfff {
					code = 0x10000 + (code-0xd800)<<10 + (low - 0xdc00)
					index += 6
				}
			}
			decoded.WriteRune(rune(code))
		default:
			return StringLiteral{}, source.Error(errs.ParseInvalidEscape, index, index+2, "invalid escape sequence")
		}
	}
}

func isHex(s string) bool {
	if len(s) != 4 {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if !(isDigit(c) || c >= 'a' && c <= 'f' || c >= 'A' && c <= 'F') {
			return false
		}
	}
	return true
}
