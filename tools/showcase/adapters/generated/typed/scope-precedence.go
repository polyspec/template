// Generated.
package generated
import ("fmt"; "strings")
type Page struct { Title string }
type Assign struct {
	Page Page
	Root_label string
	Defined_label string
}
type Input_content_tpl struct { Title string; Root_label string; Defined_label string; Layout_local *string }
type Input_layout_tpl struct {  }
type DefinitionData_content_tpl struct { Title *string; Root_label *string; Defined_label *string; Layout_local **string }
type DefinitionData_layout_tpl struct {  }
type Definition[T any] struct { HTML *string; Data *T }
type Definitions struct { Content *Definition[DefinitionData_content_tpl]; Layout *Definition[DefinitionData_layout_tpl] }
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
func render_content_tpl(assign Assign, definitions Definitions, input Input_content_tpl) string { var out strings.Builder
title := input.Title
root_label := input.Root_label
defined_label := input.Defined_label
layout_local := input.Layout_local
    out.WriteString("<article>\n<h1>")
    fmt.Fprint(&out, title)
    out.WriteString("</h1>\n<p class=\"root\">")
    fmt.Fprint(&out, root_label)
    out.WriteString("</p>\n<p class=\"defined\">")
    fmt.Fprint(&out, defined_label)
    out.WriteString("</p>\n<p class=\"local\">")
    fmt.Fprint(&out, generatedCall("default", []any{valueOrZero(layout_local), "missing"}))
    out.WriteString("</p>\n</article>\n")
 return out.String() }
func render_layout_tpl(assign Assign, definitions Definitions, input Input_layout_tpl) string { var out strings.Builder

    layout_local := "visible only in layout"
    _ = layout_local
    out.WriteString("<section class=\"scope\">\n")
    { definition := definitions.Content
    if definition == nil { panic("generated definition content is missing") }
    if definition != nil && definition.HTML != nil { out.WriteString(*definition.HTML) } else {
        input := Input_content_tpl{Root_label: assign.Root_label, Defined_label: assign.Defined_label}
        if definition != nil && definition.Data != nil {
            if definition.Data.Title != nil { input.Title = *definition.Data.Title }
            if definition.Data.Root_label != nil { input.Root_label = *definition.Data.Root_label }
            if definition.Data.Defined_label != nil { input.Defined_label = *definition.Data.Defined_label }
            if definition.Data.Layout_local != nil { input.Layout_local = *definition.Data.Layout_local }
        }
        input.Title = assign.Page.Title
        out.WriteString(render_content_tpl(assign, definitions, input))
    }
    }
    out.WriteString("</section>\n")
 return out.String() }
func RenderTemplate(target string, assign Assign, definitions Definitions) string { switch target {
	case "layout.tpl": return render_layout_tpl(assign, definitions, Input_layout_tpl{})
	default: panic("generated template is missing or requires inputs: " + target)
} }
func Render(assign Assign, definitions Definitions) string { return RenderTemplate("layout.tpl", assign, definitions) }
var _ = fmt.Fprint
