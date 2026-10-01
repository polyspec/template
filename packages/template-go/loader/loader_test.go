package loader_test

import (
	"errors"
	"testing"
	"testing/fstest"

	"github.com/polyspec/template/loader"
)

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
}

func TestLoaders(t *testing.T) {
	m := loader.NewMapLoader(map[string]string{"a.tpl": "x"})
	if r, ok, err := m.Load("a.tpl"); !ok || err != nil || string(r.Source) != "x" || r.Version == "" {
		t.Error("map loader")
	}
	if _, ok, err := m.Load("b.tpl"); ok || err != nil {
		t.Error("missing name found")
	}
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
