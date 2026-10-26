package lexer_test

import (
	"testing"

	"github.com/polyspec/template/packages/go/ast"
	"github.com/polyspec/template/packages/go/lexer"
	"github.com/polyspec/template/packages/go/parser"
)

// AST-2, LEX-16: a span counts UTF-8 bytes.
func TestSpansAreBytes(t *testing.T) {
	tree, err := parser.Parse(lexer.FromString("t.tpl", "é{= a}"), parser.DefaultDelimiters)
	if err != nil {
		t.Fatal(err)
	}
	echo, ok := tree.Body[1].(*ast.Echo)
	if !ok {
		t.Fatalf("Body[1] is %T, not an echo", tree.Body[1])
	}
	if echo.Span != (ast.Span{2, 7}) {
		t.Errorf("span %v", echo.Span)
	}
}
