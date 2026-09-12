// Generated.
package generated
import ("fmt"; "strings")
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
func valueOrZero[T any](value *T) T { if value == nil { var zero T; return zero }; return *value }
func Render(assign Assign, slots map[string]string) string { var out strings.Builder
    out.WriteString("<main>\n<h1>")
    fmt.Fprint(&out, valueOrZero(assign.Title))
    out.WriteString("</h1>\n")
    out.WriteString(slots["content"])
    out.WriteString("</main>\n")
 return out.String() }
var _ = fmt.Fprint
