// Package template is the public API: parsing, engines, loaders, values and errors.
package template

import (
	"fmt"
	"time"

	"github.com/polyspec/template/packages/go/ast"
	"github.com/polyspec/template/packages/go/errs"
	"github.com/polyspec/template/packages/go/format"
	"github.com/polyspec/template/packages/go/functions"
	"github.com/polyspec/template/packages/go/lexer"
	"github.com/polyspec/template/packages/go/loader"
	"github.com/polyspec/template/packages/go/parser"
	"github.com/polyspec/template/packages/go/render"
	"github.com/polyspec/template/packages/go/value"
)

// Error is the error object of the errors document.
type Error = errs.Error

// Loader loads templates by name.
type Loader = loader.Loader

// Value is a template value.
type Value = value.Value

// SafeString is a string that the echo tag writes without escaping.
type SafeString = value.SafeString

// OrderedMap is an insertion-ordered map value.
type OrderedMap = value.OrderedMap

// Env is the render environment.
type Env = functions.Env

// HostFunction is a function registered by the host.
type HostFunction = functions.HostFunction

// Limits are the resource limits.
type Limits = render.Limits

// RuntimeEnvironment owns host functions and limits for both compiler modes.
type RuntimeEnvironment = render.RuntimeEnvironment

// NewRuntimeEnvironment creates runtime services shared by AST and generated programs.
var NewRuntimeEnvironment = render.NewRuntimeEnvironment

// Options configure an engine.
type Options = render.Options

// RenderOptions are the per-render options.
type RenderOptions = render.RenderOptions

// DefineInput is a template definition.
type DefineInput = render.DefineInput

// ParseOptions configure Parse.
type ParseOptions struct {
	Delimiters string
}

// LoadResult is what a loader returns for a name: source text or a parsed AST, and a version.
type LoadResult = loader.Result

// NewMapLoader creates an in-memory loader.
var NewMapLoader = loader.NewMapLoader

// NewFSLoader creates a file system loader.
var NewFSLoader = loader.NewFSLoader

// ParseJSON decodes JSON text into a value with document order preserved.
var ParseJSON = value.ParseJSON

// NewOrderedMap creates an empty ordered map.
var NewOrderedMap = value.NewOrderedMap

func delimitersOf(option string) (parser.Delimiters, error) {
	if option == "" {
		return parser.DefaultDelimiters, nil
	}
	d, ok := parser.ParseDelimiters(option)
	if !ok {
		// An invalid option is an argument error of Go and not an ERR-1 error (ERR-13), as in NewAstProgram.
		return parser.Delimiters{}, fmt.Errorf("%q is not a delimiter pair", option)
	}
	return d, nil
}

// Parse parses one template source into its AST (RT-2). A panic is E_INTERNAL (ERR-13).
func Parse(source []byte, name string, options ParseOptions) (*ast.Template, error) {
	d, err := delimitersOf(options.Delimiters)
	if err != nil {
		return nil, err
	}
	return render.Guard(name, func() (*ast.Template, error) {
		parsed, err := parseWithLines(source, name, d)
		if err != nil {
			return nil, err
		}
		return parsed.AST, nil
	})
}

// Analysis is the AST of a template with the accepted tags and their EDT-8 tokens; offsets are UTF-8 byte offsets
// after a leading byte order mark.
type Analysis = parser.Analysis

// Tag is the source range of one accepted tag, with its kind and the range of its body.
type Tag = parser.Tag

// Token is a classified byte range of an accepted tag (EDT-8).
type Token = parser.Token

// Analyze parses one template source once and returns its AST with the accepted tags and their tokens. A panic is
// E_INTERNAL (ERR-13).
func Analyze(source []byte, name string, options ParseOptions) (*Analysis, error) {
	d, err := delimitersOf(options.Delimiters)
	if err != nil {
		return nil, err
	}
	return render.Guard(name, func() (*Analysis, error) {
		src, err := lexer.FromBytes(name, source)
		if err != nil {
			return nil, err
		}
		return parser.Analyze(src, d)
	})
}

// FormatOptions configure Format.
type FormatOptions = format.Options

// FormatResult is the formatted text and whether it differs from the source.
type FormatResult = format.Result

// FormatError is why Format kept the source: it does not parse, the formatted text parses to a different AST, or
// the HTML structure cannot be indented.
type FormatError = format.Error

// FormatRange is a byte range of the source that Format limits itself to.
type FormatRange = format.Range

// Format formats the whitespace inside the tags of a template and the indentation of its lines; see package format.
var Format = format.Format

func parseWithLines(source []byte, name string, d parser.Delimiters) (*render.ParsedTemplate, error) {
	src, err := lexer.FromBytes(name, source)
	if err != nil {
		return nil, err
	}
	template, err := parser.Parse(src, d)
	if err != nil {
		return nil, err
	}
	return &render.ParsedTemplate{AST: template, Lines: src.Lines}, nil
}

// Prepared is one normalized render operation that can be executed repeatedly.
type Prepared = render.Prepared

// Program prepares and renders one compiled template representation.
type Program interface {
	Prepare(target any, assign any, options RenderOptions) (Prepared, error)
	Render(target any, assign any, options RenderOptions) (string, error)
}

// Engine delegates requests to one complete program.
type Engine struct{ program Program }

// NewEngine creates an engine from an AST or generated program.
func NewEngine(program Program) *Engine { return &Engine{program: program} }

// Prepare delegates to the selected program.
func (e *Engine) Prepare(target any, assign any, options RenderOptions) (Prepared, error) {
	return e.program.Prepare(target, assign, options)
}

// Render delegates to the selected program.
func (e *Engine) Render(target any, assign any, options RenderOptions) (string, error) {
	return e.program.Render(target, assign, options)
}

// AstProgram interprets canonical AST artifacts with the shared runtime semantics.
type AstProgram struct{ *render.Engine }

// NewAstProgram creates an AST program with the parser attached.
func NewAstProgram(options Options) (*AstProgram, error) {
	options.Parse = parseWithLines
	program, err := render.NewEngine(options, func() float64 { return float64(time.Now().Unix()) })
	if err != nil {
		return nil, err
	}
	return &AstProgram{Engine: program}, nil
}
