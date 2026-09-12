# github.com/polyspec/template

[한국어](README.ko.md).

Go implementation of the template language: lexer, parser, renderer, built-in functions and a command line interface. The module has no dependencies outside the standard library.

## Install

```sh
go get github.com/polyspec/template
```

## Render

```go
package main

import (
	"fmt"
	"os"

	template "github.com/polyspec/template"
	"github.com/polyspec/template/functions"
)

func main() {
	engine, err := template.NewEngine(template.Options{Loader: template.NewFSLoader(os.DirFS("templates"))})
	if err != nil {
		panic(err)
	}
	_ = engine.Register("greet", func(args []template.Value, _ functions.Context) (any, error) {
		return "Hello, " + args[0].(string), nil
	})
	assign := map[string]any{"title": "Home"}
html, err := engine.Render("layout", assign, template.RenderOptions{
	Define: map[string]template.DefineInput{"layout": {Template: "layout.tpl"}, "content": {Template: "pages/home.tpl"}},
		Env:    &template.Env{Timezone: "+09:00", Now: 1789084800},
	})
	if err != nil {
		panic(err)
	}
	fmt.Print(html)
}
```

Assign data is bound by the rules of the data model: `nil`, `bool`, integer and float types, `string`, slices, structs (exported fields in declaration order, named by the `json` tag), `map[string]T` (keys sorted by byte order) and `*template.OrderedMap` (insertion order). `template.ParseJSON` decodes JSON text into values with document order preserved.

## Embed templates

```go
//go:embed templates
var templates embed.FS

sub, _ := fs.Sub(templates, "templates")
engine, _ := template.NewEngine(template.Options{Loader: template.NewFSLoader(sub)})
```

## API

| Symbol | Description |
| --- | --- |
| `Parse(source, name, ParseOptions)` | Parses one template into its AST. `ParseOptions.LegacyWrappers` enables single-brace comment wrappers. |
| `NewEngine(Options)` | Creates an engine with `Loader`, `Functions`, `Limits`, `Delimiters` and `LegacyWrappers`. |
| `(*Engine).Render(nameOrAST, assign, RenderOptions)` | Renders a template to a string. `assign` contains variables and `Define` supplies template or HTML entries. |
| `(*Engine).Register(name, fn)` | Registers a host function `func(args []Value, ctx functions.Context) (any, error)`. |
| `NewMapLoader`, `NewFSLoader` | In-memory and `fs.FS` loaders. |
| `ParseJSON` | Order-preserving JSON decoder for assign data. |
| `Error` | Error with `Code`, `Template`, `Line`, `Col`, `Offset`, `End`, `Message`. |
| `SafeString` | A string that the echo tag writes without escaping. |

## Command line

```sh
go build -o template ./cmd/template
./template parse FILE [--root DIR] [--delimiters OC] [--legacy-wrappers true]
./template render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] [--legacy-wrappers true]
```

`parse` prints the AST JSON. `render` prints the output. A template error prints the error JSON on stderr and exits with status 2.
Set `LegacyWrappers` or `--legacy-wrappers true` only for consuming applications that use single-brace comment wrappers; the default parser accepts the specification's doubled wrappers.

## Development

```sh
gofmt -l .
go vet ./...
go test -race -count=1 ./...
```

Tests are in `*_test.go` files that use external test packages. The conformance cases and the expression fixtures of the repository run in-process.
