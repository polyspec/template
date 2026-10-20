package template_test

import (
	"testing"

	template "github.com/polyspec/template/packages/go"
)

// RT-72: the public entry points of the API resolve through the exported names of the package.
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
