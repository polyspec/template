package ast_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
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

// TestDecodeTemplateNamesTheInvalidNode: every invalid AST of the shared fixture fails with an *ast.DecodeError whose
// Path is the JSON Pointer of its invalid node, which the message names (AST-10).
func TestDecodeTemplateNamesTheInvalidNode(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(casetest.Dir(t), "..", "fixtures", "ast-decode", "invalid.json"))
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Cases []struct {
			Name string          `json:"name"`
			AST  json.RawMessage `json:"ast"`
			Path string          `json:"path"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	if len(fixture.Cases) == 0 {
		t.Fatal("invalid.json has no case")
	}
	for _, testCase := range fixture.Cases {
		_, err := ast.DecodeTemplate(testCase.AST)
		var decodeError *ast.DecodeError
		if !errors.As(err, &decodeError) {
			t.Errorf("%s: the error is %v, not an *ast.DecodeError", testCase.Name, err)
			continue
		}
		if decodeError.Path != testCase.Path {
			t.Errorf("%s: the path is %q, not %q: %v", testCase.Name, decodeError.Path, testCase.Path, err)
		}
		shown := testCase.Path
		if shown == "" {
			shown = "the root"
		}
		if !strings.Contains(err.Error(), shown) {
			t.Errorf("%s: the message names no %s: %v", testCase.Name, shown, err)
		}
	}
}

// TestDecodeTemplateFailsOnTextThatIsNotJSON: text that is not JSON fails with the error of reading JSON, not with a
// *DecodeError, which names a node.
func TestDecodeTemplateFailsOnTextThatIsNotJSON(t *testing.T) {
	_, err := ast.DecodeTemplate([]byte("{"))
	var decodeError *ast.DecodeError
	if err == nil || errors.As(err, &decodeError) {
		t.Fatalf("the error is %v, not the error of reading JSON", err)
	}
}

// TestTheEmbeddedSchemaIsTheContractSchema: the schema that the package embeds, ast/ast.schema.json, is
// contracts/schema/ast.schema.json byte for byte.
func TestTheEmbeddedSchemaIsTheContractSchema(t *testing.T) {
	root := filepath.Join(casetest.Dir(t), "..", "..")
	embedded, err := os.ReadFile(filepath.Join(root, "packages", "go", "ast", "ast.schema.json"))
	if err != nil {
		t.Fatal(err)
	}
	contract, err := os.ReadFile(filepath.Join(root, "contracts", "schema", "ast.schema.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(embedded, contract) {
		t.Fatal("packages/go/ast/ast.schema.json differs from contracts/schema/ast.schema.json: copy the contract schema to it")
	}
}
