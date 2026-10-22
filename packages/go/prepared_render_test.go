package template_test

import (
	"testing"

	template "github.com/polyspec/template/packages/go"
)

// TestPreparedRenderIsTheSingleCallRender checks RT-62: a prepared render renders identical bytes on every call, and Render
// is Prepare(...).Render().
func TestPreparedRenderIsTheSingleCallRender(t *testing.T) {
	program, err := template.LoadArtifact("../../tests/fixtures/artifact-runtime/artifact")
	if err != nil {
		t.Fatal(err)
	}
	engine := template.NewEngine(program)
	assign := map[string]any{"x": "a<b"}
	prepared, err := engine.Prepare("page.tpl", assign, template.RenderOptions{})
	if err != nil {
		t.Fatal(err)
	}
	first, err := prepared.Render()
	if err != nil {
		t.Fatal(err)
	}
	second, err := prepared.Render()
	if err != nil || second != first {
		t.Fatalf("prepared renders differ: %q %q %v", first, second, err)
	}
	single, err := engine.Render("page.tpl", assign, template.RenderOptions{})
	if err != nil || single != first {
		t.Fatalf("render %q is not prepare(...).render() %q: %v", single, first, err)
	}
}
