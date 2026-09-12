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
type Definition[T any] struct { HTML *string `json:"html"`; Data *T `json:"data"` }
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
func render_card_tpl(assign Assign, definitions Definitions, input Input_card_tpl, context *render.Context, runtime *render.RuntimeBindings, rootData *value.OrderedMap) {
	frame := render.NewFrame("card.tpl", errs.LineIndex{0, 30}, rootData)
label := input.Label
    generatedWrite(context, "<p class=\"card\">", frame, ast.Span{0, 16})
    generatedWrite(context, generatedEscape(runtime, label, frame, ast.Span{19, 24}), frame, ast.Span{16, 25})
    generatedWrite(context, "</p>\n", frame, ast.Span{25, 30})
}
func render_layout_tpl(assign Assign, definitions Definitions, input Input_layout_tpl, context *render.Context, runtime *render.RuntimeBindings, rootData *value.OrderedMap) {
	frame := render.NewFrame("layout.tpl", errs.LineIndex{0, 27, 62, 72, 96, 133, 187, 264, 301, 388, 459, 464, 479, 559, 563, 578, 582, 588, 604, 651, 680, 691}, rootData)

    values := func() []float64 { result := []float64{}; result = append(result, float64(0)); result = append(result, assign.Numbers...); return result }()
    _ = values
    merged := func() OrderedMap[string, string] { result := NewOrderedMap[string, string](); for _, entry := range assign.Lookup.Entries() { result.Set(entry.Key, entry.Value) }; result.Set("z", "Z"); return result }()
    _ = merged
    generatedWrite(context, "<section>\n<h1>", frame, ast.Span{62, 76})
    generatedWrite(context, generatedEscape(runtime, assign.Page.Title, frame, ast.Span{79, 89}), frame, ast.Span{76, 90})
    generatedWrite(context, "</h1>\n<p class=\"escaped\">", frame, ast.Span{90, 115})
    generatedWrite(context, generatedEscape(runtime, assign.Dangerous, frame, ast.Span{118, 127}), frame, ast.Span{115, 128})
    generatedWrite(context, "</p>\n<p class=\"logical\">", frame, ast.Span{128, 152})
    generatedWrite(context, generatedEscape(runtime, func() bool { left := assign.Flag; if !generatedTruthy(runtime, left) { return false }; return generatedTruthy(runtime, "x") }(), frame, ast.Span{155, 166}), frame, ast.Span{152, 167})
    generatedWrite(context, "|", frame, ast.Span{167, 168})
    generatedWrite(context, generatedEscape(runtime, func() bool { left := false; if generatedTruthy(runtime, left) { return true }; return generatedTruthy(runtime, float64(2)) }(), frame, ast.Span{171, 181}), frame, ast.Span{168, 182})
    generatedWrite(context, "</p>\n<p class=\"empty-truthiness\">", frame, ast.Span{182, 215})
    generatedWrite(context, generatedEscape(runtime, func() bool { left := assign.Empty_list; if !generatedTruthy(runtime, left) { return false }; return generatedTruthy(runtime, assign.Flag) }(), frame, ast.Span{218, 236}), frame, ast.Span{215, 237})
    generatedWrite(context, "|", frame, ast.Span{237, 238})
    generatedWrite(context, generatedEscape(runtime, func() bool { left := assign.Empty_map; if !generatedTruthy(runtime, left) { return false }; return generatedTruthy(runtime, assign.Flag) }(), frame, ast.Span{241, 258}), frame, ast.Span{238, 259})
    generatedWrite(context, "</p>\n<p>", frame, ast.Span{259, 267})
    generatedWrite(context, generatedEscape(runtime, generatedIndex[float64](runtime, values, float64(1)), frame, ast.Span{270, 279}), frame, ast.Span{267, 280})
    generatedWrite(context, "|", frame, ast.Span{280, 281})
    generatedWrite(context, generatedEscape(runtime, generatedIndex[string](runtime, merged, "z"), frame, ast.Span{284, 295}), frame, ast.Span{281, 296})
    generatedWrite(context, "</p>\n", frame, ast.Span{296, 301})
	if generatedTruthy(runtime, func() bool { left := assign.Flag; if !generatedTruthy(runtime, left) { return false }; return generatedTruthy(runtime, generatedBinary[bool](runtime, "==", assign.Page.Title, "Guide", frame, ast.Span{312, 333})) }()) {
        generatedWrite(context, "<strong>matched</strong>", frame, ast.Span{334, 358})	} else {
        generatedWrite(context, "<strong>missed</strong>", frame, ast.Span{361, 384})
	}
    generatedWrite(context, "\n<p>", frame, ast.Span{387, 391})
    generatedWrite(context, generatedEscape(runtime, func() string { if generatedTruthy(runtime, assign.Flag) { return "yes" }; return "no" }(), frame, ast.Span{394, 413}), frame, ast.Span{391, 414})
    generatedWrite(context, "|", frame, ast.Span{414, 415})
    generatedWrite(context, generatedEscape(runtime, generatedBinary[float64](runtime, "+", generatedUnary[float64](runtime, "-", float64(1), frame, ast.Span{418, 420}), float64(3), frame, ast.Span{418, 424}), frame, ast.Span{418, 424}), frame, ast.Span{415, 425})
    generatedWrite(context, "|", frame, ast.Span{425, 426})
    generatedWrite(context, generatedEscape(runtime, generatedCall[string](runtime, "default", []value.Value{generatedValue(""), generatedValue("fallback")}, frame, ast.Span{429, 453}), frame, ast.Span{429, 453}), frame, ast.Span{426, 454})
    generatedWrite(context, "</p>\n<ul>\n", frame, ast.Span{454, 464})
    { entries := assign.Rows
    for row_index, entry := range entries {
        row_key, row_value := float64(row_index), entry
        _ = row_key
        row := row_value
        row_size := float64(len(entries))
        row_first := row_index == 0
        row_last := row_index + 1 == len(entries)
        context.Iterations++
        generatedLimit(runtime, "iteration", context.Iterations, frame, ast.Span{464, 581})
            generatedWrite(context, "<li>", frame, ast.Span{479, 483})
            generatedWrite(context, generatedEscape(runtime, row_index, frame, ast.Span{486, 496}), frame, ast.Span{483, 497})
            generatedWrite(context, "/", frame, ast.Span{497, 498})
            generatedWrite(context, generatedEscape(runtime, row_size, frame, ast.Span{501, 510}), frame, ast.Span{498, 511})
            generatedWrite(context, ":", frame, ast.Span{511, 512})
            generatedWrite(context, generatedEscape(runtime, row.Name, frame, ast.Span{515, 523}), frame, ast.Span{512, 524})
            generatedWrite(context, ":", frame, ast.Span{524, 525})
            generatedWrite(context, generatedEscape(runtime, row_first, frame, ast.Span{528, 538}), frame, ast.Span{525, 539})
            generatedWrite(context, ":", frame, ast.Span{539, 540})
            generatedWrite(context, generatedEscape(runtime, row_last, frame, ast.Span{543, 552}), frame, ast.Span{540, 553})
            generatedWrite(context, "</li>\n", frame, ast.Span{553, 559})
    }
    if len(entries) == 0 {
            generatedWrite(context, "<li>empty</li>\n", frame, ast.Span{563, 578})
    }
    }
    generatedWrite(context, "</ul>\n", frame, ast.Span{582, 588})
    generatedEnter(context, "partial.tpl", frame, ast.Span{588, 603})
    func() { defer context.Leave(); render_partial_tpl(assign, definitions, Input_partial_tpl{Values: values}, context, runtime, rootData) }()
    if definitions.Content != nil {
            generatedWrite(context, "<p>defined</p>", frame, ast.Span{616, 630})
    } else {
            generatedWrite(context, "<p>missing</p>", frame, ast.Span{633, 647})
    }
    generatedWrite(context, "\n", frame, ast.Span{650, 651})
    { definition := definitions.Content
    if definition == nil { panic(runtime.Error(frame, ast.Span{651, 679}, errs.RuntimeBlockUndefined, "define content is not registered")) }
    if definition != nil && definition.HTML != nil { generatedWrite(context, *definition.HTML, frame, ast.Span{651, 679}) } else {
        input := Input_card_tpl{}
        if definition != nil && definition.Data != nil {
            if definition.Data.Label != nil { input.Label = *definition.Data.Label }
        }
        input.Label = assign.Page.Title
        generatedEnter(context, "card.tpl", frame, ast.Span{651, 679})
        func() { defer context.Leave(); render_card_tpl(assign, definitions, input, context, runtime, rootData) }()
    }
    }
    generatedWrite(context, "</section>\n", frame, ast.Span{680, 691})
}
func render_partial_tpl(assign Assign, definitions Definitions, input Input_partial_tpl, context *render.Context, runtime *render.RuntimeBindings, rootData *value.OrderedMap) {
	frame := render.NewFrame("partial.tpl", errs.LineIndex{0, 38}, rootData)
values := input.Values
    generatedWrite(context, "<p class=\"included\">", frame, ast.Span{0, 20})
    generatedWrite(context, generatedEscape(runtime, generatedIndex[float64](runtime, values, float64(2)), frame, ast.Span{23, 32}), frame, ast.Span{20, 33})
    generatedWrite(context, "</p>\n", frame, ast.Span{33, 38})
}
func renderTemplate(target string, assign Assign, definitions Definitions, context *render.Context, runtime *render.RuntimeBindings, rootData *value.OrderedMap) { switch target {
	case "layout.tpl": render_layout_tpl(assign, definitions, Input_layout_tpl{}, context, runtime, rootData); return
	default: panic(context.Fail(errs.LoadNotFound, nil, nil, "template " + target + " does not exist"))
} }
type generatedTarget struct { target string; html *string }
func generatedBindDefinitions(input map[string]template.DefineInput) (Definitions, map[string]generatedTarget, error) { plain := map[string]any{}; targets := map[string]generatedTarget{}; for id, input := range input { switch id {
		case "content":
			if input.HTML != nil { if false || input.Template != "" || input.Data != nil { return Definitions{}, nil, fmt.Errorf("define.%s has an invalid html entry", id) }; plain[id] = map[string]any{"html": *input.HTML}; targets[id] = generatedTarget{html: input.HTML}; continue }
			if input.Template != "card.tpl" { return Definitions{}, nil, fmt.Errorf("define.%s has an invalid template", id) }; plain[id] = map[string]any{"data": generatedPlain(input.Data)}; targets[id] = generatedTarget{target: "card.tpl"}
		case "layout":
			if input.HTML != nil { if true || input.Template != "" || input.Data != nil { return Definitions{}, nil, fmt.Errorf("define.%s has an invalid html entry", id) }; plain[id] = map[string]any{"html": *input.HTML}; targets[id] = generatedTarget{html: input.HTML}; continue }
			if input.Template != "layout.tpl" { return Definitions{}, nil, fmt.Errorf("define.%s has an invalid template", id) }; plain[id] = map[string]any{"data": generatedPlain(input.Data)}; targets[id] = generatedTarget{target: "layout.tpl"}
		default: return Definitions{}, nil, fmt.Errorf("define.%s is not declared", id)
	} }; var definitions Definitions; if err := generatedDecode(plain, &definitions); err != nil { return Definitions{}, nil, err }; return definitions, targets, nil }
type GeneratedProgram struct { Runtime *template.RuntimeEnvironment }
func NewGeneratedProgram(options template.Options) (*GeneratedProgram, error) { runtime, err := template.NewRuntimeEnvironment(options.Limits, options.Functions); if err != nil { return nil, err }; return &GeneratedProgram{Runtime: runtime}, nil }
type generatedPrepared struct { target string; assign Assign; definitions Definitions; rootData *value.OrderedMap; env functions.Env; runtime *template.RuntimeEnvironment; html *string }
func (p *generatedPrepared) Render() (output string, err error) { defer func() { if failure := recover(); failure != nil { if failureError, ok := failure.(error); ok { err = failureError } else { panic(failure) } } }(); context := render.NewContext(p.runtime, p.rootData, p.env, p.target); runtime := render.NewRuntimeBindings(context); if err := context.Enter(p.target, nil, nil); err != nil { return "", err }; defer context.Leave(); if p.html != nil { if err := context.Write(*p.html, nil, nil); err != nil { return "", err } } else { renderTemplate(p.target, p.assign, p.definitions, context, runtime, p.rootData) }; return context.Output(), nil }
func (p *GeneratedProgram) Prepare(target any, assign any, options template.RenderOptions) (template.Prepared, error) { name, ok := target.(string); if !ok { return nil, fmt.Errorf("generated target must be a template name") }; rootData, err := value.BindMap(assign); if err != nil { return nil, err }; var typedAssign Assign; if err := generatedDecode(rootData, &typedAssign); err != nil { return nil, err }; definitions, targets, err := generatedBindDefinitions(options.Define); if err != nil { return nil, err }; resolved := targets[name]; targetName := name; if resolved.target != "" { targetName = resolved.target }; return &generatedPrepared{target: targetName, assign: typedAssign, definitions: definitions, rootData: rootData, env: generatedEnv(options), runtime: p.Runtime, html: resolved.html}, nil }
func (p *GeneratedProgram) Render(target any, assign any, options template.RenderOptions) (string, error) { prepared, err := p.Prepare(target, assign, options); if err != nil { return "", err }; return prepared.Render() }
var _ template.Program = (*GeneratedProgram)(nil)
