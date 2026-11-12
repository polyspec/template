package expr

import (
	"errors"
	"testing"

	"github.com/polyspec/template/packages/go/ast"
	"github.com/polyspec/template/packages/go/errs"
	"github.com/polyspec/template/packages/go/internal/lexer"
)

// EXP-9: multiplication binds more tightly than addition.
func TestParserPreservesPrecedenceAndConsumesTheExpression(t *testing.T) {
	text := "1 + 2 * 3"
	parser := NewParser(lexer.FromString("expression", text), 0, Options{OpenIndex: -1})
	tree, err := parser.ParseExpression()
	if err != nil {
		t.Fatal(err)
	}
	addition, ok := tree.(*ast.Binary)
	if !ok || addition.Op != "+" {
		t.Fatalf("expected addition, got %#v", tree)
	}
	multiplication, ok := addition.Right.(*ast.Binary)
	if !ok || multiplication.Op != "*" {
		t.Fatalf("expected multiplication on the right, got %#v", addition.Right)
	}
	for index, node := range []ast.Expr{addition.Left, multiplication.Left, multiplication.Right} {
		literal, ok := node.(*ast.Literal)
		if !ok || literal.Value != float64(index+1) {
			t.Fatalf("operand %d: got %#v", index, node)
		}
	}
	next, err := parser.Peek()
	if err != nil || next.Type != "EOF" || parser.End() != len(text) {
		t.Fatalf("expression end: token %#v, offset %d, error %v", next, parser.End(), err)
	}
}

func TestParserRejectsAnIncompleteBinaryExpression(t *testing.T) {
	text := "1 +"
	parser := NewParser(lexer.FromString("expression", text), 0, Options{OpenIndex: -1})
	_, err := parser.ParseExpression()
	var failure *errs.Error
	if !errors.As(err, &failure) || failure.Code != errs.ParseUnexpectedToken {
		t.Fatalf("expected unexpected-token error, got %v", err)
	}
	if failure.Offset != len(text) || failure.End != len(text) {
		t.Fatalf("expected end-of-input position %d, got %#v", len(text), failure)
	}
}
