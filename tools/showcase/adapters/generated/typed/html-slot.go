// Generated.
package generated
import ("fmt"; "strings")

type Assign struct {
	Heading string
}
type Input_layout_tpl struct {  }
type DefinitionData_layout_tpl struct {  }
type Definition[T any] struct { HTML *string; Data *T }
type Definitions struct { Content *Definition[struct{}]; Layout *Definition[DefinitionData_layout_tpl] }
type OrderedEntry[K comparable, V any] struct { Key K; Value V }
type OrderedMap[K comparable, V any] struct { entries []OrderedEntry[K, V] }
func NewOrderedMap[K comparable, V any]() OrderedMap[K, V] { return OrderedMap[K, V]{} }
func (m *OrderedMap[K, V]) Set(key K, value V) { for index := range m.entries { if m.entries[index].Key == key { m.entries[index].Value = value; return } }; m.entries = append(m.entries, OrderedEntry[K, V]{key, value}) }
func (m OrderedMap[K, V]) Get(key K) (V, bool) { for _, entry := range m.entries { if entry.Key == key { return entry.Value, true } }; var zero V; return zero, false }
func (m OrderedMap[K, V]) Entries() []OrderedEntry[K, V] { return m.entries }
func generatedMapGet[K comparable, V any](value OrderedMap[K, V], key K) V { result, _ := value.Get(key); return result }
func generatedListGet[T any](value []T, index int) T { if index >= 0 && index < len(value) { return value[index] }; var zero T; return zero }
func generatedTernary[T any](test bool, yes, no T) T { if test { return yes }; return no }
func generatedEscape(value any) string { if value == nil { return "" }; return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "\"", "&quot;", "'", "&#39;").Replace(fmt.Sprint(value)) }
func generatedTruthy(value any) bool { switch value := value.(type) { case nil: return false; case bool: return value; case float64: return value != 0; case string: return value != ""; default: return true } }
func generatedUnary(op string, value any) any { if op == "!" { return !generatedTruthy(value) }; return -value.(float64) }
func generatedBinary(op string, left, right any) any { switch op { case "&&": return generatedTruthy(left) && generatedTruthy(right); case "||": return generatedTruthy(left) || generatedTruthy(right); case "??": if left != nil { return left }; return right; case "==", "===": return fmt.Sprint(left) == fmt.Sprint(right); case "!=", "!==": return fmt.Sprint(left) != fmt.Sprint(right); case "+": if _, ok := left.(string); ok { return fmt.Sprint(left)+fmt.Sprint(right) }; if _, ok := right.(string); ok { return fmt.Sprint(left)+fmt.Sprint(right) }; return left.(float64)+right.(float64); case "-": return left.(float64)-right.(float64); case "*": return left.(float64)*right.(float64); case "/": return left.(float64)/right.(float64); case "%": return float64(int64(left.(float64))%int64(right.(float64))); case "<": return fmt.Sprint(left) < fmt.Sprint(right); case ">": return fmt.Sprint(left) > fmt.Sprint(right); case "<=": return fmt.Sprint(left) <= fmt.Sprint(right); case ">=": return fmt.Sprint(left) >= fmt.Sprint(right) }; panic("unsupported generated operator: "+op) }
func generatedCall(name string, args []any) any { if name == "default" && len(args) == 2 { if generatedTruthy(args[0]) { return args[0] }; return args[1] }; panic("generated function is not linked: "+name) }
func valueOrZero[T any](value *T) T { if value == nil { var zero T; return zero }; return *value }
func render_layout_tpl(assign Assign, definitions Definitions, input Input_layout_tpl) string { var out strings.Builder

    out.WriteString("<section class=\"notice\">\n<h1>")
    out.WriteString(generatedEscape(assign.Heading))
    out.WriteString("</h1>\n")
    { definition := definitions.Content
    if definition == nil || definition.HTML == nil { panic("generated definition content requires html") }
    out.WriteString(*definition.HTML)
    }
    out.WriteString("</section>\n")
 return out.String() }
func RenderTemplate(target string, assign Assign, definitions Definitions) string { switch target {
	case "layout.tpl": return render_layout_tpl(assign, definitions, Input_layout_tpl{})
	default: panic("generated template is missing or requires inputs: " + target)
} }
func Render(assign Assign, definitions Definitions) string { return RenderTemplate("layout.tpl", assign, definitions) }
var _ = fmt.Fprint
