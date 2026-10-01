// Generated.
package generated
import ("bytes"; "encoding/json"; "errors"; "fmt"; "time"; "unicode/utf8"; template "github.com/polyspec/template"; "github.com/polyspec/template/ast"; "github.com/polyspec/template/errs"; "github.com/polyspec/template/functions"; "github.com/polyspec/template/render"; "github.com/polyspec/template/value")

type Assign struct {
	Page string `json:"page"`
}
type Input_layout_tpl struct {  }
type DefinitionData_layout_tpl struct {  }
type Definition[T any] struct { Template string `json:"template"`; HTML *string `json:"html"`; Data *T `json:"data"` }
type Definitions struct { Content *Definition[struct{}] `json:"content"`; Layout *Definition[DefinitionData_layout_tpl] `json:"layout"` }
type ArtifactManifest struct { Schema int; Mode string; Target string; Entry string; SourceDigest string; TypeDigest string; ContractDigest string; Files map[string]string }
type OrderedEntry[K comparable, V any] struct { Key K; Value V }
type OrderedMap[K comparable, V any] struct { entries []OrderedEntry[K, V] }
func NewOrderedMap[K comparable, V any]() OrderedMap[K, V] { return OrderedMap[K, V]{} }
func (m *OrderedMap[K, V]) Set(key K, item V) { for index := range m.entries { if m.entries[index].Key == key { m.entries[index].Value = item; return } }; m.entries = append(m.entries, OrderedEntry[K, V]{key, item}) }
func (m OrderedMap[K, V]) Get(key K) (V, bool) { for _, entry := range m.entries { if entry.Key == key { return entry.Value, true } }; var zero V; return zero, false }
func (m OrderedMap[K, V]) Entries() []OrderedEntry[K, V] { return m.entries }
func (m OrderedMap[K, V]) TemplateValue() value.Value { result := value.NewOrderedMap(); for _, entry := range m.entries { result.Set(fmt.Sprint(entry.Key), generatedValue(entry.Value)) }; return result }
func (m *OrderedMap[K, V]) UnmarshalJSON(data []byte) error { decoder := json.NewDecoder(bytes.NewReader(data)); token, err := decoder.Token(); if err != nil { return err }; if token != json.Delim('{') { return fmt.Errorf("generated ordered map must be an object") }; m.entries = nil; for decoder.More() { rawKey, err := decoder.Token(); if err != nil { return err }; keyText, ok := rawKey.(string); if !ok { return fmt.Errorf("generated ordered map key is not text") }; var key K; if err := json.Unmarshal([]byte(strconvQuote(keyText)), &key); err != nil { return err }; var item V; if err := decoder.Decode(&item); err != nil { return err }; m.Set(key, item) }; _, err = decoder.Token(); return err }
func strconvQuote(input string) string { data, _ := json.Marshal(input); return string(data) }
func generatedPanic(err error) { if err != nil { panic(err) } }
func generatedValue(input any) value.Value { switch item := input.(type) { case nil: return nil; case bool: return item; case float64: return item; case string: return item; case value.SafeString: return item; case value.List: result := make(value.List, len(item)); for index, element := range item { result[index] = generatedValue(element) }; return result; case *value.OrderedMap: return item }; result, err := value.Convert(input); generatedPanic(err); return result }
func generatedResult[T any](input value.Value) T { result, err := generatedAs[T](input); generatedPanic(err); return result }
func generatedAs[T any](input value.Value) (T, error) { if result, ok := input.(T); ok { return result, nil }; var result T; err := generatedDecode(input, &result); return result, err }
func generatedTruthy(runtime *render.RuntimeBindings, input any) bool { return runtime.Truthy(generatedValue(input)) }
func generatedUnary[T any](runtime *render.RuntimeBindings, operator string, input any, frame *render.Frame, span ast.Span) T { result, err := runtime.Unary(operator, generatedValue(input), frame, span); generatedPanic(err); return generatedResult[T](result) }
func generatedBinary[T any](runtime *render.RuntimeBindings, operator string, left, right any, frame *render.Frame, span ast.Span) T { result, err := runtime.Binary(operator, generatedValue(left), generatedValue(right), frame, span); generatedPanic(err); return generatedResult[T](result) }
func generatedMember[T any](runtime *render.RuntimeBindings, input any, key string, frame *render.Frame, span ast.Span) T { result, err := runtime.Member(generatedValue(input), key, frame, span); generatedPanic(err); return generatedResult[T](result) }
func generatedIndex[T any](runtime *render.RuntimeBindings, input, key any, frame *render.Frame, span ast.Span) T { result, err := runtime.Index(generatedValue(input), generatedValue(key), frame, span); generatedPanic(err); return generatedResult[T](result) }
func generatedDepth[T any](runtime *render.RuntimeBindings, input T, frame *render.Frame, span ast.Span) T { _, err := runtime.Depth(generatedValue(input), frame, span); generatedPanic(err); return input }
func generatedMemberCall[T any](runtime *render.RuntimeBindings, input value.Value, method string, args []value.Value, frame *render.Frame, span ast.Span) T { result, err := runtime.MemberCall(input, method, args, frame, span); generatedPanic(err); return generatedResult[T](result) }
func generatedClassCall[T any](runtime *render.RuntimeBindings, className, method string, args []value.Value, frame *render.Frame, span ast.Span) T { result, err := runtime.ClassCall(className, method, args, frame, span); generatedPanic(err); return generatedResult[T](result) }
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
func render_layout_tpl(assign Assign, definitions *Definitions, input Input_layout_tpl, context *render.Context, runtime *render.RuntimeBindings, rootData *value.OrderedMap, scope *render.Scope) {
	frame := render.NewFrame("layout.tpl", errs.LineIndex{0, 26, 39, 51, 55, 99, 103, 111}, rootData)

    generatedWrite(context, "<main class=\"empty-page\">\u000a", frame, ast.Span{0, 26})
    if definitions.Content != nil {
            { definition := definitions.Content
            if definition == nil || definition.HTML == nil { panic(runtime.Error(frame, ast.Span{39, 50}, errs.RuntimeBlockUndefined, "define content is not registered")) }
            generatedWrite(context, *definition.HTML, frame, ast.Span{39, 50})
            }
    } else {
            generatedWrite(context, "<p class=\"empty\">No content definition.</p>\u000a", frame, ast.Span{55, 99})
    }
    generatedWrite(context, "</main>\u000a", frame, ast.Span{103, 111})
}
func renderTemplate(target string, assign Assign, definitions *Definitions, context *render.Context, runtime *render.RuntimeBindings, rootData *value.OrderedMap, scope *render.Scope) { switch target {
	case "layout.tpl": render_layout_tpl(assign, definitions, Input_layout_tpl{}, context, runtime, rootData, scope); return
	default: panic(context.Fail(errs.LoadNotFound, nil, nil, "template " + target + " does not exist"))
} }
type generatedTarget struct { target string; html *string }
func generatedBindDefinitions(input map[string]template.DefineInput) (*Definitions, map[string]generatedTarget, error) { _ = input; definitions := &Definitions{}; targets := map[string]generatedTarget{}; for id, input := range input { _ = input; if !utf8.ValidString(id) { return nil, nil, &value.BindError{Code: errs.DataInvalidUTF8, Message: "a define id is not valid UTF-8"} }; switch id {
		case "content":
			if input.HTML != nil { if false || input.Template != "" || input.Data != nil { return nil, nil, fmt.Errorf("define.%s has an invalid html entry", id) }; definitions.Content = &Definition[struct{}]{HTML: input.HTML}; targets[id] = generatedTarget{html: input.HTML}; continue }
			if input.Template != "" { return nil, nil, fmt.Errorf("define.%s has an invalid template", id) }; entry := &Definition[struct{}]{Template: input.Template}; if input.Data != nil { bound, err := value.Bind(input.Data); if err != nil { return nil, nil, err }; data, ok := bound.(*value.OrderedMap); if !ok { return nil, nil, &value.BindError{Code: errs.DataUnsupportedType, Message: "define " + id + ": data is not a map"} }; definitionData := struct{}{}; ; _ = data; entry.Data = &definitionData }; definitions.Content = entry; targets[id] = generatedTarget{target: ""}
		case "layout":
			if input.HTML != nil { if true || input.Template != "" || input.Data != nil { return nil, nil, fmt.Errorf("define.%s has an invalid html entry", id) }; definitions.Layout = &Definition[DefinitionData_layout_tpl]{HTML: input.HTML}; targets[id] = generatedTarget{html: input.HTML}; continue }
			if input.Template != "layout.tpl" { return nil, nil, fmt.Errorf("define.%s has an invalid template", id) }; entry := &Definition[DefinitionData_layout_tpl]{Template: input.Template}; if input.Data != nil { bound, err := value.Bind(input.Data); if err != nil { return nil, nil, err }; data, ok := bound.(*value.OrderedMap); if !ok { return nil, nil, &value.BindError{Code: errs.DataUnsupportedType, Message: "define " + id + ": data is not a map"} }; definitionData := DefinitionData_layout_tpl{}; ; _ = data; entry.Data = &definitionData }; definitions.Layout = entry; targets[id] = generatedTarget{target: "layout.tpl"}
		default: return nil, nil, fmt.Errorf("define.%s is not declared", id)
	} }; return definitions, targets, nil }
type GeneratedProgram struct { Runtime *template.RuntimeEnvironment }
func NewGeneratedProgram(options template.Options) (*GeneratedProgram, error) { runtime, err := template.NewRuntimeEnvironment(options.Limits, options.Functions); if err != nil { return nil, err }; return &GeneratedProgram{Runtime: runtime}, nil }
type generatedPrepared struct { name string; target string; assign Assign; definitions *Definitions; rootData *value.OrderedMap; env functions.Env; runtime *template.RuntimeEnvironment; html *string }
func (p *generatedPrepared) Render() (string, error) { return render.Guard(p.name, p.render) }
func (p *generatedPrepared) render() (string, error) { context := render.NewContext(p.runtime, p.rootData, p.env, p.target); runtime := render.NewRuntimeBindings(context); scope := render.NewScope(); if err := context.Enter(p.target, nil, nil); err != nil { return "", err }; defer context.Leave(); if p.html != nil { if err := context.Write(*p.html, nil, nil); err != nil { return "", err } } else { renderTemplate(p.target, p.assign, p.definitions, context, runtime, p.rootData, scope) }; return context.Output(), nil }
func (p *GeneratedProgram) Prepare(target any, assign any, options template.RenderOptions) (template.Prepared, error) { name, ok := target.(string); if !ok { return nil, fmt.Errorf("generated target must be a template name") }; return render.Guard(name, func() (template.Prepared, error) { return p.prepare(name, assign, options) }) }
func generatedBindFailure(name string, err error) error { var bindError *value.BindError; if errors.As(err, &bindError) { return errs.WithoutPosition(bindError.Code, name, bindError.Message) }; return err }
func (p *GeneratedProgram) prepare(name string, assign any, options template.RenderOptions) (template.Prepared, error) { rootData, err := value.BindMap(assign); if err != nil { return nil, generatedBindFailure(name, err) }; var typedAssign Assign; if err := generatedDecode(rootData, &typedAssign); err != nil { return nil, err }; definitions, targets, err := generatedBindDefinitions(options.Define); if err != nil { return nil, generatedBindFailure(name, err) }; resolved := targets[name]; targetName := name; if resolved.target != "" { targetName = resolved.target }; return &generatedPrepared{name: name, target: targetName, assign: typedAssign, definitions: definitions, rootData: rootData, env: generatedEnv(options), runtime: p.Runtime, html: resolved.html}, nil }
func (p *GeneratedProgram) Render(target any, assign any, options template.RenderOptions) (string, error) { prepared, err := p.Prepare(target, assign, options); if err != nil { return "", err }; return prepared.Render() }
var _ template.Program = (*GeneratedProgram)(nil)
