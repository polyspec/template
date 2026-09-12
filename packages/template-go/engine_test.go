package template_test

import (
	"errors"
	"testing"

	template "github.com/polyspec/template"
	"github.com/polyspec/template/errs"
	"github.com/polyspec/template/functions"
	"github.com/polyspec/template/render"
)

func TestEngineRender(t *testing.T) {
	loader := template.NewMapLoader(map[string]string{"a.tpl": "<b>{= x}</b>"})
	program, err := template.NewAstProgram(template.Options{Loader: loader})
	if err != nil {
		t.Fatal(err)
	}
	engine := template.NewEngine(program)
	out, err := engine.Render("a.tpl", map[string]any{"x": "<"}, template.RenderOptions{})
	if err != nil || out != "<b>&lt;</b>" {
		t.Fatalf("render: %q %v", out, err)
	}
	loader.Set("a.tpl", "2")
	if out, _ := engine.Render("a.tpl", nil, template.RenderOptions{}); out != "2" {
		t.Errorf("cache not refreshed: %q", out)
	}
}

func TestArtifactRefreshPolicies(t *testing.T) {
	devLoader := template.NewMapLoader(map[string]string{"a.tpl": "1"})
	devProgram, err := template.NewAstProgram(template.Options{Loader: devLoader, ArtifactRefresh: render.ArtifactRefreshDev})
	if err != nil {
		t.Fatal(err)
	}
	dev := template.NewEngine(devProgram)
	if out, _ := dev.Render("a.tpl", nil, template.RenderOptions{}); out != "1" {
		t.Fatalf("dev initial: %q", out)
	}
	devLoader.Set("a.tpl", "2")
	if out, _ := dev.Render("a.tpl", nil, template.RenderOptions{}); out != "2" {
		t.Fatalf("dev refresh: %q", out)
	}

	immutableLoader := template.NewMapLoader(map[string]string{"a.tpl": "1"})
	immutableProgram, err := template.NewAstProgram(template.Options{Loader: immutableLoader, ArtifactRefresh: render.ArtifactRefreshFalse})
	if err != nil {
		t.Fatal(err)
	}
	immutable := template.NewEngine(immutableProgram)
	if out, _ := immutable.Render("a.tpl", nil, template.RenderOptions{}); out != "1" {
		t.Fatalf("immutable initial: %q", out)
	}
	immutableLoader.Set("a.tpl", "2")
	if out, _ := immutable.Render("a.tpl", nil, template.RenderOptions{}); out != "1" {
		t.Fatalf("immutable changed: %q", out)
	}
}

func TestHostFunctions(t *testing.T) {
	program, err := template.NewAstProgram(template.Options{Loader: template.NewMapLoader(map[string]string{"a.tpl": "x\n{= twice(2)}"})})
	if err != nil {
		t.Fatal(err)
	}
	engine := template.NewEngine(program)
	if err := program.Register("twice", func(args []template.Value, _ functions.Context) (any, error) { return args[0].(float64) * 2, nil }); err != nil {
		t.Fatal(err)
	}
	if out, err := engine.Render("a.tpl", nil, template.RenderOptions{}); err != nil || out != "x\n4" {
		t.Errorf("host function: %q %v", out, err)
	}
	if err := program.Register("upper", nil); err == nil {
		t.Error("built-in name accepted")
	}
	if err := program.Register("boom", func([]template.Value, functions.Context) (any, error) { return nil, errors.New("no") }); err != nil {
		t.Fatal(err)
	}
	program2, _ := template.NewAstProgram(template.Options{Loader: template.NewMapLoader(map[string]string{"b.tpl": "x\n{= boom()}"})})
	engine2 := template.NewEngine(program2)
	_ = program2.Register("boom", func([]template.Value, functions.Context) (any, error) { return nil, errors.New("no") })
	_, err = engine2.Render("b.tpl", nil, template.RenderOptions{})
	var te *errs.Error
	if !errors.As(err, &te) || te.Code != errs.RuntimeHostFunction || te.Line != 2 {
		t.Errorf("host failure: %v", err)
	}
}

func TestLimits(t *testing.T) {
	limits := template.Limits{Iterations: 5, Depth: 32, OutputBytes: 1 << 20, ExpressionDepth: 64}
	program, err := template.NewAstProgram(template.Options{Loader: template.NewMapLoader(map[string]string{"a.tpl": "{@ i = range(1, 10)}{= i}{/}"}), Limits: &limits})
	if err != nil {
		t.Fatal(err)
	}
	engine := template.NewEngine(program)
	_, err = engine.Render("a.tpl", nil, template.RenderOptions{})
	var te *errs.Error
	if !errors.As(err, &te) || te.Code != errs.RuntimeLimit {
		t.Errorf("limit: %v", err)
	}
}
