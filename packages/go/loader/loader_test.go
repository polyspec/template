package loader_test

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"testing/fstest"

	template "github.com/polyspec/template/packages/go"
	"github.com/polyspec/template/packages/go/ast"
	"github.com/polyspec/template/packages/go/errs"
	"github.com/polyspec/template/packages/go/loader"
)

// RT-8: a path resolves against the directory of the current template, a leading / against the root, and a path that
// leaves the root fails with E_LOAD_OUTSIDE_ROOT.
func TestResolvePath(t *testing.T) {
	cases := []struct{ current, path, want string }{
		{"a/b.tpl", "c.tpl", "a/c.tpl"},
		{"a/b.tpl", "../c.tpl", "c.tpl"},
		{"a/b.tpl", "/x/y.tpl", "x/y.tpl"},
		{"b.tpl", "./c.tpl", "c.tpl"},
	}
	for _, c := range cases {
		got, err := loader.ResolvePath(c.current, c.path)
		if err != nil || got != c.want {
			t.Errorf("ResolvePath(%q, %q) = %q, %v", c.current, c.path, got, err)
		}
	}
	if _, err := loader.ResolvePath("a.tpl", "../x.tpl"); !errors.Is(err, loader.ErrOutsideRoot) {
		t.Errorf("outside root: %v", err)
	}
	program, err := template.NewAstProgram(template.Options{Loader: template.NewMapLoader(map[string]string{"o.tpl": "{+ ../z.tpl}"})})
	if err != nil {
		t.Fatal(err)
	}
	_, err = template.NewEngine(program).Render("o.tpl", nil, template.RenderOptions{})
	var failure *errs.Error
	if !errors.As(err, &failure) || failure.Code != errs.LoadOutsideRoot {
		t.Errorf("include outside the root: %v", err)
	}
}

// TestMapLoader: a map loader returns the source of a name that it holds with a version, and no
// template for another name (RT-10).
// RT-9, RT-10: a map loader returns a held source with its version, and nothing for another name.
func TestMapLoader(t *testing.T) {
	m := loader.NewMapLoader(map[string]string{"a.tpl": "x"})
	if r, ok, err := m.Load("a.tpl"); !ok || err != nil || string(r.Source) != "x" || r.Version == "" {
		t.Error("map loader")
	}
	if _, ok, err := m.Load("b.tpl"); ok || err != nil {
		t.Error("missing name found")
	}
}

// TestFSLoader: the filesystem loader reads root/name and loads no path that leaves the root and no
// directory (RT-10).
func TestFSLoader(t *testing.T) {
	fs := loader.NewFSLoader(fstest.MapFS{"d/a.tpl": {Data: []byte("y")}})
	if r, ok, err := fs.Load("d/a.tpl"); !ok || err != nil || string(r.Source) != "y" {
		t.Error("fs loader")
	}
	if _, ok, err := fs.Load("../a.tpl"); ok || err != nil {
		t.Error("invalid path loaded")
	}
	if _, ok, err := fs.Load("d"); ok || err != nil {
		t.Error("directory loaded")
	}
}

// TestFSLoaderKeepsNoFileOpen: a filesystem loader that read many templates holds no descriptor of
// them, which the open descriptors of the process in /dev/fd show (T23.5).
// RT-75: the filesystem loader closes each file that it reads before load returns, so no file stays open.
func TestFSLoaderKeepsNoFileOpen(t *testing.T) {
	root := t.TempDir()
	const templates = 64
	for index := range templates {
		if err := os.WriteFile(filepath.Join(root, fmt.Sprintf("t%d.tpl", index)), []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	descriptors := func() int {
		entries, err := os.ReadDir("/dev/fd")
		if err != nil {
			t.Fatal(err)
		}
		return len(entries)
	}
	fs := loader.NewFSLoader(os.DirFS(root))
	before := descriptors()
	for index := range templates {
		if _, ok, err := fs.Load(fmt.Sprintf("t%d.tpl", index)); !ok || err != nil {
			t.Fatalf("t%d.tpl: %v %v", index, ok, err)
		}
	}
	if after := descriptors(); after > before {
		t.Fatalf("the loader holds %d descriptors after %d loads", after-before, templates)
	}
}

// RT-10, RT-40: versions follow AST contents rather than the template name.
func TestMapLoaderASTContentVersions(t *testing.T) {
	if reflect.TypeFor[template.LoadResult]() != reflect.TypeFor[loader.Result]() || reflect.TypeFor[template.Loader]() != reflect.TypeFor[loader.Loader]() {
		t.Fatal("root loader types differ from their native definitions")
	}
	for _, newLoader := range []func(map[string]string) *loader.MapLoader{template.NewMapLoader, loader.NewMapLoader} {
		if result, ok, err := newLoader(map[string]string{"native.tpl": "value"}).Load("native.tpl"); err != nil || !ok || string(result.Source) != "value" {
			t.Fatal("root/native constructors differ")
		}
	}

	m := loader.NewMapLoader(nil)
	program, err := template.NewAstProgram(template.Options{Loader: m})
	if err != nil {
		t.Fatal(err)
	}
	engine := template.NewEngine(program)
	versions := make([]string, 0, 3)
	for _, text := range []string{"first", "second", "second"} {
		tree := &ast.Template{Type: "Template", Body: []ast.Node{&ast.Text{Type: "Text", Value: text, Span: ast.Span{0, len(text)}}}}
		m.SetAST("a.tpl", tree)
		result, ok, err := m.Load("a.tpl")
		if err != nil || !ok || result.AST != tree || result.Source != nil || result.Version == "" {
			t.Fatalf("AST result differs: %+v %v", result, err)
		}
		versions = append(versions, result.Version)
		if rendered, err := engine.Render("a.tpl", map[string]any{}, template.RenderOptions{}); err != nil || rendered != text {
			t.Fatalf("AST replacement rendered %q, want %q: %v", rendered, text, err)
		}
	}
	if versions[0] == versions[1] || versions[1] != versions[2] {
		t.Fatalf("versions must follow content: %v", versions)
	}
}
