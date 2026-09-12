// Package render implements the renderer of docs/spec/runtime.md.
package render

import (
	"fmt"
	"strings"

	"github.com/polyspec/template/ast"
	"github.com/polyspec/template/errs"
	"github.com/polyspec/template/functions"
	"github.com/polyspec/template/value"
)

// Limits are the resource limits of RT-33.
type Limits struct {
	Iterations      int
	Depth           int
	OutputBytes     int
	ExpressionDepth int
}

// DefaultLimits are the defaults of RT-33.
var DefaultLimits = Limits{Iterations: 1_000_000, Depth: 32, OutputBytes: 16 * 1024 * 1024, ExpressionDepth: 64}

// ParsedTemplate is a template with the line index of its source (nil for a loaded AST).
type ParsedTemplate struct {
	AST   *ast.Template
	Lines errs.LineIndex
}

// DefineEntry is a template definition entry (RT-24).
type DefineEntry struct {
	Template string
	Data     *value.OrderedMap
	HTML     *string
}

// LoopMeta is the meta of an active loop (RT-16).
type LoopMeta struct {
	Index int
	Key   value.Value
	Value value.Value
	First bool
	Last  bool
	Size  int
}

// Frame is one rendered template file (RT-11 to RT-14).
type Frame struct {
	Template *ParsedTemplate
	Context  *value.OrderedMap
	Locals   map[string]value.Value
	Loops    map[string][]*LoopMeta
}

// NewFrame creates a frame with an empty local scope.
func NewFrame(template *ParsedTemplate, context *value.OrderedMap) *Frame {
	return &Frame{Template: template, Context: context, Locals: map[string]value.Value{}, Loops: map[string][]*LoopMeta{}}
}

// Name returns the template name.
func (f *Frame) Name() string { return f.Template.AST.Name }

// Lookup implements RT-12.
func (f *Frame) Lookup(name string) value.Value {
	if v, ok := f.Locals[name]; ok {
		return v
	}
	if v, ok := f.Context.Get(name); ok {
		return v
	}
	return nil
}

// LoopMeta returns the innermost active loop for a name.
func (f *Frame) LoopMeta(name string) *LoopMeta {
	stack := f.Loops[name]
	if len(stack) == 0 {
		return nil
	}
	return stack[len(stack)-1]
}

// Services are the engine operations the renderer needs.
type Services interface {
	Functions() map[string]functions.HostFunction
	Builtins() map[string]functions.BuiltIn
	Limits() Limits
	LoadTemplate(name string, from *Frame, span *ast.Span) (*ParsedTemplate, error)
}

// Context is the state of one render.
type Context struct {
	Services   Services
	RootData   *value.OrderedMap
	Env        functions.Env
	EntryName  string
	Registry   map[string]*DefineEntry
	Chain      []string
	Iterations int
	output     strings.Builder
	bytes      int
}

// NewContext creates a render context.
func NewContext(services Services, root *value.OrderedMap, env functions.Env, entry string) *Context {
	return &Context{Services: services, RootData: root, Env: env, EntryName: entry, Registry: map[string]*DefineEntry{}}
}

// Fail creates an error located at a span of a frame.
func (c *Context) Fail(code errs.Code, frame *Frame, span *ast.Span, message string) error {
	if frame == nil || span == nil {
		name := c.EntryName
		if frame != nil {
			name = frame.Name()
		}
		return errs.WithoutPosition(code, name, message)
	}
	return errs.At(code, frame.Name(), frame.Template.Lines, errs.Span{span[0], span[1]}, message)
}

// Write appends output and checks the size limit (RT-35).
func (c *Context) Write(text string, frame *Frame, span *ast.Span) error {
	c.bytes += len(text)
	if c.bytes > c.Services.Limits().OutputBytes {
		return c.Fail(errs.RuntimeLimit, frame, span, fmt.Sprintf("output exceeds %d bytes", c.Services.Limits().OutputBytes))
	}
	c.output.WriteString(text)
	return nil
}

// Output returns the rendered output.
func (c *Context) Output() string { return c.output.String() }

// Enter pushes a template onto the render chain (RT-22, RT-23).
func (c *Context) Enter(name string, frame *Frame, span *ast.Span) error {
	for _, active := range c.Chain {
		if active == name {
			return c.Fail(errs.LoadCycle, frame, span, name+" is already being rendered")
		}
	}
	if len(c.Chain) > c.Services.Limits().Depth {
		return c.Fail(errs.RuntimeDepth, frame, span, fmt.Sprintf("nesting depth exceeds %d", c.Services.Limits().Depth))
	}
	c.Chain = append(c.Chain, name)
	return nil
}

// Leave pops the render chain.
func (c *Context) Leave() { c.Chain = c.Chain[:len(c.Chain)-1] }
