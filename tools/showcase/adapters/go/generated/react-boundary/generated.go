// Generated.
package generated
import ("bytes"; "encoding/json"; "fmt"; "time"; template "github.com/polyspec/template"; "github.com/polyspec/template/ast"; "github.com/polyspec/template/errs"; "github.com/polyspec/template/functions"; "github.com/polyspec/template/render"; "github.com/polyspec/template/value")
type Page struct { Title *string `json:"title"` }
type Slot struct { Template *string `json:"template"`; Html *string `json:"html"` }
type Assign struct {
	Title *string `json:"title"`
	Heading *string `json:"heading"`
	Island_label *string `json:"island_label"`
	Root_label *string `json:"root_label"`
	Defined_label *string `json:"defined_label"`
	Page *Page `json:"page"`
}
type Input_content_tpl struct {  }
type Input_layout_tpl struct {  }
type DefinitionData_content_tpl struct {  }
type DefinitionData_layout_tpl struct {  }
type Definition[T any] struct { HTML *string `json:"html"`; Data *T `json:"data"` }
type Definitions struct { Content *Definition[DefinitionData_content_tpl] `json:"content"`; Layout *Definition[DefinitionData_layout_tpl] `json:"layout"` }
type ArtifactManifest struct { Schema int; Mode string; Target string; Entry string; SourceDigest string; TypeDigest string; ContractDigest string; Files map[string]string }
type OrderedEntry[K comparable, V any] struct { Key K; Value V }
type OrderedMap[K comparable, V any] struct { entries []OrderedEntry[K, V] }
func NewOrderedMap[K comparable, V any]() OrderedMap[K, V] { return OrderedMap[K, V]{} }
func (m *OrderedMap[K, V]) Set(key K, item V) { for index := range m.entries { if m.entries[index].Key == key { m.entries[index].Value = item; return } }; m.entries = append(m.entries, OrderedEntry[K, V]{key, item}) }
func (m OrderedMap[K, V]) Get(key K) (V, bool) { for _, entry := range m.entries { if entry.Key == key { return entry.Value, true } }; var zero V; return zero, false }
func (m OrderedMap[K, V]) Entries() []OrderedEntry[K, V] { return m.entries }
func (m OrderedMap[K, V]) generatedValue() value.Value { result := value.NewOrderedMap(); for _, entry := range m.entries { result.Set(fmt.Sprint(entry.Key), generatedValue(entry.Value)) }; return result }
func (m *OrderedMap[K, V]) UnmarshalJSON(data []byte) error { decoder := json.NewDecoder(bytes.NewReader(data)); token, err := decoder.Token(); if err != nil { return err }; if token != json.Delim('{') { return fmt.Errorf("generated ordered map must be an object") }; m.entries = nil; for decoder.More() { rawKey, err := decoder.Token(); if err != nil { return err }; keyText, ok := rawKey.(string); if !ok { return fmt.Errorf("generated ordered map key is not text") }; var key K; if err := json.Unmarshal([]byte(strconvQuote(keyText)), &key); err != nil { return err }; var item V; if err := decoder.Decode(&item); err != nil { return err }; m.Set(key, item) }; _, err = decoder.Token(); return err }
func strconvQuote(input string) string { data, _ := json.Marshal(input); return string(data) }
type generatedValueSource interface { generatedValue() value.Value }
func generatedPanic(err error) { if err != nil { panic(err) } }
func generatedValue(input any) value.Value { if source, ok := input.(generatedValueSource); ok { return source.generatedValue() }; result, err := value.Bind(input); generatedPanic(err); return result }
func generatedResult[T any](input value.Value) T { if result, ok := input.(T); ok { return result }; var result T; generatedPanic(generatedDecode(input, &result)); return result }
func generatedTruthy(runtime *render.RuntimeBindings, input any) bool { return runtime.Truthy(generatedValue(input)) }
func generatedUnary[T any](runtime *render.RuntimeBindings, operator string, input any, frame *render.Frame, span ast.Span) T { result, err := runtime.Unary(operator, generatedValue(input), frame, span); generatedPanic(err); return generatedResult[T](result) }
func generatedBinary[T any](runtime *render.RuntimeBindings, operator string, left, right any, frame *render.Frame, span ast.Span) T { result, err := runtime.Binary(operator, generatedValue(left), generatedValue(right), frame, span); generatedPanic(err); return generatedResult[T](result) }
func generatedMember[T any](runtime *render.RuntimeBindings, input any, key string) T { return generatedResult[T](runtime.Member(generatedValue(input), key)) }
func generatedIndex[T any](runtime *render.RuntimeBindings, input, key any) T { return generatedResult[T](runtime.Index(generatedValue(input), generatedValue(key))) }
func generatedCall[T any](runtime *render.RuntimeBindings, name string, args []value.Value, frame *render.Frame, span ast.Span) T { result, err := runtime.Call(name, args, frame, span); generatedPanic(err); return generatedResult[T](result) }
func generatedEscape(runtime *render.RuntimeBindings, input any, frame *render.Frame, span ast.Span) string { result, err := runtime.Escape(generatedValue(input), frame, span); generatedPanic(err); return result }
func generatedWrite(context *render.Context, text string, frame *render.Frame, span ast.Span) { generatedPanic(context.Write(text, frame, &span)) }
func generatedEnter(context *render.Context, name string, frame *render.Frame, span ast.Span) { generatedPanic(context.Enter(name, frame, &span)) }
func generatedLimit(runtime *render.RuntimeBindings, kind string, count int, frame *render.Frame, span ast.Span) { generatedPanic(runtime.Limit(kind, count, frame, span)) }
func valueOrZero[T any](input *T) T { if input == nil { var zero T; return zero }; return *input }
func generatedPlain(input any) any { switch item := input.(type) { case *value.OrderedMap: result := map[string]any{}; for _, key := range item.Keys() { entry, _ := item.Get(key); result[key] = generatedPlain(entry) }; return result; case value.List: result := make([]any, len(item)); for index, entry := range item { result[index] = generatedPlain(entry) }; return result; default: return input } }
func generatedDecode(input any, output any) error { data, err := json.Marshal(generatedPlain(input)); if err != nil { return err }; return json.Unmarshal(data, output) }
func generatedEnv(options template.RenderOptions) functions.Env { env := functions.Env{Timezone: "Z", Now: float64(time.Now().Unix())}; if options.Env != nil { if options.Env.Timezone != "" { env.Timezone = options.Env.Timezone }; env.Now = options.Env.Now }; return env }
func render_content_tpl(assign Assign, definitions Definitions, input Input_content_tpl, context *render.Context, runtime *render.RuntimeBindings, rootData *value.OrderedMap, scope *render.Scope) {
	frame := render.NewFrame("content.tpl", errs.LineIndex{0, 41, 65, 76}, rootData)

    generatedWrite(context, "<section data-react-island id=\"counter\">\n<p>", frame, ast.Span{0, 44})
    generatedWrite(context, generatedEscape(runtime, valueOrZero(assign.Island_label), frame, ast.Span{47, 59}), frame, ast.Span{44, 60})
    generatedWrite(context, "</p>\n</section>\n", frame, ast.Span{60, 76})
}
func render_layout_tpl(assign Assign, definitions Definitions, input Input_layout_tpl, context *render.Context, runtime *render.RuntimeBindings, rootData *value.OrderedMap, scope *render.Scope) {
	frame := render.NewFrame("layout.tpl", errs.LineIndex{0, 7, 26, 38, 46}, rootData)

    generatedWrite(context, "<main>\n<h1>", frame, ast.Span{0, 11})
    generatedWrite(context, generatedEscape(runtime, valueOrZero(assign.Title), frame, ast.Span{14, 19}), frame, ast.Span{11, 20})
    generatedWrite(context, "</h1>\n", frame, ast.Span{20, 26})
    { definition := definitions.Content
    if definition == nil { panic(runtime.Error(frame, ast.Span{26, 37}, errs.RuntimeBlockUndefined, "define content is not registered")) }
    if definition != nil && definition.HTML != nil { generatedWrite(context, *definition.HTML, frame, ast.Span{26, 37}) } else {
        input := Input_content_tpl{}
        if definition != nil && definition.Data != nil {

        }

        blockScope := render.NewScope()
        generatedEnter(context, "content.tpl", frame, ast.Span{26, 37})
        func() { defer context.Leave(); render_content_tpl(assign, definitions, input, context, runtime, rootData, blockScope) }()
    }
    }
    generatedWrite(context, "</main>\n", frame, ast.Span{38, 46})
}
func renderTemplate(target string, assign Assign, definitions Definitions, context *render.Context, runtime *render.RuntimeBindings, rootData *value.OrderedMap, scope *render.Scope) { switch target {
	case "content.tpl": render_content_tpl(assign, definitions, Input_content_tpl{}, context, runtime, rootData, scope); return
	case "layout.tpl": render_layout_tpl(assign, definitions, Input_layout_tpl{}, context, runtime, rootData, scope); return
	default: panic(context.Fail(errs.LoadNotFound, nil, nil, "template " + target + " does not exist"))
} }
type generatedTarget struct { target string; html *string }
func generatedBindDefinitions(input map[string]template.DefineInput) (Definitions, map[string]generatedTarget, error) { _ = input; plain := map[string]any{}; targets := map[string]generatedTarget{}; for id, input := range input { _ = input; switch id {
		case "content":
			if input.HTML != nil { if false || input.Template != "" || input.Data != nil { return Definitions{}, nil, fmt.Errorf("define.%s has an invalid html entry", id) }; plain[id] = map[string]any{"html": *input.HTML}; targets[id] = generatedTarget{html: input.HTML}; continue }
			if input.Template != "content.tpl" { return Definitions{}, nil, fmt.Errorf("define.%s has an invalid template", id) }; plain[id] = map[string]any{"data": generatedPlain(input.Data)}; targets[id] = generatedTarget{target: "content.tpl"}
		case "layout":
			if input.HTML != nil { if true || input.Template != "" || input.Data != nil { return Definitions{}, nil, fmt.Errorf("define.%s has an invalid html entry", id) }; plain[id] = map[string]any{"html": *input.HTML}; targets[id] = generatedTarget{html: input.HTML}; continue }
			if input.Template != "layout.tpl" { return Definitions{}, nil, fmt.Errorf("define.%s has an invalid template", id) }; plain[id] = map[string]any{"data": generatedPlain(input.Data)}; targets[id] = generatedTarget{target: "layout.tpl"}
		default: return Definitions{}, nil, fmt.Errorf("define.%s is not declared", id)
	} }; var definitions Definitions; if err := generatedDecode(plain, &definitions); err != nil { return Definitions{}, nil, err }; return definitions, targets, nil }
type GeneratedProgram struct { Runtime *template.RuntimeEnvironment }
func NewGeneratedProgram(options template.Options) (*GeneratedProgram, error) { runtime, err := template.NewRuntimeEnvironment(options.Limits, options.Functions); if err != nil { return nil, err }; return &GeneratedProgram{Runtime: runtime}, nil }
type generatedPrepared struct { target string; assign Assign; definitions Definitions; rootData *value.OrderedMap; env functions.Env; runtime *template.RuntimeEnvironment; html *string }
func (p *generatedPrepared) Render() (output string, err error) { defer func() { if failure := recover(); failure != nil { if failureError, ok := failure.(error); ok { err = failureError } else { panic(failure) } } }(); context := render.NewContext(p.runtime, p.rootData, p.env, p.target); runtime := render.NewRuntimeBindings(context); scope := render.NewScope(); if err := context.Enter(p.target, nil, nil); err != nil { return "", err }; defer context.Leave(); if p.html != nil { if err := context.Write(*p.html, nil, nil); err != nil { return "", err } } else { renderTemplate(p.target, p.assign, p.definitions, context, runtime, p.rootData, scope) }; return context.Output(), nil }
func (p *GeneratedProgram) Prepare(target any, assign any, options template.RenderOptions) (template.Prepared, error) { name, ok := target.(string); if !ok { return nil, fmt.Errorf("generated target must be a template name") }; rootData, err := value.BindMap(assign); if err != nil { return nil, err }; var typedAssign Assign; if err := generatedDecode(rootData, &typedAssign); err != nil { return nil, err }; definitions, targets, err := generatedBindDefinitions(options.Define); if err != nil { return nil, err }; resolved := targets[name]; targetName := name; if resolved.target != "" { targetName = resolved.target }; return &generatedPrepared{target: targetName, assign: typedAssign, definitions: definitions, rootData: rootData, env: generatedEnv(options), runtime: p.Runtime, html: resolved.html}, nil }
func (p *GeneratedProgram) Render(target any, assign any, options template.RenderOptions) (string, error) { prepared, err := p.Prepare(target, assign, options); if err != nil { return "", err }; return prepared.Render() }
var _ template.Program = (*GeneratedProgram)(nil)
