package template_test

import (
	"errors"
	template "github.com/polyspec/template/packages/go"
	"github.com/polyspec/template/packages/go/ast"
	"github.com/polyspec/template/packages/go/errs"
	"github.com/polyspec/template/packages/go/render"
	"github.com/polyspec/template/packages/go/value"
	"reflect"
	"testing"
)

// RT-9, RT-40: public parsed data retains source positions or an absent index.
func TestParsedTemplateSDKData(t *testing.T) {
	source := []byte("x\nz")
	tree, err := template.Parse(source, "a.tpl", template.ParseOptions{})
	if err != nil {
		t.Fatal(err)
	}
	for _, fromAST := range []bool{false, true} {
		loader := template.NewMapLoader(nil)
		if fromAST {
			loader.SetAST("a.tpl", tree)
		} else {
			loader.Set("a.tpl", string(source))
		}
		program, err := template.NewAstProgram(template.Options{Loader: loader})
		if err != nil {
			t.Fatal(err)
		}
		var artifact *render.ParsedTemplate
		artifact, err = program.LoadTemplate("a.tpl", nil, nil)
		if err != nil {
			t.Fatal(err)
		}
		var lines errs.LineIndex
		if !fromAST {
			lines = errs.LineIndex{0, 2}
		}
		if !reflect.DeepEqual(artifact.AST, tree) || !reflect.DeepEqual(artifact.Lines, lines) {
			t.Fatalf("unexpected artifact: %+v", artifact)
		}
		again, err := program.LoadTemplate("a.tpl", nil, nil)
		if err != nil || again != artifact {
			t.Fatalf("cache did not preserve artifact: %v", err)
		}
	}
}

// RT-74, RT-22, RT-35, ERR-2: public render state works without a program.
func TestContextSDKStateAndFailures(t *testing.T) {
	limits := render.DefaultLimits
	limits.OutputBytes = 2
	services, err := render.NewRuntimeEnvironment(&limits, nil)
	if err != nil {
		t.Fatal(err)
	}
	root := value.NewOrderedMap()
	env := template.Env{Timezone: "Z", Now: 123}
	context := render.NewContext(services, root, env, "entry.tpl")
	other := render.NewContext(services, root, env, "other.tpl")
	if context.Services != services || context.RootData != root || context.Env != env || context.EntryName != "entry.tpl" || context.Iterations != 0 {
		t.Fatal("context inputs differ")
	}
	context.Iterations++
	html := "ready"
	context.Registry["layout"] = &render.DefineEntry{HTML: &html}
	if *context.Registry["layout"].HTML != "ready" || len(other.Registry) != 0 || other.Iterations != 0 {
		t.Fatal("context state is not isolated")
	}
	frame := render.NewFrame("part.tpl", errs.LineIndex{0, 2}, root)
	span := ast.Span{2, 3}
	check := func(err error, code errs.Code, name string, line, col, offset, end int) {
		t.Helper()
		var failure *errs.Error
		if !errors.As(err, &failure) || failure.Code != code || failure.Template != name || failure.Line != line || failure.Col != col || failure.Offset != offset || failure.End != end {
			t.Fatalf("unexpected failure: %+v", err)
		}
	}
	check(context.Fail(errs.RuntimeType, nil, nil, "unpositioned"), errs.RuntimeType, "entry.tpl", 0, 0, 0, 0)
	check(context.Fail(errs.RuntimeType, frame, &span, "positioned"), errs.RuntimeType, "part.tpl", 2, 1, 2, 3)
	if err := context.Enter("entry.tpl", nil, nil); err != nil {
		t.Fatal(err)
	}
	if len(context.Chain) != 1 || context.Chain[0] != "entry.tpl" {
		t.Fatal("chain differs")
	}
	check(context.Enter("entry.tpl", frame, &span), errs.LoadCycle, "part.tpl", 2, 1, 2, 3)
	if len(context.Chain) != 1 {
		t.Fatal("failed enter changed chain")
	}
	context.Leave()
	if len(context.Chain) != 0 {
		t.Fatal("leave retained chain")
	}
	if err := context.Write("é", frame, &span); err != nil {
		t.Fatal(err)
	}
	if context.Output() != "é" || other.Output() != "" {
		t.Fatal("output differs")
	}
	check(context.Write("x", frame, &span), errs.RuntimeLimit, "part.tpl", 2, 1, 2, 3)
}
