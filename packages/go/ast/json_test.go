package ast_test

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	template "github.com/polyspec/template/packages/go"
	"github.com/polyspec/template/packages/go/ast"
	"github.com/polyspec/template/packages/go/internal/casetest"
	"github.com/polyspec/template/packages/go/loader"
)

// TestDecodeTemplateReadsTheCanonicalAST: DecodeTemplate reads the expected.ast.json of every conformance case that
// has one into the Go AST, whose JSON is that file again (AST-8).
func TestDecodeTemplateReadsTheCanonicalAST(t *testing.T) {
	count := 0
	for _, testCase := range casetest.List(t) {
		data, err := os.ReadFile(filepath.Join(testCase.Dir, "expected.ast.json"))
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			t.Fatal(err)
		}
		decoded, err := ast.DecodeTemplate(data)
		if err != nil {
			t.Fatalf("%s: %v", testCase.ID, err)
		}
		encoded, err := json.Marshal(decoded)
		if err != nil {
			t.Fatalf("%s: %v", testCase.ID, err)
		}
		var expected, actual any
		if err := json.Unmarshal(data, &expected); err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(encoded, &actual); err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(actual, expected) {
			t.Errorf("%s: the decoded AST encodes as %s", testCase.ID, encoded)
		}
		count++
	}
	if count == 0 {
		t.Fatal("no case has an expected.ast.json")
	}
}

// TestADecodedTemplateRendersWithoutItsSource: a program renders the AST that a loader holds, read from its canonical
// JSON, without parsing a source (RT-40).
func TestADecodedTemplateRendersWithoutItsSource(t *testing.T) {
	decoded, err := ast.DecodeTemplate([]byte(`{"type":"Template","name":"x.tpl","body":[{"type":"Echo","expr":{"type":"Binary","op":"+","left":{"type":"Var","name":"a","span":[3,4]},"right":{"type":"Literal","kind":"number","value":1,"span":[7,8]},"span":[3,8]},"span":[0,9]}],"comments":[]}`))
	if err != nil {
		t.Fatal(err)
	}
	asts := loader.NewMapLoader(nil)
	asts.SetAST("x.tpl", decoded)
	program, err := template.NewAstProgram(template.Options{Loader: asts})
	if err != nil {
		t.Fatal(err)
	}
	if out, err := program.Render("x.tpl", map[string]any{"a": 2.0}, template.RenderOptions{}); err != nil || out != "3" {
		t.Fatalf("render: %q %v", out, err)
	}
}
