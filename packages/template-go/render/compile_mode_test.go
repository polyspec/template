package render

import (
	"testing"
)

func TestGeneratedModeRequiresRenderer(t *testing.T) {
	e, err := NewEngine(Options{Compile: CompileOptions{Mode: CompileModeGen}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.Render("ignored", nil, RenderOptions{}); err == nil {
		t.Fatal("expected missing generated renderer error")
	}
}

func TestGeneratedModeCallsRendererWithoutLoadingAST(t *testing.T) {
	e, err := NewEngine(Options{Compile: CompileOptions{Mode: CompileModeGen, Generated: func(request GeneratedRequest) (*GeneratedPreparedRender, error) {
		return &GeneratedPreparedRender{Render: func() (string, error) { return "generated", nil }}, nil
	}}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	got, err := e.Render("ignored", nil, RenderOptions{})
	if err != nil || got != "generated" {
		t.Fatalf("got %q, %v", got, err)
	}
}
