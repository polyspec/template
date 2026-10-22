package template_test

import (
	"testing"

	template "github.com/polyspec/template/packages/go"
)

// TestLoadArtifactRendersTheSourceBytes checks RT-56: the artifact that the build compiler wrote loads through LoadArtifact
// and renders with the bytes of its source. The fixture is the output of compileAst of tests/fixtures/artifact-runtime.
func TestLoadArtifactRendersTheSourceBytes(t *testing.T) {
	program, err := template.LoadArtifact("../../tests/fixtures/artifact-runtime/artifact")
	if err != nil {
		t.Fatal(err)
	}
	out, err := program.Render("page.tpl", map[string]any{"x": "a<b"}, template.RenderOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if out != "<p>a&lt;b</p>" {
		t.Fatalf("got %q", out)
	}
}
