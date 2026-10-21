package template_test

import (
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"

	template "github.com/polyspec/template/packages/go"
	"github.com/polyspec/template/packages/go/errs"
	"github.com/polyspec/template/packages/go/functions"
	"github.com/polyspec/template/packages/go/render"
)

func TestEngineRender(t *testing.T) {
	loader := template.NewMapLoader(map[string]string{"a.tpl": "<b>{= x}</b>"})
	program, err := template.NewAstProgram(template.Options{Loader: loader})
	if err != nil {
		t.Fatal(err)
	}
	engine := template.NewEngine(program)
	out, err := engine.Render("a.tpl", map[string]any{"x": "<"}, template.RenderOptions{})
	if err != nil || out != "<b>&lt;</b>" {
		t.Fatalf("render: %q %v", out, err)
	}
	loader.Set("a.tpl", "2")
	out, err = engine.Render("a.tpl", nil, template.RenderOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if out != "2" {
		t.Errorf("cache not refreshed: %q", out)
	}
}

// RT-3: render takes a template name, loaded through the loader, or a parsed template,
// and returns the whole output as one string.
func TestRenderTargets(t *testing.T) {
	loader := template.NewMapLoader(map[string]string{"a.tpl": "<p>{= x}</p>"})
	program, err := template.NewAstProgram(template.Options{Loader: loader})
	if err != nil {
		t.Fatal(err)
	}
	engine := template.NewEngine(program)
	out, err := engine.Render("a.tpl", map[string]any{"x": 1.0}, template.RenderOptions{})
	if err != nil || out != "<p>1</p>" {
		t.Fatalf("render by name: %q %v", out, err)
	}
	parsed, err := template.Parse([]byte("<p>{= x}</p>"), "a.tpl", template.ParseOptions{})
	if err != nil {
		t.Fatal(err)
	}
	out, err = engine.Render(parsed, map[string]any{"x": 1.0}, template.RenderOptions{})
	if err != nil || out != "<p>1</p>" {
		t.Fatalf("render parsed: %q %v", out, err)
	}
}

// TestEnginePrepare: the prepared render of an engine renders the same bytes on every call (RT-62).
func TestEnginePrepare(t *testing.T) {
	program, err := template.NewAstProgram(template.Options{Loader: template.NewMapLoader(map[string]string{"a.tpl": "<b>{= x}</b>"})})
	if err != nil {
		t.Fatal(err)
	}
	prepared, err := template.NewEngine(program).Prepare("a.tpl", map[string]any{"x": "<"}, template.RenderOptions{})
	if err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if out, err := prepared.Render(); err != nil || out != "<b>&lt;</b>" {
			t.Fatalf("prepared render: %q %v", out, err)
		}
	}
}

// RT-76: under dev a program renders the changed source of a template, and under false it keeps its first parse.
func TestArtifactRefreshPolicies(t *testing.T) {
	devLoader := template.NewMapLoader(map[string]string{"a.tpl": "1"})
	devProgram, err := template.NewAstProgram(template.Options{Loader: devLoader, ArtifactRefresh: render.ArtifactRefreshDev})
	if err != nil {
		t.Fatal(err)
	}
	dev := template.NewEngine(devProgram)
	out, err := dev.Render("a.tpl", nil, template.RenderOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if out != "1" {
		t.Fatalf("dev initial: %q", out)
	}
	devLoader.Set("a.tpl", "2")
	out, err = dev.Render("a.tpl", nil, template.RenderOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if out != "2" {
		t.Fatalf("dev refresh: %q", out)
	}

	immutableLoader := template.NewMapLoader(map[string]string{"a.tpl": "1"})
	immutableProgram, err := template.NewAstProgram(template.Options{Loader: immutableLoader, ArtifactRefresh: render.ArtifactRefreshFalse})
	if err != nil {
		t.Fatal(err)
	}
	immutable := template.NewEngine(immutableProgram)
	out, err = immutable.Render("a.tpl", nil, template.RenderOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if out != "1" {
		t.Fatalf("immutable initial: %q", out)
	}
	immutableLoader.Set("a.tpl", "2")
	out, err = immutable.Render("a.tpl", nil, template.RenderOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if out != "1" {
		t.Fatalf("immutable changed: %q", out)
	}
}

// sourceVersionLoader returns a source and a version that the test sets independently.
type sourceVersionLoader struct {
	source  string
	version string
}

// Load implements Loader.
func (l *sourceVersionLoader) Load(name string) (template.LoadResult, bool, error) {
	if name != "a.tpl" {
		return template.LoadResult{}, false, nil
	}
	return template.LoadResult{Source: []byte(l.source), Version: l.version}, true, nil
}

// RT-40: under the default artifact refresh policy `true` (RT-76) an engine parses a template once per name@version
// and reuses the parse while the loader reports the same version.
func TestTheParseIsReusedWhileTheVersionStaysTheSame(t *testing.T) {
	loader := &sourceVersionLoader{source: "1", version: "v1"}
	program, err := template.NewAstProgram(template.Options{Loader: loader})
	if err != nil {
		t.Fatal(err)
	}
	engine := template.NewEngine(program)
	out, err := engine.Render("a.tpl", nil, template.RenderOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if out != "1" {
		t.Fatalf("initial render: got %q, want %q", out, "1")
	}

	loader.source = "2"
	out, err = engine.Render("a.tpl", nil, template.RenderOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if out != "1" {
		t.Fatalf("same version %q re-parsed the source: got %q, want %q", "v1", out, "1")
	}

	loader.version = "v2"
	out, err = engine.Render("a.tpl", nil, template.RenderOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if out != "2" {
		t.Fatalf("new version %q not parsed: got %q, want %q", "v2", out, "2")
	}
}

// FUN-46: an error that a host function reports fails the render with E_RUNTIME_HOST_FUNCTION at the position of its call.
func TestHostFunctions(t *testing.T) {
	program, err := template.NewAstProgram(template.Options{Loader: template.NewMapLoader(map[string]string{"a.tpl": "x\n{= twice(2)}"})})
	if err != nil {
		t.Fatal(err)
	}
	engine := template.NewEngine(program)
	if err := program.Register("twice", func(args []template.Value, _ functions.Context) (any, error) {
		number, ok := args[0].(float64)
		if !ok {
			return nil, errors.New("twice wants a number")
		}
		return number * 2, nil
	}); err != nil {
		t.Fatal(err)
	}
	if out, err := engine.Render("a.tpl", nil, template.RenderOptions{}); err != nil || out != "x\n4" {
		t.Errorf("host function: %q %v", out, err)
	}
	if err := program.Register("upper", nil); err == nil {
		t.Error("built-in name accepted")
	}
	if err := program.Register("boom", func([]template.Value, functions.Context) (any, error) { return nil, errors.New("no") }); err != nil {
		t.Fatal(err)
	}
	program2, err := template.NewAstProgram(template.Options{Loader: template.NewMapLoader(map[string]string{"b.tpl": "x\n{= boom()}"})})
	if err != nil {
		t.Fatal(err)
	}
	engine2 := template.NewEngine(program2)
	if err := program2.Register("boom", func([]template.Value, functions.Context) (any, error) { return nil, errors.New("no") }); err != nil {
		t.Fatal(err)
	}
	_, err = engine2.Render("b.tpl", nil, template.RenderOptions{})
	var te *errs.Error
	if !errors.As(err, &te) || te.Code != errs.RuntimeHostFunction || te.Line != 2 {
		t.Errorf("host failure: %v", err)
	}
}

// FUN-43, FUN-44, FUN-45, FUN-47, FUN-48, VAL-7: registration, a refused built-in name, a replaced function, the binding of a result, the same names in every host and a plain string result.
func TestHostFunctionRules(t *testing.T) {
	templates := map[string]string{"a.tpl": "{= tag()}", "b.tpl": "{= two()}", "c.tpl": "{= big()}"}
	program, err := template.NewAstProgram(template.Options{Loader: template.NewMapLoader(templates)})
	if err != nil {
		t.Fatal(err)
	}
	engine := template.NewEngine(program)
	if err := program.Register("tag", func([]template.Value, functions.Context) (any, error) { return "<b>", nil }); err != nil {
		t.Fatal(err)
	}
	if out, err := engine.Render("a.tpl", nil, template.RenderOptions{}); err != nil || out != "&lt;b&gt;" {
		t.Errorf("tag: %q %v", out, err)
	}
	if err := program.Register("upper", func([]template.Value, functions.Context) (any, error) { return "", nil }); err == nil {
		t.Error("built-in name accepted")
	}
	if err := program.Register("two", func([]template.Value, functions.Context) (any, error) { return "first", nil }); err != nil {
		t.Fatal(err)
	}
	if err := program.Register("two", func([]template.Value, functions.Context) (any, error) { return "second", nil }); err != nil {
		t.Fatal(err)
	}
	if out, err := engine.Render("b.tpl", nil, template.RenderOptions{}); err != nil || out != "second" {
		t.Errorf("replaced function: %q %v", out, err)
	}
	if err := program.Register("big", func([]template.Value, functions.Context) (any, error) { return float64(1e19), nil }); err != nil {
		t.Fatal(err)
	}
	_, err = engine.Render("c.tpl", nil, template.RenderOptions{})
	var bound *errs.Error
	if !errors.As(err, &bound) || bound.Code != errs.DataNumberRange {
		t.Errorf("unbindable result: %v", err)
	}
	other, err := template.NewAstProgram(template.Options{Loader: template.NewMapLoader(templates)})
	if err != nil {
		t.Fatal(err)
	}
	_, err = template.NewEngine(other).Render("a.tpl", nil, template.RenderOptions{})
	var unknown *errs.Error
	if !errors.As(err, &unknown) || unknown.Code != errs.RuntimeUnknownFunction {
		t.Errorf("unregistered function: %v", err)
	}
}

// FUN-9: a safe string compares, concatenates and stringifies as its text.
func TestSafeStringIsItsText(t *testing.T) {
	program, err := template.NewAstProgram(template.Options{Loader: template.NewMapLoader(map[string]string{"a.tpl": `{= raw('<b>') == '<b>'}|{= raw('<b>') + '!'}|{= str(raw('<i>'))}`})})
	if err != nil {
		t.Fatal(err)
	}
	if out, err := template.NewEngine(program).Render("a.tpl", nil, template.RenderOptions{}); err != nil || out != "true|&lt;b&gt;!|&lt;i&gt;" {
		t.Errorf("safe string: %q %v", out, err)
	}
}

// RT-20: exceeding the iteration limit fails with E_RUNTIME_LIMIT.
func TestLimits(t *testing.T) {
	limits := template.Limits{Iterations: 5, Depth: 32, OutputBytes: 1 << 20, ExpressionDepth: 64}
	program, err := template.NewAstProgram(template.Options{Loader: template.NewMapLoader(map[string]string{"a.tpl": "{@ i = range(1, 10)}{= i}{/}"}), Limits: &limits})
	if err != nil {
		t.Fatal(err)
	}
	engine := template.NewEngine(program)
	_, err = engine.Render("a.tpl", nil, template.RenderOptions{})
	var te *errs.Error
	if !errors.As(err, &te) || te.Code != errs.RuntimeLimit {
		t.Errorf("limit: %v", err)
	}
}

// RT-33: the default limits; RT-35: the output size is checked as the output is written, and exceeding it fails;
// RT-36: a failed render aborts and returns no partial output.
func TestRenderLimitsDefaultsOutputAndAbort(t *testing.T) {
	want := render.Limits{Iterations: 1_000_000, Depth: 32, OutputBytes: 16 * 1024 * 1024, ExpressionDepth: 64}
	if render.DefaultLimits != want {
		t.Errorf("DefaultLimits = %+v, want %+v", render.DefaultLimits, want)
	}
	defaults, err := template.NewAstProgram(template.Options{Loader: template.NewMapLoader(map[string]string{})})
	if err != nil {
		t.Fatal(err)
	}
	if got := defaults.Limits(); got != want {
		t.Errorf("program limits without Options.Limits = %+v, want %+v", got, want)
	}

	source := map[string]string{"a.tpl": "ab{= 'cd'}"}
	small := render.DefaultLimits
	small.OutputBytes = 4
	program, err := template.NewAstProgram(template.Options{Loader: template.NewMapLoader(source), Limits: &small})
	if err != nil {
		t.Fatal(err)
	}
	output, err := template.NewEngine(program).Render("a.tpl", nil, template.RenderOptions{})
	if err != nil || output != "abcd" {
		t.Fatalf("render with OutputBytes 4 = %q, %v, want \"abcd\"", output, err)
	}

	tight := render.DefaultLimits
	tight.OutputBytes = 3
	program, err = template.NewAstProgram(template.Options{Loader: template.NewMapLoader(source), Limits: &tight})
	if err != nil {
		t.Fatal(err)
	}
	output, err = template.NewEngine(program).Render("a.tpl", nil, template.RenderOptions{})
	var te *errs.Error
	if !errors.As(err, &te) || te.Code != errs.RuntimeLimit || te.Line != 1 || te.Col != 3 {
		t.Errorf("render with OutputBytes 3 = %v, want E_RUNTIME_LIMIT at line 1, col 3", err)
	}
	if output != "" {
		t.Errorf("failed render returned output %q, want no partial output", output)
	}
}

// LEX-21, LEX-22: a delimiter option is a string of two delimiter characters.
// An invalid delimiter option is an argument error of Go, an error that is not an *errs.Error, in
// Parse as in NewAstProgram (ERR-13, T15.3-1).
func TestInvalidDelimiterIsArgumentError(t *testing.T) {
	_, err := template.Parse([]byte("x"), "a.tpl", template.ParseOptions{Delimiters: "{"})
	var templateError *errs.Error
	if err == nil || errors.As(err, &templateError) {
		t.Fatalf("Parse with an invalid delimiter = %v, want an argument error that is not an *errs.Error", err)
	}
	_, err = template.NewAstProgram(template.Options{Loader: template.NewMapLoader(map[string]string{}), Delimiters: "{"})
	if err == nil || errors.As(err, &templateError) {
		t.Fatalf("NewAstProgram with an invalid delimiter = %v, want an argument error that is not an *errs.Error", err)
	}
}

// RT-5, RT-6, FUN-43, FUN-44: the functions of the options are registered as Register registers them, so a name that is no
// identifier or a built-in fails the creation; the limits are the four integers of RT-33 and no other field.
func TestTheOptionsOfAProgramAreChecked(t *testing.T) {
	noop := func([]template.Value, functions.Context) (any, error) { return nil, nil }
	for _, name := range []string{"not a name", "length"} {
		_, err := template.NewAstProgram(template.Options{Loader: template.NewMapLoader(map[string]string{}), Functions: map[string]template.HostFunction{name: noop}})
		var optionError *errs.Error
		if err == nil || errors.As(err, &optionError) {
			t.Errorf("function %q = %v, want an argument error that is not an *errs.Error", name, err)
		}
	}
	want := []string{"Iterations", "Depth", "OutputBytes", "ExpressionDepth"}
	limits := reflect.TypeOf(template.Limits{})
	if limits.NumField() != len(want) {
		t.Fatalf("Limits has %d fields, want %d", limits.NumField(), len(want))
	}
	for i, name := range want {
		field := limits.Field(i)
		if field.Name != name || field.Type.Kind() != reflect.Int {
			t.Errorf("Limits field %d = %s of kind %v, want %s of kind int", i, field.Name, field.Type.Kind(), name)
		}
	}
}

// RT-4: the request options are typed: Define is a map of templates, and Env is the environment struct or a pointer to it.
func TestTheRequestOptionsAreTyped(t *testing.T) {
	options := reflect.TypeOf(template.RenderOptions{})
	define, ok := options.FieldByName("Define")
	if !ok || define.Type.Kind() != reflect.Map {
		t.Fatalf("RenderOptions.Define = %v, want a map", define.Type)
	}
	env, ok := options.FieldByName("Env")
	if !ok {
		t.Fatal("RenderOptions has no Env field")
	}
	envType := env.Type
	if envType.Kind() == reflect.Pointer {
		envType = envType.Elem()
	}
	if envType.Kind() != reflect.Struct {
		t.Fatalf("RenderOptions.Env = %v, want a struct or a pointer to one", env.Type)
	}
}

// TestAParseErrorIsTheErrorObject: a parse error is an *errs.Error with the fields of ERR-1, code, template, line, col,
// offset, end and message, which its JSON writes in that order.
func TestAParseErrorIsTheErrorObject(t *testing.T) {
	_, err := template.Parse([]byte("a\n{? x}"), "x.tpl", template.ParseOptions{})
	var got *errs.Error
	if !errors.As(err, &got) {
		t.Fatalf("Parse = %v, want an *errs.Error", err)
	}
	if got.Code != errs.ParseUnclosedBlock || got.Template != "x.tpl" || got.Line != 2 || got.Col != 1 || got.Offset != 2 || got.End != 3 || got.Message == "" {
		t.Fatalf("error = %#v", got)
	}
	data, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	if want := `{"code":"E_PARSE_UNCLOSED_BLOCK","template":"x.tpl","line":2,"col":1,"offset":2,"end":3,"message":`; !strings.HasPrefix(string(data), want) {
		t.Fatalf("JSON = %s, want the prefix %s", data, want)
	}
}
