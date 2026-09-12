// Generated.
package generated
import ("fmt"; "reflect"; "strings")
type Page struct { Title *string }
type Slot struct { Template *string; Html *string }
type Assign struct {
	Title *string
	Heading *string
	Island_label *string
	Root_label *string
	Defined_label *string
	Page *Page
}
type Input_content_tpl struct {  }
type Input_layout_tpl struct {  }
type DefinitionData_content_tpl struct {  }
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
func generatedEscape(value any) string { if value == nil { return "" }; return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "\"", "&quot;", "'", "&#39;").Replace(fmt.Sprint(value)) }
func generatedTruthy(value any) bool { if value == nil { return false }; reflected := reflect.ValueOf(value); switch reflected.Kind() { case reflect.Bool: return reflected.Bool(); case reflect.Float32, reflect.Float64: return reflected.Float() != 0; case reflect.String, reflect.Array, reflect.Slice, reflect.Map: return reflected.Len() != 0; case reflect.Struct: field := reflected.FieldByName("entries"); if field.IsValid() { return field.Len() != 0 } }; return true }
func generatedUnary(op string, value any) any { if op == "!" { return !generatedTruthy(value) }; return -value.(float64) }
func generatedBinary(op string, left, right any) any { switch op { case "&&": return generatedTruthy(left) && generatedTruthy(right); case "||": return generatedTruthy(left) || generatedTruthy(right); case "??": if left != nil { return left }; return right; case "==", "===": return fmt.Sprint(left) == fmt.Sprint(right); case "!=", "!==": return fmt.Sprint(left) != fmt.Sprint(right); case "+": if _, ok := left.(string); ok { return fmt.Sprint(left)+fmt.Sprint(right) }; if _, ok := right.(string); ok { return fmt.Sprint(left)+fmt.Sprint(right) }; return left.(float64)+right.(float64); case "-": return left.(float64)-right.(float64); case "*": return left.(float64)*right.(float64); case "/": return left.(float64)/right.(float64); case "%": return float64(int64(left.(float64))%int64(right.(float64))); case "<": return fmt.Sprint(left) < fmt.Sprint(right); case ">": return fmt.Sprint(left) > fmt.Sprint(right); case "<=": return fmt.Sprint(left) <= fmt.Sprint(right); case ">=": return fmt.Sprint(left) >= fmt.Sprint(right) }; panic("unsupported generated operator: "+op) }
func generatedDefault(value, fallback any) any { if generatedTruthy(value) { return value }; return fallback }
func valueOrZero[T any](value *T) T { if value == nil { var zero T; return zero }; return *value }
func render_content_tpl(assign Assign, definitions Definitions, input Input_content_tpl) string { var out strings.Builder

    out.WriteString("<section data-react-island id=\"counter\">\n<p>")
    out.WriteString(generatedEscape(valueOrZero(assign.Island_label)))
    out.WriteString("</p>\n</section>\n")
 return out.String() }
func render_layout_tpl(assign Assign, definitions Definitions, input Input_layout_tpl) string { var out strings.Builder

    out.WriteString("<main>\n<h1>")
    out.WriteString(generatedEscape(valueOrZero(assign.Title)))
    out.WriteString("</h1>\n")
    { definition := definitions.Content
    if definition == nil { panic("generated definition content is missing") }
    if definition != nil && definition.HTML != nil { out.WriteString(*definition.HTML) } else {
        input := Input_content_tpl{}
        if definition != nil && definition.Data != nil {

        }

        out.WriteString(render_content_tpl(assign, definitions, input))
    }
    }
    out.WriteString("</main>\n")
 return out.String() }
func RenderTemplate(target string, assign Assign, definitions Definitions) string { switch target {
	case "content.tpl": return render_content_tpl(assign, definitions, Input_content_tpl{})
	case "layout.tpl": return render_layout_tpl(assign, definitions, Input_layout_tpl{})
	default: panic("generated template is missing or requires inputs: " + target)
} }
func Render(assign Assign, definitions Definitions) string { return RenderTemplate("layout.tpl", assign, definitions) }
var _ = fmt.Fprint
