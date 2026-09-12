package template_test

import (
	"errors"
	"testing"

	template "github.com/polyspec/template"
	"github.com/polyspec/template/errs"
	"github.com/polyspec/template/functions"
)

func TestEngineRender(t *testing.T) {
	loader := template.NewMapLoader(map[string]string{"a.tpl": "<b>{= x}</b>"})
	engine, err := template.NewEngine(template.Options{Loader: loader})
	if err != nil {
		t.Fatal(err)
	}
	out, err := engine.Render("a.tpl", map[string]any{"x": "<"}, template.RenderOptions{})
	if err != nil || out != "<b>&lt;</b>" {
		t.Fatalf("render: %q %v", out, err)
	}
	loader.Set("a.tpl", "2")
	if out, _ := engine.Render("a.tpl", nil, template.RenderOptions{}); out != "2" {
		t.Errorf("cache not refreshed: %q", out)
	}
}

func TestHostFunctions(t *testing.T) {
	engine, err := template.NewEngine(template.Options{Loader: template.NewMapLoader(map[string]string{"a.tpl": "x\n{= twice(2)}"})})
	if err != nil {
		t.Fatal(err)
	}
	if err := engine.Register("twice", func(args []template.Value, _ functions.Context) (any, error) { return args[0].(float64) * 2, nil }); err != nil {
		t.Fatal(err)
	}
	if out, err := engine.Render("a.tpl", nil, template.RenderOptions{}); err != nil || out != "x\n4" {
		t.Errorf("host function: %q %v", out, err)
	}
	if err := engine.Register("upper", nil); err == nil {
		t.Error("built-in name accepted")
	}
	if err := engine.Register("boom", func([]template.Value, functions.Context) (any, error) { return nil, errors.New("no") }); err != nil {
		t.Fatal(err)
	}
	engine2, _ := template.NewEngine(template.Options{Loader: template.NewMapLoader(map[string]string{"b.tpl": "x\n{= boom()}"})})
	_ = engine2.Register("boom", func([]template.Value, functions.Context) (any, error) { return nil, errors.New("no") })
	_, err = engine2.Render("b.tpl", nil, template.RenderOptions{})
	var te *errs.Error
	if !errors.As(err, &te) || te.Code != errs.RuntimeHostFunction || te.Line != 2 {
		t.Errorf("host failure: %v", err)
	}
}

func TestLimits(t *testing.T) {
	limits := template.Limits{Iterations: 5, Depth: 32, OutputBytes: 1 << 20, ExpressionDepth: 64}
	engine, err := template.NewEngine(template.Options{Loader: template.NewMapLoader(map[string]string{"a.tpl": "{@ i = range(1, 10)}{= i}{/}"}), Limits: &limits})
	if err != nil {
		t.Fatal(err)
	}
	_, err = engine.Render("a.tpl", nil, template.RenderOptions{})
	var te *errs.Error
	if !errors.As(err, &te) || te.Code != errs.RuntimeLimit {
		t.Errorf("limit: %v", err)
	}
}
