package template_test

import (
	"testing"

	template "github.com/polyspec/template/packages/go"
	"github.com/polyspec/template/packages/go/value"
)

// RT-72: the public entry points of the API resolve through the exported names of the package.
// TestExportedEntryPoints checks RT-1: the entry points of the API, which the implementation declares, are exported.
func TestExportedEntryPoints(t *testing.T) {
	functions := map[string]any{
		"Parse":                 template.Parse,
		"NewEngine":             template.NewEngine,
		"NewAstProgram":         template.NewAstProgram,
		"NewMapLoader":          template.NewMapLoader,
		"Bind":                  template.Bind,
		"Merge":                 template.Merge,
		"ParseJSON":             template.ParseJSON,
		"NewRuntimeEnvironment": template.NewRuntimeEnvironment,
	}
	for name, function := range functions {
		if function == nil {
			t.Errorf("template.%s resolves to nil", name)
		}
	}
	var (
		_ template.Program
		_ *template.Engine
		_ *template.AstProgram
		_ template.Prepared
		_ template.BoundMap
		_ *template.Error
		_ template.Loader
		_ *template.RuntimeEnvironment
	)
}

// RT-74: the root package and its subpackages share one runtime. The bound map type of the root is the type of the value
// package, so a bound map that one creates is the bound map of the other, and the program of the root renders it.
func TestEntryPointsShareOneRuntime(t *testing.T) {
	fromValue, err := value.Bind(map[string]any{"a": "x", "list": []any{1.0, 2.0}})
	if err != nil {
		t.Fatal(err)
	}
	fromRoot, err := template.Bind(map[string]any{"b": 1.0})
	if err != nil {
		t.Fatal(err)
	}
	// The aliases make the types one: each bound map is accepted where the other package names its type.
	acceptsRoot, acceptsValue := func(template.BoundMap) {}, func(value.BoundMap) {}
	acceptsRoot(fromValue)
	acceptsValue(fromRoot)
	program, err := template.NewAstProgram(template.Options{Loader: template.NewMapLoader(map[string]string{"page.tpl": "{= a}{@ x = list}{= x}{/}"})})
	if err != nil {
		t.Fatal(err)
	}
	engine := template.NewEngine(program)
	for name, assign := range map[string]template.BoundMap{"value.Bind": fromValue, "merged by template.Merge": template.Merge(fromValue, fromRoot), "merged by value.Merge": value.Merge(fromRoot, fromValue)} {
		output, err := engine.Render("page.tpl", assign, template.RenderOptions{})
		if err != nil || output != "x12" {
			t.Errorf("%s: %q %v", name, output, err)
		}
	}
}
