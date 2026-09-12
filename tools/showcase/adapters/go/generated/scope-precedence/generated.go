// Generated.
package generated
import ("bytes"; "encoding/json"; "fmt"; "time"; template "github.com/polyspec/template"; "github.com/polyspec/template/ast"; "github.com/polyspec/template/errs"; "github.com/polyspec/template/functions"; "github.com/polyspec/template/render"; "github.com/polyspec/template/value")
type Page struct { Title string `json:"title"` }
type Assign struct {
	Page Page `json:"page"`
	Root_label string `json:"root_label"`
	Defined_label string `json:"defined_label"`
}
type Input_content_tpl struct { Title string `json:"title"`; Root_label string `json:"root_label"`; Defined_label string `json:"defined_label"`; Layout_local *string `json:"layout_local"` }
type Input_layout_tpl struct {  }
type DefinitionData_content_tpl struct { Title *string `json:"title"`; Root_label *string `json:"root_label"`; Defined_label *string `json:"defined_label"`; Layout_local **string `json:"layout_local"` }
type DefinitionData_layout_tpl struct {  }
type Definition[T any] struct { Template string `json:"template"`; HTML *string `json:"html"`; Data *T `json:"data"` }
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
func generatedValue(input any) value.Value { switch item := input.(type) { case nil: return nil; case bool: return item; case float64: return item; case string: return item; case value.SafeString: return item; case value.List: return item; case *value.OrderedMap: return item }; if source, ok := input.(generatedValueSource); ok { return source.generatedValue() }; result, err := value.Bind(input); generatedPanic(err); return result }
func generatedResult[T any](input value.Value) T { if result, ok := input.(T); ok { return result }; var result T; generatedPanic(generatedDecode(input, &result)); return result }
func generatedTruthy(runtime *render.RuntimeBindings, input any) bool { return runtime.Truthy(generatedValue(input)) }
func generatedUnary[T any](runtime *render.RuntimeBindings, operator string, input any, frame *render.Frame, span ast.Span) T { result, err := runtime.Unary(operator, generatedValue(input), frame, span); generatedPanic(err); return generatedResult[T](result) }
func generatedBinary[T any](runtime *render.RuntimeBindings, operator string, left, right any, frame *render.Frame, span ast.Span) T { result, err := runtime.Binary(operator, generatedValue(left), generatedValue(right), frame, span); generatedPanic(err); return generatedResult[T](result) }
func generatedMember[T any](runtime *render.RuntimeBindings, input any, key string) T { return generatedResult[T](runtime.Member(generatedValue(input), key)) }
func generatedIndex[T any](runtime *render.RuntimeBindings, input, key any) T { return generatedResult[T](runtime.Index(generatedValue(input), generatedValue(key))) }
func generatedCall[T any](runtime *render.RuntimeBindings, name string, args []value.Value, frame *render.Frame, span ast.Span) T { result, err := runtime.Call(name, args, frame, span); generatedPanic(err); return generatedResult[T](result) }
func generatedEscape(runtime *render.RuntimeBindings, input any, frame *render.Frame, span ast.Span) string { result, err := runtime.Escape(generatedValue(input), frame, span); generatedPanic(err); return result }
func generatedEntries(runtime *render.RuntimeBindings, input any, frame *render.Frame, span ast.Span) []render.RuntimeEntry { result, err := runtime.Entries(generatedValue(input), frame, span); generatedPanic(err); return result }
func generatedListSpread[T any](runtime *render.RuntimeBindings, input any, frame *render.Frame, span ast.Span) []T { source, err := runtime.ListSpread(generatedValue(input), frame, span); generatedPanic(err); result := make([]T, len(source)); for index, item := range source { result[index] = generatedResult[T](item) }; return result }
func generatedMapSpread[K comparable, V any](runtime *render.RuntimeBindings, input any, frame *render.Frame, span ast.Span) OrderedMap[K, V] { source, err := runtime.MapSpread(generatedValue(input), frame, span); generatedPanic(err); result := NewOrderedMap[K, V](); for _, key := range source.Keys() { result.Set(generatedResult[K](key), generatedResult[V](source.MustGet(key))) }; return result }
func generatedLoopMeta(scope *render.Scope, name string) *render.LoopMeta { result := scope.LoopMeta(name); if result == nil { panic("generated loop metadata is missing") }; return result }
func generatedWrite(context *render.Context, text string, frame *render.Frame, span ast.Span) { generatedPanic(context.Write(text, frame, &span)) }
func generatedEnter(context *render.Context, name string, frame *render.Frame, span ast.Span) { generatedPanic(context.Enter(name, frame, &span)) }
func generatedLimit(runtime *render.RuntimeBindings, kind string, count int, frame *render.Frame, span ast.Span) { generatedPanic(runtime.Limit(kind, count, frame, span)) }
func valueOrZero[T any](input *T) T { if input == nil { var zero T; return zero }; return *input }
func generatedPlain(input any) any { switch item := input.(type) { case *value.OrderedMap: result := map[string]any{}; for _, key := range item.Keys() { entry, _ := item.Get(key); result[key] = generatedPlain(entry) }; return result; case value.List: result := make([]any, len(item)); for index, entry := range item { result[index] = generatedPlain(entry) }; return result; default: return input } }
func generatedDecode(input any, output any) error { data, err := json.Marshal(generatedPlain(input)); if err != nil { return err }; return json.Unmarshal(data, output) }
func generatedEnv(options template.RenderOptions) functions.Env { env := functions.Env{Timezone: "Z", Now: float64(time.Now().Unix())}; if options.Env != nil { if options.Env.Timezone != "" { env.Timezone = options.Env.Timezone }; env.Now = options.Env.Now }; return env }
func render_content_tpl(assign Assign, definitions *Definitions, input Input_content_tpl, context *render.Context, runtime *render.RuntimeBindings, rootData *value.OrderedMap, scope *render.Scope) {
	frame := render.NewFrame("content.tpl", errs.LineIndex{0, 10, 29, 64, 105, 164, 175}, rootData)
scope.Locals["title"] = generatedValue(input.Title)
scope.Locals["root_label"] = generatedValue(input.Root_label)
scope.Locals["defined_label"] = generatedValue(input.Defined_label)
scope.Locals["layout_local"] = generatedValue(input.Layout_local)
    generatedWrite(context, "<article>\n<h1>", frame, ast.Span{0, 14})
    generatedWrite(context, generatedEscape(runtime, generatedResult[string](scope.Lookup(frame, "title")), frame, ast.Span{17, 22}), frame, ast.Span{14, 23})
    generatedWrite(context, "</h1>\n<p class=\"root\">", frame, ast.Span{23, 45})
    generatedWrite(context, generatedEscape(runtime, generatedResult[string](scope.Lookup(frame, "root_label")), frame, ast.Span{48, 58}), frame, ast.Span{45, 59})
    generatedWrite(context, "</p>\n<p class=\"defined\">", frame, ast.Span{59, 83})
    generatedWrite(context, generatedEscape(runtime, generatedResult[string](scope.Lookup(frame, "defined_label")), frame, ast.Span{86, 99}), frame, ast.Span{83, 100})
    generatedWrite(context, "</p>\n<p class=\"local\">", frame, ast.Span{100, 122})
    generatedWrite(context, generatedEscape(runtime, generatedCall[string](runtime, "default", []value.Value{generatedValue(generatedResult[*string](scope.Lookup(frame, "layout_local"))), generatedValue("missing")}, frame, ast.Span{125, 158}), frame, ast.Span{125, 158}), frame, ast.Span{122, 159})
    generatedWrite(context, "</p>\n</article>\n", frame, ast.Span{159, 175})
}
func render_layout_tpl(assign Assign, definitions *Definitions, input Input_layout_tpl, context *render.Context, runtime *render.RuntimeBindings, rootData *value.OrderedMap, scope *render.Scope) {
	frame := render.NewFrame("layout.tpl", errs.LineIndex{0, 42, 66, 95, 106}, rootData)

    scope.Locals["layout_local"] = generatedValue("visible only in layout")
    generatedWrite(context, "<section class=\"scope\">\n", frame, ast.Span{42, 66})
    { definition := definitions.Content
    if definition == nil { panic(runtime.Error(frame, ast.Span{66, 94}, errs.RuntimeBlockUndefined, "define content is not registered")) }
    if definition != nil && definition.HTML != nil { generatedWrite(context, *definition.HTML, frame, ast.Span{66, 94}) } else {
        input := Input_content_tpl{Root_label: assign.Root_label, Defined_label: assign.Defined_label}
        if definition != nil && definition.Data != nil {
            if definition.Data.Title != nil { input.Title = *definition.Data.Title }
            if definition.Data.Root_label != nil { input.Root_label = *definition.Data.Root_label }
            if definition.Data.Defined_label != nil { input.Defined_label = *definition.Data.Defined_label }
            if definition.Data.Layout_local != nil { input.Layout_local = *definition.Data.Layout_local }
        }
        input.Title = assign.Page.Title
        blockScope := render.NewScope()
        generatedEnter(context, "content.tpl", frame, ast.Span{66, 94})
        func() { defer context.Leave(); render_content_tpl(assign, definitions, input, context, runtime, rootData, blockScope) }()
    }
    }
    generatedWrite(context, "</section>\n", frame, ast.Span{95, 106})
}
func renderTemplate(target string, assign Assign, definitions *Definitions, context *render.Context, runtime *render.RuntimeBindings, rootData *value.OrderedMap, scope *render.Scope) { switch target {
	case "layout.tpl": render_layout_tpl(assign, definitions, Input_layout_tpl{}, context, runtime, rootData, scope); return
	default: panic(context.Fail(errs.LoadNotFound, nil, nil, "template " + target + " does not exist"))
} }
type generatedTarget struct { target string; html *string }
func generatedBindDefinitions(input map[string]template.DefineInput) (*Definitions, map[string]generatedTarget, error) { _ = input; plain := map[string]any{}; targets := map[string]generatedTarget{}; for id, input := range input { _ = input; switch id {
		case "content":
			if input.HTML != nil { if false || input.Template != "" || input.Data != nil { return nil, nil, fmt.Errorf("define.%s has an invalid html entry", id) }; plain[id] = map[string]any{"html": *input.HTML}; targets[id] = generatedTarget{html: input.HTML}; continue }
			if input.Template != "content.tpl" { return nil, nil, fmt.Errorf("define.%s has an invalid template", id) }; plain[id] = map[string]any{"template": input.Template, "data": generatedPlain(input.Data)}; targets[id] = generatedTarget{target: "content.tpl"}
		case "layout":
			if input.HTML != nil { if true || input.Template != "" || input.Data != nil { return nil, nil, fmt.Errorf("define.%s has an invalid html entry", id) }; plain[id] = map[string]any{"html": *input.HTML}; targets[id] = generatedTarget{html: input.HTML}; continue }
			if input.Template != "layout.tpl" { return nil, nil, fmt.Errorf("define.%s has an invalid template", id) }; plain[id] = map[string]any{"template": input.Template, "data": generatedPlain(input.Data)}; targets[id] = generatedTarget{target: "layout.tpl"}
		default: return nil, nil, fmt.Errorf("define.%s is not declared", id)
	} }; var definitions Definitions; if err := generatedDecode(plain, &definitions); err != nil { return nil, nil, err }; return &definitions, targets, nil }
type GeneratedProgram struct { Runtime *template.RuntimeEnvironment }
func NewGeneratedProgram(options template.Options) (*GeneratedProgram, error) { runtime, err := template.NewRuntimeEnvironment(options.Limits, options.Functions); if err != nil { return nil, err }; return &GeneratedProgram{Runtime: runtime}, nil }
type generatedPrepared struct { target string; assign Assign; definitions *Definitions; rootData *value.OrderedMap; env functions.Env; runtime *template.RuntimeEnvironment; html *string }
func (p *generatedPrepared) Render() (output string, err error) { defer func() { if failure := recover(); failure != nil { if failureError, ok := failure.(error); ok { err = failureError } else { panic(failure) } } }(); context := render.NewContext(p.runtime, p.rootData, p.env, p.target); runtime := render.NewRuntimeBindings(context); scope := render.NewScope(); if err := context.Enter(p.target, nil, nil); err != nil { return "", err }; defer context.Leave(); if p.html != nil { if err := context.Write(*p.html, nil, nil); err != nil { return "", err } } else { renderTemplate(p.target, p.assign, p.definitions, context, runtime, p.rootData, scope) }; return context.Output(), nil }
func (p *GeneratedProgram) Prepare(target any, assign any, options template.RenderOptions) (template.Prepared, error) { name, ok := target.(string); if !ok { return nil, fmt.Errorf("generated target must be a template name") }; rootData, err := value.BindMap(assign); if err != nil { return nil, err }; var typedAssign Assign; if err := generatedDecode(rootData, &typedAssign); err != nil { return nil, err }; definitions, targets, err := generatedBindDefinitions(options.Define); if err != nil { return nil, err }; resolved := targets[name]; targetName := name; if resolved.target != "" { targetName = resolved.target }; return &generatedPrepared{target: targetName, assign: typedAssign, definitions: definitions, rootData: rootData, env: generatedEnv(options), runtime: p.Runtime, html: resolved.html}, nil }
func (p *GeneratedProgram) Render(target any, assign any, options template.RenderOptions) (string, error) { prepared, err := p.Prepare(target, assign, options); if err != nil { return "", err }; return prepared.Render() }
var _ template.Program = (*GeneratedProgram)(nil)
