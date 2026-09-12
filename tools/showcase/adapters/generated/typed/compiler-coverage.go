// Generated.
package generated
import ("fmt"; "strings")
type Page struct { Title string }
type Row struct { Name string }
type Slot struct { Template *string; Html *string }
type Assign struct {
	Flag bool
	Page Page
	Numbers []float64
	Lookup OrderedMap[string, string]
	Rows []Row
}
type Input_card_tpl struct { Label string }
type Input_layout_tpl struct {  }
type Input_partial_tpl struct { Values []float64 }
type Definition[T any] struct { HTML *string; Data *T }
type Definitions struct { Content *Definition[Input_card_tpl]; Layout *Definition[Input_layout_tpl] }
type OrderedEntry[K comparable, V any] struct { Key K; Value V }
type OrderedMap[K comparable, V any] struct { entries []OrderedEntry[K, V] }
func NewOrderedMap[K comparable, V any]() OrderedMap[K, V] { return OrderedMap[K, V]{} }
func (m *OrderedMap[K, V]) Set(key K, value V) { for index := range m.entries { if m.entries[index].Key == key { m.entries[index].Value = value; return } }; m.entries = append(m.entries, OrderedEntry[K, V]{key, value}) }
func (m OrderedMap[K, V]) Get(key K) (V, bool) { for _, entry := range m.entries { if entry.Key == key { return entry.Value, true } }; var zero V; return zero, false }
func (m OrderedMap[K, V]) Entries() []OrderedEntry[K, V] { return m.entries }
func generatedMapGet[K comparable, V any](value OrderedMap[K, V], key K) V { result, _ := value.Get(key); return result }
func generatedListGet[T any](value []T, index int) T { if index >= 0 && index < len(value) { return value[index] }; var zero T; return zero }
func generatedTernary[T any](test bool, yes, no T) T { if test { return yes }; return no }
func generatedTruthy(value any) bool { switch value := value.(type) { case nil: return false; case bool: return value; case float64: return value != 0; case string: return value != ""; default: return true } }
func generatedUnary(op string, value any) any { if op == "!" { return !generatedTruthy(value) }; return -value.(float64) }
func generatedBinary(op string, left, right any) any { switch op { case "&&": return generatedTruthy(left) && generatedTruthy(right); case "||": return generatedTruthy(left) || generatedTruthy(right); case "??": if left != nil { return left }; return right; case "==", "===": return fmt.Sprint(left) == fmt.Sprint(right); case "!=", "!==": return fmt.Sprint(left) != fmt.Sprint(right); case "+": if _, ok := left.(string); ok { return fmt.Sprint(left)+fmt.Sprint(right) }; if _, ok := right.(string); ok { return fmt.Sprint(left)+fmt.Sprint(right) }; return left.(float64)+right.(float64); case "-": return left.(float64)-right.(float64); case "*": return left.(float64)*right.(float64); case "/": return left.(float64)/right.(float64); case "%": return float64(int64(left.(float64))%int64(right.(float64))); case "<": return fmt.Sprint(left) < fmt.Sprint(right); case ">": return fmt.Sprint(left) > fmt.Sprint(right); case "<=": return fmt.Sprint(left) <= fmt.Sprint(right); case ">=": return fmt.Sprint(left) >= fmt.Sprint(right) }; panic("unsupported generated operator: "+op) }
func generatedCall(name string, args []any) any { if name == "default" && len(args) == 2 { if generatedTruthy(args[0]) { return args[0] }; return args[1] }; panic("generated function is not linked: "+name) }
func valueOrZero[T any](value *T) T { if value == nil { var zero T; return zero }; return *value }
func render_card_tpl(assign Assign, definitions Definitions, input Input_card_tpl) string { var out strings.Builder
label := input.Label
    out.WriteString("<p class=\"card\">")
    fmt.Fprint(&out, label)
    out.WriteString("</p>\n")
 return out.String() }
func render_layout_tpl(assign Assign, definitions Definitions, input Input_layout_tpl) string { var out strings.Builder

    values := func() []float64 { result := []float64{}; result = append(result, float64(0)); result = append(result, assign.Numbers...); return result }()
    merged := func() OrderedMap[string, string] { result := NewOrderedMap[string, string](); for _, entry := range assign.Lookup.Entries() { result.Set(entry.Key, entry.Value) }; result.Set("z", "Z"); return result }()
    out.WriteString("<section>\n<h1>")
    fmt.Fprint(&out, assign.Page.Title)
    out.WriteString("</h1>\n<p>")
    fmt.Fprint(&out, generatedListGet(values, int(float64(1))))
    out.WriteString("|")
    fmt.Fprint(&out, generatedMapGet(merged, "z"))
    out.WriteString("</p>\n")
	if generatedTruthy(generatedBinary("&&", assign.Flag, generatedBinary("==", assign.Page.Title, "Guide"))) {
        out.WriteString("<strong>matched</strong>")	} else {
        out.WriteString("<strong>missed</strong>")
	}
    out.WriteString("\n<p>")
    fmt.Fprint(&out, generatedTernary(generatedTruthy(assign.Flag), "yes", "no"))
    out.WriteString("|")
    fmt.Fprint(&out, generatedBinary("+", generatedUnary("-", float64(1)), float64(3)))
    out.WriteString("|")
    fmt.Fprint(&out, generatedCall("default", []any{"", "fallback"}))
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
            fmt.Fprint(&out, row_index)
            out.WriteString("/")
            fmt.Fprint(&out, row_size)
            out.WriteString(":")
            fmt.Fprint(&out, row.Name)
            out.WriteString(":")
            fmt.Fprint(&out, row_first)
            out.WriteString(":")
            fmt.Fprint(&out, row_last)
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
        if definition != nil && definition.Data != nil { input = *definition.Data }
        input.Label = assign.Page.Title
        out.WriteString(render_card_tpl(assign, definitions, input))
    }
    }
    out.WriteString("</section>\n")
 return out.String() }
func render_partial_tpl(assign Assign, definitions Definitions, input Input_partial_tpl) string { var out strings.Builder
values := input.Values
    out.WriteString("<p class=\"included\">")
    fmt.Fprint(&out, generatedListGet(values, int(float64(2))))
    out.WriteString("</p>\n")
 return out.String() }
func renderTemplate(target string, assign Assign, definitions Definitions) string { switch target {
	case "layout.tpl": return render_layout_tpl(assign, definitions, Input_layout_tpl{})
	default: panic("generated template is missing or requires inputs: " + target)
} }
func Render(assign Assign, definitions Definitions) string { return renderTemplate("layout.tpl", assign, definitions) }
var _ = fmt.Fprint
