package parser_test

import (
	"errors"
	"testing"

	"github.com/polyspec/template/ast"
	"github.com/polyspec/template/errs"
	"github.com/polyspec/template/lexer"
	"github.com/polyspec/template/parser"
)

func parse(t *testing.T, text string) *ast.Template {
	t.Helper()
	tree, err := parser.Parse(lexer.FromString("t.tpl", text), parser.DefaultDelimiters)
	if err != nil {
		t.Fatal(err)
	}
	return tree
}

func codeOf(text string) errs.Code {
	_, err := parser.Parse(lexer.FromString("t.tpl", text), parser.DefaultDelimiters)
	var te *errs.Error
	if errors.As(err, &te) {
		return te.Code
	}
	return ""
}

func TestTagStartRule(t *testing.T) {
	tree := parse(t, "{/* c */}{/re/.test(s)}.a { @media x { } }{ x = 1 }")
	if len(tree.Body) != 1 {
		t.Fatalf("expected one text node, got %d", len(tree.Body))
	}
	if _, ok := tree.Body[0].(*ast.Text); !ok {
		t.Fatal("expected text")
	}
	tree = parse(t, "{= a}{@ i = xs}{/}{? a}{:}{/}")
	if len(tree.Body) != 3 {
		t.Fatalf("expected three nodes, got %d", len(tree.Body))
	}
}

func TestDelimiters(t *testing.T) {
	tree, err := parser.Parse(lexer.FromString("t.tpl", ";= a;"), parser.Delimiters{Open: ";", Close: ";"})
	if err != nil || len(tree.Body) != 1 {
		t.Fatalf("option delimiters: %v", err)
	}
	tree = parse(t, "{% delimiter [] }\n[= a[0]]\n")
	if len(tree.Body) != 2 {
		t.Fatalf("directive: %d nodes", len(tree.Body))
	}
	if codeOf("{= a}{% delimiter ;;}") != errs.ParseInvalidDirective || codeOf("{% delimiter ab}") != errs.ParseInvalidDirective {
		t.Error("invalid directive codes")
	}
}

func TestBlockStructureErrors(t *testing.T) {
	cases := map[string]errs.Code{
		"{/}":                   errs.ParseUnexpectedClose,
		"{? a}":                 errs.ParseUnclosedBlock,
		"{:}":                   errs.ParseElseOutsideBlock,
		"{? a}{:}{:}{/}":        errs.ParseDuplicateElse,
		"{? a}{:}{:? b}{/}":     errs.ParseElseifAfterElse,
		"{?# a}{:? b}{/}":       errs.ParseElseifNotInIf,
		"a {= b\nc\n":           errs.ParseUnterminatedTag,
		"{= \"}\"} {= 'a}":      errs.ParseUnterminatedString,
		"{* x":                  errs.ParseUnterminatedComment,
		"{true = 1}":            errs.ParseReservedName,
		"{+ notes}":             errs.ParseInvalidPath,
		"{# a.tpl b.tpl}":       errs.ParseInvalidBlockTag,
		"var a = \"{{= x}} ;\n": errs.ParseInvalidWrapper,
	}
	for text, want := range cases {
		if got := codeOf(text); got != want {
			t.Errorf("%q: got %s, want %s", text, got, want)
		}
	}
}

func TestSpansAreBytes(t *testing.T) {
	tree := parse(t, "é{= a}")
	echo := tree.Body[1].(*ast.Echo)
	if echo.Span != (ast.Span{2, 7}) {
		t.Errorf("span %v", echo.Span)
	}
}
