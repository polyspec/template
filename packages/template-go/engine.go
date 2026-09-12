// Package template is the public API: parsing, engines, loaders, values and errors.
package template

import (
	"time"

	"github.com/polyspec/template/ast"
	"github.com/polyspec/template/errs"
	"github.com/polyspec/template/functions"
	"github.com/polyspec/template/lexer"
	"github.com/polyspec/template/loader"
	"github.com/polyspec/template/parser"
	"github.com/polyspec/template/render"
	"github.com/polyspec/template/value"
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

// Options configure an engine.
type Options = render.Options

// RenderOptions are the per-render options.
type RenderOptions = render.RenderOptions

// DefineInput is a template definition.
type DefineInput = render.DefineInput

// ParseOptions configure Parse.
type ParseOptions struct {
	Delimiters     string
	LegacyWrappers bool
}

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
		return parser.Delimiters{}, &Error{Code: errs.DataUnsupportedType, Message: option + " is not a delimiter pair"}
	}
	return d, nil
}

// Parse parses one template source into its AST (RT-2).
func Parse(source []byte, name string, options ParseOptions) (*ast.Template, error) {
	d, err := delimitersOf(options.Delimiters)
	if err != nil {
		return nil, err
	}
	parsed, err := parseWithLines(source, name, d, options.LegacyWrappers)
	if err != nil {
		return nil, err
	}
	return parsed.AST, nil
}

func parseWithLines(source []byte, name string, d parser.Delimiters, legacyWrappers bool) (*render.ParsedTemplate, error) {
	src, err := lexer.FromBytes(name, source)
	if err != nil {
		return nil, err
	}
	template, err := parser.Parse(src, d, legacyWrappers)
	if err != nil {
		return nil, err
	}
	return &render.ParsedTemplate{AST: template, Lines: src.Lines}, nil
}

// Engine parses, caches and renders templates.
type Engine struct {
	*render.Engine
}

// NewEngine creates an engine with the parser attached.
func NewEngine(options Options) (*Engine, error) {
	options.Parse = parseWithLines
	core, err := render.NewEngine(options, func() float64 { return float64(time.Now().Unix()) })
	if err != nil {
		return nil, err
	}
	return &Engine{core}, nil
}
