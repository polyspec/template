package template_test

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestLevelAbsence checks RT-55: the Go package exports no generated-program type and no source-compiler operation. The
// generated programs of the Go target come from the build compiler, so the package keeps none of these names.
func TestLevelAbsence(t *testing.T) {
	forbidden := map[string]bool{"GeneratedProgram": true, "EncodeArtifact": true, "EmitArtifact": true}
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}
	fset := token.NewFileSet()
	for _, name := range files {
		if strings.HasSuffix(name, "_test.go") {
			continue
		}
		src, err := os.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		file, err := parser.ParseFile(fset, name, src, parser.SkipObjectResolution)
		if err != nil {
			t.Fatal(err)
		}
		for _, decl := range file.Decls {
			var names []*ast.Ident
			switch d := decl.(type) {
			case *ast.FuncDecl:
				if d.Recv == nil {
					names = append(names, d.Name)
				}
			case *ast.GenDecl:
				for _, spec := range d.Specs {
					switch s := spec.(type) {
					case *ast.TypeSpec:
						names = append(names, s.Name)
					case *ast.ValueSpec:
						names = append(names, s.Names...)
					}
				}
			}
			for _, id := range names {
				if id.IsExported() && forbidden[id.Name] {
					t.Errorf("%s exports %s, which RT-55 forbids at this level", name, id.Name)
				}
			}
		}
	}
}
