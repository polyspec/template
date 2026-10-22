package template_test

import (
	"testing"

	template "github.com/polyspec/template/packages/go"
)

// TestRequestPathRendersALoadedArtifactTheSameWay checks RT-59: rendering a loaded artifact parses nothing and discovers no
// source (the artifact directory holds no .tpl file), and two renders with the same assign give identical bytes and leave
// the assign unchanged.
func TestRequestPathRendersALoadedArtifactTheSameWay(t *testing.T) {
	program, err := template.LoadArtifact("../../tests/fixtures/artifact-runtime/artifact")
	if err != nil {
		t.Fatal(err)
	}
	assign := map[string]any{"x": "a<b"}
	first, err := program.Render("page.tpl", assign, template.RenderOptions{})
	if err != nil {
		t.Fatal(err)
	}
	second, err := program.Render("page.tpl", assign, template.RenderOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if first != second || first != "<p>a&lt;b</p>" {
		t.Fatalf("renders differ: %q %q", first, second)
	}
	if len(assign) != 1 || assign["x"] != "a<b" {
		t.Fatalf("the render changed the assign: %v", assign)
	}
}
