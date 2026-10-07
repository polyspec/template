// Compiler runtime interface declaration checks.
package template_test

import (
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"strings"
	"testing"
)

type runtimeManifest struct {
	Languages struct {
		Go struct {
			FrameFields                  []string `json:"frameFields"`
			ScopeFields                  []string `json:"scopeFields"`
			ScopeOperations              []string `json:"scopeOperations"`
			RuntimeEnvironmentFields     []string `json:"runtimeEnvironmentFields"`
			RuntimeEnvironmentOperations []string `json:"runtimeEnvironmentOperations"`
		} `json:"go"`
	} `json:"languages"`
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
		RuntimeEnvironment struct {
			Fields     []string `json:"fields"`
			Operations []struct {
				Name       string   `json:"name"`
				Parameters []string `json:"parameters"`
			} `json:"operations"`
		} `json:"RuntimeEnvironment"`
	} `json:"runtimeContract"`
}

// TestCompilerRuntimeInterface compares Go declarations with the common manifest through go/ast.
func TestCompilerRuntimeInterface(t *testing.T) {
	manifestPath := os.Getenv("TEMPLATE_INTERFACE_MANIFEST")
	if manifestPath == "" {
		manifestPath = "../../packages/template-compiler/interface.json"
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
	astEngineFile, err := parser.ParseFile(token.NewFileSet(), "render/engine.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	var astEngine *ast.StructType
	for _, declaration := range astEngineFile.Decls {
		general, ok := declaration.(*ast.GenDecl)
		if !ok {
			continue
		}
		for _, spec := range general.Specs {
			named, ok := spec.(*ast.TypeSpec)
			if ok && named.Name.Name == "Engine" {
				astEngine, _ = named.Type.(*ast.StructType)
			}
		}
	}
	if astEngine == nil || !hasField(astEngine, "runtime") {
		t.Fatal("AstProgram does not own RuntimeEnvironment")
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
	contextTypes := map[string]*ast.TypeSpec{}
	contextMethods := map[string][]string{}
	for _, declaration := range contextFile.Decls {
		if function, ok := declaration.(*ast.FuncDecl); ok && function.Recv != nil {
			receiver := receiverName(function.Recv.List[0].Type)
			contextMethods[receiver] = append(contextMethods[receiver], function.Name.Name)
		}
		general, ok := declaration.(*ast.GenDecl)
		if !ok {
			continue
		}
		for _, spec := range general.Specs {
			named, ok := spec.(*ast.TypeSpec)
			if ok {
				contextTypes[named.Name.Name] = named
			}
			if ok && named.Name.Name == "RuntimeServices" {
				services, _ = named.Type.(*ast.InterfaceType)
			}
		}
	}
	for name, expected := range map[string][]string{"Frame": manifest.Languages.Go.FrameFields, "Scope": manifest.Languages.Go.ScopeFields} {
		structure, ok := contextTypes[name].Type.(*ast.StructType)
		if !ok {
			t.Fatalf("%s is not a struct", name)
		}
		actual := []string{}
		for _, field := range structure.Fields.List {
			for _, fieldName := range field.Names {
				actual = append(actual, fieldName.Name)
			}
		}
		if !equalNames(actual, expected) {
			t.Fatalf("%s fields differ: %v", name, actual)
		}
	}
	if !equalNames(contextMethods["Scope"], manifest.Languages.Go.ScopeOperations) {
		t.Fatalf("Scope operations differ: %v", contextMethods["Scope"])
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
	runtimeFile, err := parser.ParseFile(token.NewFileSet(), "render/runtime_environment.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	var runtimeEnvironment *ast.StructType
	runtimeMethods := []*ast.FuncDecl{}
	for _, declaration := range runtimeFile.Decls {
		if function, ok := declaration.(*ast.FuncDecl); ok && function.Recv != nil && receiverName(function.Recv.List[0].Type) == "RuntimeEnvironment" {
			runtimeMethods = append(runtimeMethods, function)
		}
		general, ok := declaration.(*ast.GenDecl)
		if !ok {
			continue
		}
		for _, spec := range general.Specs {
			named, ok := spec.(*ast.TypeSpec)
			if ok && named.Name.Name == "RuntimeEnvironment" {
				runtimeEnvironment, _ = named.Type.(*ast.StructType)
			}
		}
	}
	if runtimeEnvironment == nil {
		t.Fatal("RuntimeEnvironment is not a struct")
	}
	runtimeFields := fieldNames(runtimeEnvironment)
	if !equalNames(runtimeFields, manifest.Languages.Go.RuntimeEnvironmentFields) {
		t.Fatalf("RuntimeEnvironment fields differ: %v", runtimeFields)
	}
	if len(runtimeMethods) != len(manifest.RuntimeContract.RuntimeEnvironment.Operations) {
		t.Fatal("RuntimeEnvironment operation count differs")
	}
	for index, operation := range manifest.RuntimeContract.RuntimeEnvironment.Operations {
		if runtimeMethods[index].Name.Name != manifest.Languages.Go.RuntimeEnvironmentOperations[index] || fieldCount(runtimeMethods[index].Type.Params) != len(operation.Parameters) {
			t.Fatalf("RuntimeEnvironment.%s differs", operation.Name)
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

func fieldNames(structure *ast.StructType) []string {
	names := []string{}
	for _, field := range structure.Fields.List {
		for _, name := range field.Names {
			names = append(names, name.Name)
		}
	}
	return names
}

func hasField(structure *ast.StructType, expected string) bool {
	for _, name := range fieldNames(structure) {
		if name == expected {
			return true
		}
	}
	return false
}

func exported(name string) string { return string(name[0]-'a'+'A') + name[1:] }

func equalNames(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

type boundMapManifest struct {
	Languages struct {
		Go struct {
			BoundMap struct {
				Type                string            `json:"type"`
				Operations          map[string]string `json:"operations"`
				GeneratedOperations []string          `json:"generatedOperations"`
			} `json:"boundMap"`
		} `json:"go"`
	} `json:"languages"`
}

// TestBoundMapInterface checks that the bound map type has no exported field or method and that the
// exported functions of the value package that take or return it are exactly the operations of the
// manifest and the operations that it declares for generated programs (VAL-22).
func TestBoundMapInterface(t *testing.T) {
	manifestPath := os.Getenv("TEMPLATE_INTERFACE_MANIFEST")
	if manifestPath == "" {
		manifestPath = "../../packages/template-compiler/interface.json"
	}
	manifestBytes, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatal(err)
	}
	var manifest boundMapManifest
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		t.Fatal(err)
	}
	mapping := manifest.Languages.Go.BoundMap
	allowed := map[string]bool{}
	for _, name := range mapping.Operations {
		allowed[name] = true
	}
	for _, name := range mapping.GeneratedOperations {
		allowed[strings.TrimPrefix(name, "value.")] = true
	}
	packages, err := parser.ParseDir(token.NewFileSet(), "value", func(info fs.FileInfo) bool { return !strings.HasSuffix(info.Name(), "_test.go") }, 0)
	if err != nil {
		t.Fatal(err)
	}
	mentions := func(fields *ast.FieldList) bool {
		found := false
		if fields == nil {
			return false
		}
		ast.Inspect(fields, func(node ast.Node) bool {
			if identifier, ok := node.(*ast.Ident); ok && identifier.Name == mapping.Type {
				found = true
			}
			return true
		})
		return found
	}
	found := map[string]bool{}
	for _, file := range packages["value"].Files {
		for _, declaration := range file.Decls {
			switch current := declaration.(type) {
			case *ast.GenDecl:
				for _, specification := range current.Specs {
					if typeSpec, ok := specification.(*ast.TypeSpec); ok && typeSpec.Name.Name == mapping.Type {
						for _, name := range fieldNames(typeSpec.Type.(*ast.StructType)) {
							if ast.IsExported(name) {
								t.Errorf("BoundMap has the exported field %s", name)
							}
						}
					}
				}
			case *ast.FuncDecl:
				if !ast.IsExported(current.Name.Name) {
					continue
				}
				if current.Recv != nil {
					if receiverName(current.Recv.List[0].Type) == mapping.Type {
						t.Errorf("BoundMap has the exported method %s", current.Name.Name)
					}
					continue
				}
				if mentions(current.Type.Params) || mentions(current.Type.Results) || allowed[current.Name.Name] {
					if !allowed[current.Name.Name] {
						t.Errorf("value exports the undeclared bound map operation %s", current.Name.Name)
					}
					found[current.Name.Name] = true
				}
			}
		}
	}
	for name := range allowed {
		if !found[name] {
			t.Errorf("value does not export the bound map operation %s", name)
		}
	}
	root, err := parser.ParseFile(token.NewFileSet(), "bound.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	aliases := map[string]bool{}
	for _, declaration := range root.Decls {
		if general, ok := declaration.(*ast.GenDecl); ok && general.Tok == token.VAR {
			for _, specification := range general.Specs {
				for _, name := range specification.(*ast.ValueSpec).Names {
					aliases[name.Name] = true
				}
			}
		}
	}
	for _, name := range mapping.Operations {
		if !aliases[name] {
			t.Errorf("package template does not export %s", name)
		}
	}
}
