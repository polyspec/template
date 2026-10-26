<!-- doc-id: packages-template-go-readme -->
# github.com/polyspec/template/packages/go

[한국어](README.ko.md).

Go implementation of the template language: lexer, parser, renderer, built-in functions and a command line interface. Its dependencies outside the standard library are `github.com/santhosh-tekuri/jsonschema/v6` and `golang.org/x/text`, with which `ast.DecodeTemplate` validates the AST JSON against the AST schema.

## Install

```sh
go get github.com/polyspec/template/packages/go
```

## Render

```go
package main

import (
  "fmt"
  "os"

  template "github.com/polyspec/template/packages/go"
)

func main() {
  program, err := template.NewAstProgram(template.Options{Loader: template.NewFSLoader(os.DirFS("templates"))})
  if err != nil {
    panic(err)
  }
  _ = program.Register("greet", func(args []template.Value, _ template.FunctionContext) (any, error) {
    return "Hello, " + args[0].(string), nil
  })
  engine := template.NewEngine(program)
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
program, _ := template.NewAstProgram(template.Options{Loader: template.NewFSLoader(sub)})
engine := template.NewEngine(program)
```

## API

| Symbol | Description |
| --- | --- |
| `Parse(source, name, ParseOptions)` | Parses one template into its AST. `ParseOptions.Delimiters` selects the delimiter pair. |
| `ast.DecodeTemplate(json)` | Reads the AST JSON text into the AST that `Parse` returns, validated against `contracts/schema/ast.schema.json`, which the package embeds; JSON that the schema rejects fails with an `*ast.DecodeError` whose `Path` is the JSON Pointer of the invalid node (AST-10). |
| `Analyze(source, name, ParseOptions)` | Parses one template once and returns its AST, the accepted `Tags` (kind, range and body range) and their EDT-8 `Tokens`. Offsets are UTF-8 byte offsets after a leading byte order mark. |
| `AnalyzePrefix(source, name, ParseOptions)` | Returns accepted `Tags`/`Tokens` and the first parser error in `PrefixAnalysis.Error`; invalid source bytes or options return an operation error. |
| `Format(source, FormatOptions)` | Formats the whitespace inside tags and the indentation of lines. `FormatOptions` has `Name`, `Delimiters`, `Range`, `Indent` (a run of spaces or one tab, default two spaces), `KeepIndentation` and `TemplateBlocks` (`indent` or `flat`). The result is returned only when the formatted text parses to the same AST; otherwise the error is a `*FormatError` with `Reason` `parse`, `invariant` or `html`. |
| `NewAstProgram(Options)` | Creates an AST program with `Loader`, `Functions`, `Limits` and `Delimiters`. |
| `NewEngine(Program)` | Creates an engine that delegates to one AST or generated program. |
| `(*Engine).Render(nameOrAST, assign, RenderOptions)` | Renders a template to a string. `assign` contains variables and `Define` supplies template or HTML entries. |
| `Bind(value)`, `Merge(first, second)` | `Bind` checks data once and returns a `BoundMap`, whose zero value is the empty bound map; `Merge` combines two bound maps, and an entry of `second` replaces the entry of `first` with the same key. `Render` and `Prepare` take a `BoundMap` as `assign` and as definition `Data` without binding it again; at another position, and as a pointer, it fails with `E_DATA_UNSUPPORTED_TYPE` (VAL-22). Concurrent renders may read one bound map. Errors have no template and no position (ERR-14). |
| `(*render.Engine).Register(name, fn)` | Registers a host function on an AST program. Arguments have the form of VAL-21: a safe string is a `string`, a list is a new `value.List`, a map is a new `*value.OrderedMap` and a native object is the original value. |
| `NewMapLoader`, `NewFSLoader` | In-memory and `fs.FS` loaders. `Loader.Load(name)` returns `(LoadResult, ok, error)`; a non-nil error fails the render with `E_LOAD_FAILED`, and the `fs.FS` loader returns one for a regular file that cannot be read. |
| `ParseJSON` | Order-preserving JSON decoder for assign data. Text that is not one JSON document is `E_DATA_INVALID_JSON`. |
| `Error` | Error with `Code`, `Template`, `Line`, `Col`, `Offset`, `End`, `Message`. |
| `SafeString` | A string that the echo tag writes without escaping. |

## Command line

```sh
go build -o template ./cmd/template
./template parse [--root DIR] [--delimiters OC] FILE
./template tokens [--root DIR] [--delimiters OC] FILE
./template format [--indent none|tab|N] [--delimiters OC] FILE
./template render [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] FILE
```

`parse` prints the AST JSON. `tokens` prints the tokens as `[start, end, type]` triples. `format` prints the formatted text; a format error prints `{"reason","code","line","col","message"}` on stderr and exits with status 2. `render` prints the output. A template error prints the error JSON on stderr and exits with status 2.
## Development

```sh
gofmt -l .
go vet ./...
go test -race -count=1 ./...
```

Tests are in `*_test.go` files that use external test packages. The conformance cases and the expression fixtures of the repository run in-process.

The public `source` package provides `FromBytes` and `FromText`. A `Source` owns its validated UTF-8 text after exactly one leading BOM is removed, exposes `Name`, `Text`, `Lines`, `Bytes()` and `Length()`, and converts native byte indexes with `ByteAt` and `Span`. `Error` creates a positioned template error from byte offsets.
