// Compiler runtime interface declaration checks.
package template_test

import (
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"testing"
)

type runtimeManifest struct {
	RuntimeContract struct {
		Program struct {
			Operations []struct {
				Name       string   `json:"name"`
				Parameters []string `json:"parameters"`
			} `json:"operations"`
		} `json:"Program"`
		Engine struct {
			Owns       []string `json:"owns"`
			Operations []string `json:"operations"`
		} `json:"Engine"`
		RuntimeBindings struct {
			Operations []struct {
				Name       string   `json:"name"`
				Parameters []string `json:"parameters"`
			} `json:"operations"`
		} `json:"RuntimeBindings"`
		RuntimeServices struct {
			Operations []struct {
				Name       string   `json:"name"`
				Parameters []string `json:"parameters"`
			} `json:"operations"`
		} `json:"RuntimeServices"`
	} `json:"runtimeContract"`
}

// TestCompilerRuntimeInterface compares Go declarations with the common manifest through go/ast.
func TestCompilerRuntimeInterface(t *testing.T) {
	manifestPath := os.Getenv("TEMPLATE_INTERFACE_MANIFEST")
	if manifestPath == "" {
		manifestPath = "../../tools/compiler/interface.json"
	}
	manifestBytes, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatal(err)
	}
	var manifest runtimeManifest
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		t.Fatal(err)
	}
	file, err := parser.ParseFile(token.NewFileSet(), "engine.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	types := map[string]*ast.TypeSpec{}
	methods := map[string][]*ast.FuncDecl{}
	for _, declaration := range file.Decls {
		switch node := declaration.(type) {
		case *ast.GenDecl:
			for _, spec := range node.Specs {
				if named, ok := spec.(*ast.TypeSpec); ok {
					types[named.Name.Name] = named
				}
			}
		case *ast.FuncDecl:
			if node.Recv != nil {
				receiver := receiverName(node.Recv.List[0].Type)
				methods[receiver] = append(methods[receiver], node)
			}
		}
	}
	program, ok := types["Program"].Type.(*ast.InterfaceType)
	if !ok {
		t.Fatal("Program is not an interface")
	}
	if len(program.Methods.List) != len(manifest.RuntimeContract.Program.Operations) {
		t.Fatal("Program operation count differs")
	}
	for index, operation := range manifest.RuntimeContract.Program.Operations {
		field := program.Methods.List[index]
		function, ok := field.Type.(*ast.FuncType)
		if !ok || len(field.Names) != 1 || field.Names[0].Name != exported(operation.Name) || fieldCount(function.Params) != len(operation.Parameters) {
			t.Fatalf("Program.%s signature differs", operation.Name)
		}
	}
	engine, ok := types["Engine"].Type.(*ast.StructType)
	if !ok || len(engine.Fields.List) != 1 || len(engine.Fields.List[0].Names) != 1 || engine.Fields.List[0].Names[0].Name != manifest.RuntimeContract.Engine.Owns[0] {
		t.Fatal("Engine ownership differs")
	}
	actualMethods := methods["Engine"]
	if len(actualMethods) != len(manifest.RuntimeContract.Engine.Operations) {
		t.Fatal("Engine operation count differs")
	}
	for index, name := range manifest.RuntimeContract.Engine.Operations {
		if actualMethods[index].Name.Name != exported(name) {
			t.Fatalf("Engine operation %d differs", index)
		}
	}
	if _, ok := types["AstProgram"].Type.(*ast.StructType); !ok {
		t.Fatal("AstProgram is not a concrete struct")
	}
	bindingsFile, err := parser.ParseFile(token.NewFileSet(), "render/runtime_bindings.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	var bindingMethods []*ast.FuncDecl
	for _, declaration := range bindingsFile.Decls {
		function, ok := declaration.(*ast.FuncDecl)
		if ok && function.Recv != nil && receiverName(function.Recv.List[0].Type) == "RuntimeBindings" {
			bindingMethods = append(bindingMethods, function)
		}
	}
	if len(bindingMethods) == 0 || bindingMethods[0].Name.Name != "Truthy" {
		t.Fatal("RuntimeBindings declaration is missing")
	}
	for index, operation := range manifest.RuntimeContract.RuntimeBindings.Operations {
		if index >= len(bindingMethods) || bindingMethods[index].Name.Name != exported(operation.Name) {
			t.Fatalf("RuntimeBindings.%s differs", operation.Name)
		}
		if fieldCount(bindingMethods[index].Type.Params) != len(operation.Parameters) {
			t.Fatalf("RuntimeBindings.%s signature differs", operation.Name)
		}
	}
	if len(bindingMethods) != len(manifest.RuntimeContract.RuntimeBindings.Operations) {
		t.Fatal("RuntimeBindings operation count differs")
	}
	contextFile, err := parser.ParseFile(token.NewFileSet(), "render/context.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	var services *ast.InterfaceType
	for _, declaration := range contextFile.Decls {
		general, ok := declaration.(*ast.GenDecl)
		if !ok {
			continue
		}
		for _, spec := range general.Specs {
			named, ok := spec.(*ast.TypeSpec)
			if ok && named.Name.Name == "RuntimeServices" {
				services, _ = named.Type.(*ast.InterfaceType)
			}
		}
	}
	if services == nil || len(services.Methods.List) != len(manifest.RuntimeContract.RuntimeServices.Operations) {
		t.Fatal("RuntimeServices declaration differs")
	}
	for index, operation := range manifest.RuntimeContract.RuntimeServices.Operations {
		field := services.Methods.List[index]
		function, ok := field.Type.(*ast.FuncType)
		if !ok || len(field.Names) != 1 || field.Names[0].Name != exported(operation.Name) || fieldCount(function.Params) != len(operation.Parameters) {
			t.Fatalf("RuntimeServices.%s signature differs", operation.Name)
		}
	}
}

func receiverName(expression ast.Expr) string {
	if pointer, ok := expression.(*ast.StarExpr); ok {
		expression = pointer.X
	}
	return expression.(*ast.Ident).Name
}

func fieldCount(fields *ast.FieldList) int {
	count := 0
	for _, field := range fields.List {
		if len(field.Names) == 0 {
			count++
		} else {
			count += len(field.Names)
		}
	}
	return count
}

func exported(name string) string { return string(name[0]-'a'+'A') + name[1:] }
