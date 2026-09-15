// Generated.
package generated
import ("bytes"; "encoding/json"; "fmt"; "time"; template "github.com/polyspec/template"; "github.com/polyspec/template/ast"; "github.com/polyspec/template/errs"; "github.com/polyspec/template/functions"; "github.com/polyspec/template/render"; "github.com/polyspec/template/value")
type Page struct { Title string `json:"title"` }
type Row struct { Name string `json:"name"` }
type Slot struct { Template *string `json:"template"`; Html *string `json:"html"` }
type Assign struct {
	Flag bool `json:"flag"`
	Dangerous string `json:"dangerous"`
	Empty_list []string `json:"empty_list"`
	Empty_map OrderedMap[string, string] `json:"empty_map"`
	Page Page `json:"page"`
	Numbers []float64 `json:"numbers"`
	Lookup OrderedMap[string, string] `json:"lookup"`
	Rows []Row `json:"rows"`
}
type Input_card_tpl struct { Label string `json:"label"` }
type Input_layout_tpl struct {  }
type Input_partial_tpl struct { Values []float64 `json:"values"` }
type DefinitionData_card_tpl struct { Label *string `json:"label"` }
type DefinitionData_layout_tpl struct {  }
type DefinitionData_partial_tpl struct { Values *[]float64 `json:"values"` }
type Definition[T any] struct { Template string `json:"template"`; HTML *string `json:"html"`; Data *T `json:"data"` }
type Definitions struct { Content *Definition[DefinitionData_card_tpl] `json:"content"`; Layout *Definition[DefinitionData_layout_tpl] `json:"layout"` }
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
func render_card_tpl(assign Assign, definitions *Definitions, input Input_card_tpl, context *render.Context, runtime *render.RuntimeBindings, rootData *value.OrderedMap, scope *render.Scope) {
	frame := render.NewFrame("card.tpl", errs.LineIndex{0, 30}, rootData)
scope.Locals["label"] = generatedValue(input.Label)
    generatedWrite(context, "<p class=\"card\">", frame, ast.Span{0, 16})
    generatedWrite(context, generatedEscape(runtime, generatedResult[string](scope.Lookup(frame, "label")), frame, ast.Span{19, 24}), frame, ast.Span{16, 25})
    generatedWrite(context, "</p>\n", frame, ast.Span{25, 30})
}
func render_layout_tpl(assign Assign, definitions *Definitions, input Input_layout_tpl, context *render.Context, runtime *render.RuntimeBindings, rootData *value.OrderedMap, scope *render.Scope) {
	frame := render.NewFrame("layout.tpl", errs.LineIndex{0, 29, 66, 76, 100, 137, 191, 268, 305, 392, 463, 468, 483, 563, 567, 582, 586, 592, 608, 655, 684, 695}, rootData)

    scope.Locals["values"] = generatedValue(func() []float64 { result := []float64{}; result = append(result, float64(0)); result = append(result, generatedListSpread[float64](runtime, assign.Numbers, frame, ast.Span{16, 26})...); return result }())
    scope.Locals["merged"] = generatedValue(func() OrderedMap[string, string] { result := NewOrderedMap[string, string](); for _, entry := range generatedMapSpread[string, string](runtime, assign.Lookup, frame, ast.Span{42, 51}).Entries() { result.Set(entry.Key, entry.Value) }; result.Set("z", "Z"); return result }())
    generatedWrite(context, "<section>\n<h1>", frame, ast.Span{66, 80})
    generatedWrite(context, generatedEscape(runtime, assign.Page.Title, frame, ast.Span{83, 93}), frame, ast.Span{80, 94})
    generatedWrite(context, "</h1>\n<p class=\"escaped\">", frame, ast.Span{94, 119})
    generatedWrite(context, generatedEscape(runtime, assign.Dangerous, frame, ast.Span{122, 131}), frame, ast.Span{119, 132})
    generatedWrite(context, "</p>\n<p class=\"logical\">", frame, ast.Span{132, 156})
    generatedWrite(context, generatedEscape(runtime, func() bool { left := assign.Flag; if !generatedTruthy(runtime, left) { return false }; return generatedTruthy(runtime, "x") }(), frame, ast.Span{159, 170}), frame, ast.Span{156, 171})
    generatedWrite(context, "|", frame, ast.Span{171, 172})
    generatedWrite(context, generatedEscape(runtime, func() bool { left := false; if generatedTruthy(runtime, left) { return true }; return generatedTruthy(runtime, float64(2)) }(), frame, ast.Span{175, 185}), frame, ast.Span{172, 186})
    generatedWrite(context, "</p>\n<p class=\"empty-truthiness\">", frame, ast.Span{186, 219})
    generatedWrite(context, generatedEscape(runtime, func() bool { left := assign.Empty_list; if !generatedTruthy(runtime, left) { return false }; return generatedTruthy(runtime, assign.Flag) }(), frame, ast.Span{222, 240}), frame, ast.Span{219, 241})
    generatedWrite(context, "|", frame, ast.Span{241, 242})
    generatedWrite(context, generatedEscape(runtime, func() bool { left := assign.Empty_map; if !generatedTruthy(runtime, left) { return false }; return generatedTruthy(runtime, assign.Flag) }(), frame, ast.Span{245, 262}), frame, ast.Span{242, 263})
    generatedWrite(context, "</p>\n<p>", frame, ast.Span{263, 271})
    generatedWrite(context, generatedEscape(runtime, generatedIndex[*float64](runtime, generatedResult[[]float64](scope.Lookup(frame, "values")), float64(1)), frame, ast.Span{274, 283}), frame, ast.Span{271, 284})
    generatedWrite(context, "|", frame, ast.Span{284, 285})
    generatedWrite(context, generatedEscape(runtime, generatedIndex[*string](runtime, generatedResult[OrderedMap[string, string]](scope.Lookup(frame, "merged")), "z"), frame, ast.Span{288, 299}), frame, ast.Span{285, 300})
    generatedWrite(context, "</p>\n", frame, ast.Span{300, 305})
	if generatedTruthy(runtime, func() bool { left := assign.Flag; if !generatedTruthy(runtime, left) { return false }; return generatedTruthy(runtime, generatedBinary[bool](runtime, "==", assign.Page.Title, "Guide", frame, ast.Span{316, 337})) }()) {
        generatedWrite(context, "<strong>matched</strong>", frame, ast.Span{338, 362})	} else {
        generatedWrite(context, "<strong>missed</strong>", frame, ast.Span{365, 388})
	}
    generatedWrite(context, "\n<p>", frame, ast.Span{391, 395})
    generatedWrite(context, generatedEscape(runtime, func() string { if generatedTruthy(runtime, assign.Flag) { return "yes" }; return "no" }(), frame, ast.Span{398, 417}), frame, ast.Span{395, 418})
    generatedWrite(context, "|", frame, ast.Span{418, 419})
    generatedWrite(context, generatedEscape(runtime, generatedBinary[float64](runtime, "+", generatedUnary[float64](runtime, "-", float64(1), frame, ast.Span{422, 424}), float64(3), frame, ast.Span{422, 428}), frame, ast.Span{422, 428}), frame, ast.Span{419, 429})
    generatedWrite(context, "|", frame, ast.Span{429, 430})
    generatedWrite(context, generatedEscape(runtime, generatedCall[string](runtime, "default", []value.Value{generatedValue(""), generatedValue("fallback")}, frame, ast.Span{433, 457}), frame, ast.Span{433, 457}), frame, ast.Span{430, 458})
    generatedWrite(context, "</p>\n<ul>\n", frame, ast.Span{458, 468})
    { entries := generatedEntries(runtime, assign.Rows, frame, ast.Span{468, 585})
    entriesSize := len(entries)
    lastIndex := entriesSize - 1
    previous, hadPrevious := scope.Locals["row"]
    for row_index, entry := range entries {
        row_key, row_value := entry.Key, entry.Value
        scope.Locals["row"] = row_value
        scope.Loops["row"] = append(scope.Loops["row"], &render.LoopMeta{Index: row_index, Key: row_key, Value: row_value, Size: entriesSize, First: row_index == 0, Last: row_index == lastIndex})
        context.Iterations++
        generatedLimit(runtime, "iteration", context.Iterations, frame, ast.Span{468, 585})
            generatedWrite(context, "<li>", frame, ast.Span{483, 487})
            generatedWrite(context, generatedEscape(runtime, generatedLoopMeta(scope, "row").Index, frame, ast.Span{490, 500}), frame, ast.Span{487, 501})
            generatedWrite(context, "/", frame, ast.Span{501, 502})
            generatedWrite(context, generatedEscape(runtime, generatedLoopMeta(scope, "row").Size, frame, ast.Span{505, 514}), frame, ast.Span{502, 515})
            generatedWrite(context, ":", frame, ast.Span{515, 516})
            generatedWrite(context, generatedEscape(runtime, generatedResult[Row](scope.Lookup(frame, "row")).Name, frame, ast.Span{519, 527}), frame, ast.Span{516, 528})
            generatedWrite(context, ":", frame, ast.Span{528, 529})
            generatedWrite(context, generatedEscape(runtime, generatedLoopMeta(scope, "row").First, frame, ast.Span{532, 542}), frame, ast.Span{529, 543})
            generatedWrite(context, ":", frame, ast.Span{543, 544})
            generatedWrite(context, generatedEscape(runtime, generatedLoopMeta(scope, "row").Last, frame, ast.Span{547, 556}), frame, ast.Span{544, 557})
            generatedWrite(context, "</li>\n", frame, ast.Span{557, 563})
        scope.Loops["row"] = scope.Loops["row"][:len(scope.Loops["row"])-1]
    }
    if hadPrevious { scope.Locals["row"] = previous } else { delete(scope.Locals, "row") }
    if entriesSize == 0 {
            generatedWrite(context, "<li>empty</li>\n", frame, ast.Span{567, 582})
    }
    }
    generatedWrite(context, "</ul>\n", frame, ast.Span{586, 592})
    generatedEnter(context, "partial.tpl", frame, ast.Span{592, 607})
    func() { defer context.Leave(); render_partial_tpl(assign, definitions, Input_partial_tpl{Values: generatedResult[[]float64](scope.Lookup(frame, "values"))}, context, runtime, rootData, scope) }()
    if definitions.Content != nil {
            generatedWrite(context, "<p>defined</p>", frame, ast.Span{620, 634})
    } else {
            generatedWrite(context, "<p>missing</p>", frame, ast.Span{637, 651})
    }
    generatedWrite(context, "\n", frame, ast.Span{654, 655})
    { definition := definitions.Content
    if definition == nil { panic(runtime.Error(frame, ast.Span{655, 683}, errs.RuntimeBlockUndefined, "define content is not registered")) }
    if definition != nil && definition.HTML != nil { generatedWrite(context, *definition.HTML, frame, ast.Span{655, 683}) } else {
        input := Input_card_tpl{}
        if definition != nil && definition.Data != nil {
            if definition.Data.Label != nil { input.Label = *definition.Data.Label }
        }
        input.Label = assign.Page.Title
        blockScope := render.NewScope()
        generatedEnter(context, "card.tpl", frame, ast.Span{655, 683})
        func() { defer context.Leave(); render_card_tpl(assign, definitions, input, context, runtime, rootData, blockScope) }()
    }
    }
    generatedWrite(context, "</section>\n", frame, ast.Span{684, 695})
}
func render_partial_tpl(assign Assign, definitions *Definitions, input Input_partial_tpl, context *render.Context, runtime *render.RuntimeBindings, rootData *value.OrderedMap, scope *render.Scope) {
	frame := render.NewFrame("partial.tpl", errs.LineIndex{0, 38}, rootData)
scope.Locals["values"] = generatedValue(input.Values)
    generatedWrite(context, "<p class=\"included\">", frame, ast.Span{0, 20})
    generatedWrite(context, generatedEscape(runtime, generatedIndex[*float64](runtime, generatedResult[[]float64](scope.Lookup(frame, "values")), float64(2)), frame, ast.Span{23, 32}), frame, ast.Span{20, 33})
    generatedWrite(context, "</p>\n", frame, ast.Span{33, 38})
}
func renderTemplate(target string, assign Assign, definitions *Definitions, context *render.Context, runtime *render.RuntimeBindings, rootData *value.OrderedMap, scope *render.Scope) { switch target {
	case "layout.tpl": render_layout_tpl(assign, definitions, Input_layout_tpl{}, context, runtime, rootData, scope); return
	default: panic(context.Fail(errs.LoadNotFound, nil, nil, "template " + target + " does not exist"))
} }
type generatedTarget struct { target string; html *string }
func generatedBindDefinitions(input map[string]template.DefineInput) (*Definitions, map[string]generatedTarget, error) { _ = input; plain := map[string]any{}; targets := map[string]generatedTarget{}; for id, input := range input { _ = input; switch id {
		case "content":
			if input.HTML != nil { if false || input.Template != "" || input.Data != nil { return nil, nil, fmt.Errorf("define.%s has an invalid html entry", id) }; plain[id] = map[string]any{"html": *input.HTML}; targets[id] = generatedTarget{html: input.HTML}; continue }
			if input.Template != "card.tpl" { return nil, nil, fmt.Errorf("define.%s has an invalid template", id) }; plain[id] = map[string]any{"template": input.Template, "data": generatedPlain(input.Data)}; targets[id] = generatedTarget{target: "card.tpl"}
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
