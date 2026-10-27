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

// TestADecodedTemplateRendersWithoutItsSource: the decode of the canonical JSON is the AST that Parse returns (AST-10),
// and a program renders that AST, held by a loader, without parsing a source (RT-41).
func TestADecodedTemplateRendersWithoutItsSource(t *testing.T) {
	decoded, err := ast.DecodeTemplate([]byte(`{"type":"Template","name":"x.tpl","body":[{"type":"Echo","expr":{"type":"Binary","op":"+","left":{"type":"Var","name":"a","span":[3,4]},"right":{"type":"Literal","kind":"number","value":1,"span":[7,8]},"span":[3,8]},"span":[0,9]}],"comments":[]}`))
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := template.Parse([]byte("{= a + 1}"), "x.tpl", template.ParseOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(decoded, parsed) {
		t.Fatalf("decode: %#v, parse: %#v", decoded, parsed)
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

// TestDecodeReadsTheEmbeddedSchemaOutsideTheRepository (RT-73): the schema is embedded in the package (`embed`), so
// DecodeTemplate validates from a working directory that holds no file of the repository.
func TestDecodeReadsTheEmbeddedSchemaOutsideTheRepository(t *testing.T) {
	t.Chdir(t.TempDir())
	decoded, err := ast.DecodeTemplate([]byte(`{"type":"Template","name":"x.tpl","body":[],"comments":[]}`))
	if err != nil || decoded.Name != "x.tpl" {
		t.Fatalf("a valid AST: %v %v", decoded, err)
	}
	_, err = ast.DecodeTemplate([]byte(`{"type":"Template","name":"x.tpl","body":[],"comments":1}`))
	var failure *ast.DecodeError
	if !errors.As(err, &failure) || failure.Path != "/comments" {
		t.Fatalf("an invalid AST: %v", err)
	}
}

// AST-10: class-call data decodes without registering the class to render it.
func TestPublicDecoderPreservesClassCallASTFields(t *testing.T) {
	assertPublicDecoderRoundTrip(t, "class-call.json")
}

// AST-4, AST-10: every operator and loop metadata literal retains its canonical value.
func TestPublicDecoderPreservesCanonicalEnumLiterals(t *testing.T) {
	assertPublicDecoderRoundTrip(t, "enum-literals.json")
}

func assertPublicDecoderRoundTrip(t *testing.T, fixture string) {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(casetest.Dir(t), "..", "fixtures", "ast-decode", fixture))
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := ast.DecodeTemplate(data)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(decoded)
	if err != nil {
		t.Fatal(err)
	}
	var expected, actual any
	if err := json.Unmarshal(data, &expected); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(encoded, &actual); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(actual, expected) {
		t.Fatalf("AST changed: %s", encoded)
	}
}

// AST-10: the public native data fields have the canonical serialization keys.
func TestPublicASTFieldsMatchTheSchema(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(casetest.Dir(t), "..", "..", "contracts", "schema", "ast.schema.json"))
	if err != nil {
		t.Fatal(err)
	}
	var schema struct {
		Definitions map[string]struct{ Properties map[string]json.RawMessage }
	}
	if err := json.Unmarshal(data, &schema); err != nil {
		t.Fatal(err)
	}
	declaration, err := os.ReadFile(filepath.Join(casetest.Dir(t), "..", "..", "config", "parity.json"))
	if err != nil {
		t.Fatal(err)
	}
	var parity struct {
		Units []struct {
			ID      string
			Symbols []struct{ Implementation, Symbol string }
		}
	}
	if err := json.Unmarshal(declaration, &parity); err != nil {
		t.Fatal(err)
	}
	symbols := map[string]string{}
	for _, unit := range parity.Units {
		for _, entry := range unit.Symbols {
			if entry.Implementation == "go" {
				symbols[unit.ID] = entry.Symbol
			}
		}
	}
	types := map[string]reflect.Type{
		"Template":   reflect.TypeOf(ast.Template{}),
		"Comment":    reflect.TypeOf(ast.Comment{}),
		"Text":       reflect.TypeOf(ast.Text{}),
		"Echo":       reflect.TypeOf(ast.Echo{}),
		"IfBranch":   reflect.TypeOf(ast.IfBranch{}),
		"If":         reflect.TypeOf(ast.If{}),
		"For":        reflect.TypeOf(ast.For{}),
		"Set":        reflect.TypeOf(ast.Set{}),
		"Include":    reflect.TypeOf(ast.Include{}),
		"ScopeItem":  reflect.TypeOf(ast.ScopeItem{}),
		"Block":      reflect.TypeOf(ast.Block{}),
		"IfBlock":    reflect.TypeOf(ast.IfBlock{}),
		"Literal":    reflect.TypeOf(ast.Literal{}),
		"Var":        reflect.TypeOf(ast.Var{}),
		"LoopMeta":   reflect.TypeOf(ast.LoopMeta{}),
		"Member":     reflect.TypeOf(ast.Member{}),
		"Index":      reflect.TypeOf(ast.Index{}),
		"MemberCall": reflect.TypeOf(ast.MemberCall{}),
		"ClassCall":  reflect.TypeOf(ast.ClassCall{}),
		"Call":       reflect.TypeOf(ast.Call{}),
		"Unary":      reflect.TypeOf(ast.Unary{}),
		"Binary":     reflect.TypeOf(ast.Binary{}),
		"Ternary":    reflect.TypeOf(ast.Ternary{}),
		"Spread":     reflect.TypeOf(ast.Spread{}),
		"List":       reflect.TypeOf(ast.List{}),
		"MapEntry":   reflect.TypeOf(ast.MapEntry{}),
		"Map":        reflect.TypeOf(ast.Map{}),
	}
	for name, native := range types {
		t.Run(name, func(t *testing.T) {
			fields := map[string]bool{}
			for i := 0; i < native.NumField(); i++ {
				field := native.Field(i)
				if !field.IsExported() {
					t.Fatalf("%s is not public", field.Name)
				}
				key := strings.Split(field.Tag.Get("json"), ",")[0]
				if _, ok := schema.Definitions[name].Properties[key]; !ok {
					t.Fatalf("undeclared field %s", key)
				}
				id := "api-ast-shape-" + strings.ToLower(name) + "-" + strings.ToLower(key)
				want := "github.com/polyspec/template/packages/go/ast." + name + "." + field.Name
				if symbols[id] != want {
					t.Fatalf("%s: native field is %s, declared %s", id, want, symbols[id])
				}
				fields[key] = true
			}
			if len(fields) != len(schema.Definitions[name].Properties) {
				t.Fatalf("%s: schema fields are missing", name)
			}
		})
	}
}

// AST-10: public schema errors retain the supplied pointer and reason.
func TestPublicDecodeErrorPointerAndReason(t *testing.T) {
	for _, path := range []string{"", "/body/0/expr/value~1key"} {
		failure := &ast.DecodeError{Path: path, Reason: "expected scalar"}
		var err error = failure
		if failure.Path != path || failure.Reason != "expected scalar" || !strings.Contains(err.Error(), "expected scalar") {
			t.Fatalf("error data differs: %+v", failure)
		}
		shown := path
		if shown == "" {
			shown = "the root"
		}
		if !strings.Contains(err.Error(), shown) {
			t.Fatalf("error omits pointer: %v", err)
		}
	}
}
