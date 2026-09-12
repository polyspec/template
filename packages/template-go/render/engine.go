package render

import (
	"errors"
	"fmt"
	"regexp"
	"time"

	"github.com/polyspec/template/ast"
	"github.com/polyspec/template/errs"
	"github.com/polyspec/template/functions"
	"github.com/polyspec/template/loader"
	"github.com/polyspec/template/parser"
	"github.com/polyspec/template/value"
)

// ParseFunc parses source text into a template; nil in a render-only engine.
type ParseFunc func(source []byte, name string, delimiters parser.Delimiters, legacyWrappers bool) (*ParsedTemplate, error)

// ArtifactRefresh controls when compiled template artifacts are refreshed.
type ArtifactRefresh string

const (
	ArtifactRefreshDev   ArtifactRefresh = "dev"
	ArtifactRefreshTrue  ArtifactRefresh = "true"
	ArtifactRefreshFalse ArtifactRefresh = "false"
)

// CompileMode selects AST interpretation or a pre-generated renderer.
type CompileMode string

const (
	CompileModeAST CompileMode = "ast"
	CompileModeGen CompileMode = "gen"
)

// GeneratedPreparedRender is a prepared request produced by generated code.
type GeneratedPreparedRender struct{ Render func() (string, error) }

// GeneratedRequest is the normalized request shared by AST and generated renderers.
type GeneratedRequest struct {
	Target     any
	TargetName string
	Root       *value.OrderedMap
	Registry   map[string]*DefineEntry
	Env        functions.Env
}

// GeneratedRenderer prepares a normalized request using generated host-language code.
type GeneratedRenderer func(request GeneratedRequest) (*GeneratedPreparedRender, error)

// CompileOptions configures compilation mode and its generated renderer.
type CompileOptions struct {
	Mode      CompileMode
	Generated GeneratedRenderer
}

// Options configure an engine (RT-1, RT-6, RT-42).
type Options struct {
	Loader          loader.Loader
	Functions       map[string]functions.HostFunction
	Limits          *Limits
	Delimiters      string
	LegacyWrappers  bool
	Parse           ParseFunc
	ArtifactRefresh ArtifactRefresh
	Compile         CompileOptions
}

// DefineInput is a template definition given to Render (RT-24).
type DefineInput struct {
	Template string
	Data     any
	HTML     *string
}

// RenderOptions are the per-render options.
type RenderOptions struct {
	Define map[string]DefineInput
	Env    *functions.Env
}

var identifier = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

// Engine loads, caches and renders templates.
type Engine struct {
	loader          loader.Loader
	functions       map[string]functions.HostFunction
	limits          Limits
	delimiters      parser.Delimiters
	parse           ParseFunc
	legacyWrappers  bool
	artifactRefresh ArtifactRefresh
	compileMode     CompileMode
	generatedRender GeneratedRenderer
	cache           map[string]cached
	now             func() float64
}

type preparedExecution interface {
	render() (string, error)
}

type astPreparedExecution struct {
	engine     *Engine
	root       *value.OrderedMap
	registry   map[string]*DefineEntry
	env        functions.Env
	targetName string
	template   *ParsedTemplate
}

type generatedPreparedExecution struct{ generated *GeneratedPreparedRender }

// PreparedRender stores exactly one AST or generated execution for repeated renders.
type PreparedRender struct{ execution preparedExecution }

type cached struct {
	version  string
	template *ParsedTemplate
}

// NewEngine creates an engine.
func NewEngine(options Options, now func() float64) (*Engine, error) {
	refresh := options.ArtifactRefresh
	if refresh == "" {
		refresh = ArtifactRefreshTrue
	}
	if refresh != ArtifactRefreshDev && refresh != ArtifactRefreshTrue && refresh != ArtifactRefreshFalse {
		return nil, fmt.Errorf("%q is not an artifact refresh policy", refresh)
	}
	mode := options.Compile.Mode
	if mode == "" {
		mode = CompileModeAST
	}
	if mode != CompileModeAST && mode != CompileModeGen {
		return nil, fmt.Errorf("%q is not a compile mode", mode)
	}
	e := &Engine{loader: options.Loader, functions: map[string]functions.HostFunction{}, limits: DefaultLimits, delimiters: parser.DefaultDelimiters, parse: options.Parse, legacyWrappers: options.LegacyWrappers, artifactRefresh: refresh, compileMode: mode, generatedRender: options.Compile.Generated, cache: map[string]cached{}, now: now}
	if e.now == nil {
		e.now = func() float64 { return float64(time.Now().Unix()) }
	}
	if e.loader == nil {
		e.loader = loader.NewMapLoader(nil)
	}
	if options.Limits != nil {
		e.limits = *options.Limits
	}
	if options.Delimiters != "" {
		d, ok := parser.ParseDelimiters(options.Delimiters)
		if !ok {
			return nil, fmt.Errorf("%q is not a delimiter pair", options.Delimiters)
		}
		e.delimiters = d
	}
	for name, fn := range options.Functions {
		if err := e.Register(name, fn); err != nil {
			return nil, err
		}
	}
	return e, nil
}

// Register adds a host function (FUN-43, FUN-44).
func (e *Engine) Register(name string, fn functions.HostFunction) error {
	if !identifier.MatchString(name) {
		return fmt.Errorf("%q is not an identifier", name)
	}
	if _, ok := functions.Builtins[name]; ok {
		return fmt.Errorf("%s is a built-in function", name)
	}
	e.functions[name] = fn
	return nil
}

// Functions implements Services.
func (e *Engine) Functions() map[string]functions.HostFunction { return e.functions }

// Builtins implements Services.
func (e *Engine) Builtins() map[string]functions.BuiltIn { return functions.Builtins }

// Limits implements Services.
func (e *Engine) Limits() Limits { return e.limits }

// LoadTemplate implements Services (RT-9, RT-40).
func (e *Engine) LoadTemplate(name string, from *Frame, span *ast.Span) (*ParsedTemplate, error) {
	loaded, ok := e.loader.Load(name)
	if !ok {
		message := "template " + name + " does not exist"
		if from != nil && span != nil {
			return nil, errs.At(errs.LoadNotFound, from.Name(), from.Template.Lines, errs.Span{span[0], span[1]}, message)
		}
		return nil, errs.WithoutPosition(errs.LoadNotFound, name, message)
	}
	if c, ok := e.cache[name]; ok && (e.artifactRefresh == ArtifactRefreshFalse || (e.artifactRefresh == ArtifactRefreshTrue && c.version == loaded.Version)) {
		return c.template, nil
	}
	var template *ParsedTemplate
	if loaded.AST != nil {
		template = &ParsedTemplate{AST: loaded.AST}
	} else {
		if e.parse == nil {
			return nil, errors.New("this engine renders parsed templates only; the loader returned source text")
		}
		parsed, err := e.parse(loaded.Source, name, e.delimiters, e.legacyWrappers)
		if err != nil {
			return nil, err
		}
		template = parsed
	}
	e.cache[name] = cached{version: loaded.Version, template: template}
	return template, nil
}

// Prepare binds request data and resolves the target template once.
func (e *Engine) Prepare(target any, assign any, options RenderOptions) (*PreparedRender, error) {
	var name string
	var parsedTarget *ParsedTemplate
	switch t := target.(type) {
	case string:
		name = t
	case *ast.Template:
		name = t.Name
		parsedTarget = &ParsedTemplate{AST: t}
	default:
		return nil, fmt.Errorf("render target must be a name or a template")
	}
	root, err := value.BindMap(assign)
	if err != nil {
		return nil, bindFailure(name, err)
	}
	registry, err := e.bindDefines(options.Define)
	if err != nil {
		return nil, bindFailure(name, err)
	}
	env := functions.Env{Timezone: "Z", Now: e.now()}
	if options.Env != nil {
		if options.Env.Timezone != "" {
			env.Timezone = options.Env.Timezone
		}
		env.Now = options.Env.Now
	}
	targetName := name
	if entry, ok := registry[name]; ok && entry.HTML == nil {
		targetName = entry.Template
	}
	if e.compileMode == CompileModeGen {
		if e.generatedRender == nil {
			return nil, errors.New("generated compile mode requires GeneratedRender")
		}
		generated, err := e.generatedRender(GeneratedRequest{Target: target, TargetName: targetName, Root: root, Registry: registry, Env: env})
		if err != nil {
			return nil, err
		}
		if generated == nil || generated.Render == nil {
			return nil, errors.New("generated renderer returned no Render function")
		}
		return &PreparedRender{execution: &generatedPreparedExecution{generated: generated}}, nil
	}
	template := parsedTarget
	if template == nil {
		if template, err = e.LoadTemplate(targetName, nil, nil); err != nil {
			return nil, err
		}
	}
	return &PreparedRender{execution: &astPreparedExecution{engine: e, root: root, registry: registry, env: env, targetName: targetName, template: template}}, nil
}

// Render renders a template by name or AST (RT-3, RT-4).
func (e *Engine) Render(target any, assign any, options RenderOptions) (string, error) {
	prepared, err := e.Prepare(target, assign, options)
	if err != nil {
		return "", err
	}
	return prepared.Render()
}

// Render renders the prepared request.
func (p *PreparedRender) Render() (string, error) {
	return p.execution.render()
}

func (p *generatedPreparedExecution) render() (string, error) { return p.generated.Render() }

func (p *astPreparedExecution) render() (string, error) {
	context := NewContext(p.engine, p.root, p.env, p.targetName)
	for id, entry := range p.registry {
		context.Registry[id] = entry
	}
	if err := context.Enter(p.targetName, nil, nil); err != nil {
		return "", err
	}
	if err := NewRenderer(context).RenderNodes(p.template.AST.Body, NewFrame(p.template, p.root)); err != nil {
		return "", err
	}
	return context.Output(), nil
}

func bindFailure(name string, err error) error {
	var be *value.BindError
	if errors.As(err, &be) {
		return errs.WithoutPosition(be.Code, name, be.Message)
	}
	return err
}

func (e *Engine) bindDefines(defines map[string]DefineInput) (map[string]*DefineEntry, error) {
	registry := map[string]*DefineEntry{}
	for id, input := range defines {
		switch {
		case input.HTML != nil:
			html := *input.HTML
			registry[id] = &DefineEntry{HTML: &html}
		case input.Template != "":
			name, err := loader.ResolvePath("", input.Template)
			if err != nil {
				return nil, &value.BindError{Code: errs.DataUnsupportedType, Message: "define " + id + ": " + err.Error()}
			}
			entry := &DefineEntry{Template: name}
			if input.Data != nil {
				bound, err := value.Bind(input.Data)
				if err != nil {
					return nil, err
				}
				m, ok := bound.(*value.OrderedMap)
				if !ok {
					return nil, &value.BindError{Code: errs.DataUnsupportedType, Message: "define " + id + ": data is not a map"}
				}
				entry.Data = m
			}
			registry[id] = entry
		default:
			return nil, &value.BindError{Code: errs.DataUnsupportedType, Message: "define " + id + ": entry needs \"template\" or \"html\""}
		}
	}
	return registry, nil
}
