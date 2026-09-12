package parser

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/polyspec/template/ast"
	"github.com/polyspec/template/errs"
	"github.com/polyspec/template/expr"
	"github.com/polyspec/template/lexer"
)

var identPattern = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

func isPathChar(c byte) bool {
	return c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '_' || c == '.' || c == '/' || c == '-'
}

type rawToken struct {
	kind  string // "path" or "ident"
	value string
	start int
	end   int
}

// rawTagReader reads path tokens (GRM-3) and block tag bodies (GRM-13 to GRM-15).
type rawTagReader struct {
	source     *lexer.Source
	close      string
	closeCount int
}

func (r *rawTagReader) text() string { return r.source.Text }

func (r *rawTagReader) atClose(index int) bool {
	return strings.HasPrefix(r.text()[index:], strings.Repeat(r.close, r.closeCount))
}

func (r *rawTagReader) fail(code errs.Code, start, end int, message string) error {
	return r.source.Error(code, start, end, message)
}

// readToken returns nil at the close delimiter or the end of input.
func (r *rawTagReader) readToken(index int) (*rawToken, error) {
	text := r.text()
	index = skipHorizontalSpace(text, index)
	if index >= len(text) || r.atClose(index) {
		return nil, nil
	}
	c := text[index]
	if c == '"' || c == '\'' {
		literal, err := expr.LexStringLiteral(r.source, index)
		if err != nil {
			return nil, err
		}
		return &rawToken{kind: "path", value: literal.Decoded, start: index, end: literal.End}, nil
	}
	end := index
	for end < len(text) && isPathChar(text[end]) {
		end++
	}
	value := text[index:end]
	if strings.ContainsAny(value, "./") {
		return &rawToken{kind: "path", value: value, start: index, end: end}, nil
	}
	if identPattern.MatchString(value) {
		return &rawToken{kind: "ident", value: value, start: index, end: end}, nil
	}
	return &rawToken{kind: "ident", value: "", start: index, end: index + 1}, nil
}

// readIncludePath implements GRM-12.
func (r *rawTagReader) readIncludePath(index int) (string, int, error) {
	token, err := r.readToken(index)
	if err != nil {
		return "", 0, err
	}
	if token == nil || token.value == "" {
		at := skipHorizontalSpace(r.text(), index)
		return "", 0, r.fail(errs.ParseInvalidPath, at, at+1, "include requires a path")
	}
	if token.kind != "path" {
		return "", 0, r.fail(errs.ParseInvalidPath, token.start, token.end, fmt.Sprintf("%q is not a path", token.value))
	}
	return token.value, token.end, nil
}

type blockBody struct {
	id    *string
	path  *string
	scope []*ast.ScopeItem
	end   int
}

// readBlockBody implements GRM-13 to GRM-15.
func (r *rawTagReader) readBlockBody(index int) (*blockBody, error) {
	body := &blockBody{scope: []*ast.ScopeItem{}}
	cursor := index
	token, err := r.readToken(cursor)
	if err != nil {
		return nil, err
	}
	if token == nil || token.value == "" {
		at := skipHorizontalSpace(r.text(), cursor)
		return nil, r.fail(errs.ParseInvalidBlockTag, at, at+1, "block tag requires an identifier or a path")
	}
	if token.kind == "path" {
		v := token.value
		body.path = &v
		cursor = token.end
	} else {
		v := token.value
		body.id = &v
		cursor = token.end
		token, err = r.readToken(cursor)
		if err != nil {
			return nil, err
		}
		if token != nil && token.kind == "path" {
			p := token.value
			body.path = &p
			cursor = token.end
		}
	}
	for {
		token, err = r.readToken(cursor)
		if err != nil {
			return nil, err
		}
		if token == nil {
			break
		}
		if token.kind != "ident" || token.value == "" {
			return nil, r.fail(errs.ParseInvalidBlockTag, token.start, token.end, fmt.Sprintf("unexpected %q in block tag", r.text()[token.start:token.end]))
		}
		cursor = token.end
		text := r.text()
		if cursor < len(text) && text[cursor] == ':' {
			valueStart := cursor + 1
			if valueStart >= len(text) || isHorizontalSpace(text[valueStart]) {
				return nil, r.fail(errs.ParseInvalidBlockTag, cursor, cursor+1, "scope item requires a value after \":\"")
			}
			parser := expr.NewParser(r.source, valueStart, expr.Options{Close: r.close, CloseCount: r.closeCount, OpenIndex: -1})
			value, err := parser.ParsePostfix(true)
			if err != nil {
				return nil, err
			}
			body.scope = append(body.scope, &ast.ScopeItem{Name: token.value, Expr: value})
			cursor = parser.End()
		} else {
			body.scope = append(body.scope, &ast.ScopeItem{Name: token.value, Expr: &ast.Var{Type: "Var", Name: token.value, Span: ast.Span{token.start, token.end}}})
		}
	}
	body.end = cursor
	return body, nil
}
