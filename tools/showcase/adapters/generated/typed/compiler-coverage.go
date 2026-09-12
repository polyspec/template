// Generated.
package generated
import ("bytes"; "encoding/json"; "fmt"; "reflect"; "strings"; template "github.com/polyspec/template"; "github.com/polyspec/template/value")
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
func (m *OrderedMap[K, V]) Set(key K, value V) { for index := range m.entries { if m.entries[index].Key == key { m.entries[index].Value = value; return } }; m.entries = append(m.entries, OrderedEntry[K, V]{key, value}) }
func (m OrderedMap[K, V]) Get(key K) (V, bool) { for _, entry := range m.entries { if entry.Key == key { return entry.Value, true } }; var zero V; return zero, false }
func (m OrderedMap[K, V]) Entries() []OrderedEntry[K, V] { return m.entries }
func (m *OrderedMap[K, V]) UnmarshalJSON(data []byte) error { decoder := json.NewDecoder(bytes.NewReader(data)); token, err := decoder.Token(); if err != nil { return err }; if token != json.Delim('{') { return fmt.Errorf("generated ordered map must be an object") }; m.entries = nil; for decoder.More() { rawKey, err := decoder.Token(); if err != nil { return err }; keyText, ok := rawKey.(string); if !ok { return fmt.Errorf("generated ordered map key is not text") }; var key K; if err := json.Unmarshal([]byte(strconvQuote(keyText)), &key); err != nil { return err }; var item V; if err := decoder.Decode(&item); err != nil { return err }; m.Set(key, item) }; _, err = decoder.Token(); return err }
func strconvQuote(value string) string { data, _ := json.Marshal(value); return string(data) }
func generatedMapGet[K comparable, V any](value OrderedMap[K, V], key K) V { result, _ := value.Get(key); return result }
func generatedListGet[T any](value []T, index int) T { if index >= 0 && index < len(value) { return value[index] }; var zero T; return zero }
func generatedTernary[T any](test bool, yes, no T) T { if test { return yes }; return no }
func generatedEscape(value any) string { if value == nil { return "" }; return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "\"", "&quot;", "'", "&#39;").Replace(fmt.Sprint(value)) }
func generatedTruthy(value any) bool { if value == nil { return false }; reflected := reflect.ValueOf(value); switch reflected.Kind() { case reflect.Bool: return reflected.Bool(); case reflect.Float32, reflect.Float64: return reflected.Float() != 0; case reflect.String, reflect.Array, reflect.Slice, reflect.Map: return reflected.Len() != 0; case reflect.Struct: field := reflected.FieldByName("entries"); if field.IsValid() { return field.Len() != 0 } }; return true }
func generatedUnary(op string, value any) any { if op == "!" { return !generatedTruthy(value) }; return -value.(float64) }
func generatedBinary(op string, left, right any) any { switch op { case "&&": return generatedTruthy(left) && generatedTruthy(right); case "||": return generatedTruthy(left) || generatedTruthy(right); case "??": if left != nil { return left }; return right; case "==", "===": return fmt.Sprint(left) == fmt.Sprint(right); case "!=", "!==": return fmt.Sprint(left) != fmt.Sprint(right); case "+": if _, ok := left.(string); ok { return fmt.Sprint(left)+fmt.Sprint(right) }; if _, ok := right.(string); ok { return fmt.Sprint(left)+fmt.Sprint(right) }; return left.(float64)+right.(float64); case "-": return left.(float64)-right.(float64); case "*": return left.(float64)*right.(float64); case "/": return left.(float64)/right.(float64); case "%": return float64(int64(left.(float64))%int64(right.(float64))); case "<": return fmt.Sprint(left) < fmt.Sprint(right); case ">": return fmt.Sprint(left) > fmt.Sprint(right); case "<=": return fmt.Sprint(left) <= fmt.Sprint(right); case ">=": return fmt.Sprint(left) >= fmt.Sprint(right) }; panic("unsupported generated operator: "+op) }
func generatedDefault(value, fallback any) any { if generatedTruthy(value) { return value }; return fallback }
func valueOrZero[T any](value *T) T { if value == nil { var zero T; return zero }; return *value }
func generatedPlain(input any) any { switch item := input.(type) { case *value.OrderedMap: result := map[string]any{}; for _, key := range item.Keys() { entry, _ := item.Get(key); result[key] = generatedPlain(entry) }; return result; case value.List: result := make([]any, len(item)); for index, entry := range item { result[index] = generatedPlain(entry) }; return result; default: return input } }
func generatedDecode(input any, output any) error { data, err := json.Marshal(generatedPlain(input)); if err != nil { return err }; return json.Unmarshal(data, output) }
func render_card_tpl(assign Assign, definitions Definitions, input Input_card_tpl) string { var out strings.Builder
label := input.Label
    out.WriteString("<p class=\"card\">")
    out.WriteString(generatedEscape(label))
    out.WriteString("</p>\n")
 return out.String() }
func render_layout_tpl(assign Assign, definitions Definitions, input Input_layout_tpl) string { var out strings.Builder

    values := func() []float64 { result := []float64{}; result = append(result, float64(0)); result = append(result, assign.Numbers...); return result }()
    _ = values
    merged := func() OrderedMap[string, string] { result := NewOrderedMap[string, string](); for _, entry := range assign.Lookup.Entries() { result.Set(entry.Key, entry.Value) }; result.Set("z", "Z"); return result }()
    _ = merged
    out.WriteString("<section>\n<h1>")
    out.WriteString(generatedEscape(assign.Page.Title))
    out.WriteString("</h1>\n<p class=\"escaped\">")
    out.WriteString(generatedEscape(assign.Dangerous))
    out.WriteString("</p>\n<p class=\"logical\">")
    out.WriteString(generatedEscape(generatedBinary("&&", assign.Flag, "x")))
    out.WriteString("|")
    out.WriteString(generatedEscape(generatedBinary("||", false, float64(2))))
    out.WriteString("</p>\n<p class=\"empty-truthiness\">")
    out.WriteString(generatedEscape(generatedBinary("&&", assign.Empty_list, assign.Flag)))
    out.WriteString("|")
    out.WriteString(generatedEscape(generatedBinary("&&", assign.Empty_map, assign.Flag)))
    out.WriteString("</p>\n<p>")
    out.WriteString(generatedEscape(generatedListGet(values, int(float64(1)))))
    out.WriteString("|")
    out.WriteString(generatedEscape(generatedMapGet(merged, "z")))
    out.WriteString("</p>\n")
	if generatedTruthy(generatedBinary("&&", assign.Flag, generatedBinary("==", assign.Page.Title, "Guide"))) {
        out.WriteString("<strong>matched</strong>")	} else {
        out.WriteString("<strong>missed</strong>")
	}
    out.WriteString("\n<p>")
    out.WriteString(generatedEscape(generatedTernary(generatedTruthy(assign.Flag), "yes", "no")))
    out.WriteString("|")
    out.WriteString(generatedEscape(generatedBinary("+", generatedUnary("-", float64(1)), float64(3))))
    out.WriteString("|")
    out.WriteString(generatedEscape(generatedDefault("", "fallback")))
    out.WriteString("</p>\n<ul>\n")
    { entries := assign.Rows
    for row_index, entry := range entries {
        row_key, row_value := float64(row_index), entry
        _ = row_key
        row := row_value
        row_size := float64(len(entries))
        row_first := row_index == 0
        row_last := row_index + 1 == len(entries)
            out.WriteString("<li>")
            out.WriteString(generatedEscape(row_index))
            out.WriteString("/")
            out.WriteString(generatedEscape(row_size))
            out.WriteString(":")
            out.WriteString(generatedEscape(row.Name))
            out.WriteString(":")
            out.WriteString(generatedEscape(row_first))
            out.WriteString(":")
            out.WriteString(generatedEscape(row_last))
            out.WriteString("</li>\n")
    }
    if len(entries) == 0 {
            out.WriteString("<li>empty</li>\n")
    }
    }
    out.WriteString("</ul>\n")
    out.WriteString(render_partial_tpl(assign, definitions, Input_partial_tpl{Values: values}))
    if definitions.Content != nil {
            out.WriteString("<p>defined</p>")
    } else {
            out.WriteString("<p>missing</p>")
    }
    out.WriteString("\n")
    { definition := definitions.Content
    if definition == nil { panic("generated definition content is missing") }
    if definition != nil && definition.HTML != nil { out.WriteString(*definition.HTML) } else {
        input := Input_card_tpl{}
        if definition != nil && definition.Data != nil {
            if definition.Data.Label != nil { input.Label = *definition.Data.Label }
        }
        input.Label = assign.Page.Title
        out.WriteString(render_card_tpl(assign, definitions, input))
    }
    }
    out.WriteString("</section>\n")
 return out.String() }
func render_partial_tpl(assign Assign, definitions Definitions, input Input_partial_tpl) string { var out strings.Builder
values := input.Values
    out.WriteString("<p class=\"included\">")
    out.WriteString(generatedEscape(generatedListGet(values, int(float64(2)))))
    out.WriteString("</p>\n")
 return out.String() }
func RenderTemplate(target string, assign Assign, definitions Definitions) string { switch target {
	case "layout.tpl": return render_layout_tpl(assign, definitions, Input_layout_tpl{})
	default: panic("generated template is missing or requires inputs: " + target)
} }
func Render(assign Assign, definitions Definitions) string { return RenderTemplate("layout.tpl", assign, definitions) }
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
type generatedPrepared struct { target string; assign Assign; definitions Definitions; html *string }
func (p *generatedPrepared) Render() (output string, err error) { if p.html != nil { return *p.html, nil }; defer func() { if failure := recover(); failure != nil { err = fmt.Errorf("%v", failure) } }(); return RenderTemplate(p.target, p.assign, p.definitions), nil }
func (p *GeneratedProgram) Prepare(target any, assign any, options template.RenderOptions) (template.Prepared, error) { name, ok := target.(string); if !ok { return nil, fmt.Errorf("generated target must be a template name") }; var typedAssign Assign; if err := generatedDecode(assign, &typedAssign); err != nil { return nil, err }; definitions, targets, err := generatedBindDefinitions(options.Define); if err != nil { return nil, err }; resolved := targets[name]; targetName := name; if resolved.target != "" { targetName = resolved.target }; return &generatedPrepared{target: targetName, assign: typedAssign, definitions: definitions, html: resolved.html}, nil }
func (p *GeneratedProgram) Render(target any, assign any, options template.RenderOptions) (string, error) { prepared, err := p.Prepare(target, assign, options); if err != nil { return "", err }; return prepared.Render() }
var _ template.Program = (*GeneratedProgram)(nil)
var _ = fmt.Fprint
