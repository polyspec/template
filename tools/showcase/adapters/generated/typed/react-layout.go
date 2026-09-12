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
func render_content_tpl(assign Assign, slots map[string]string) string { var out strings.Builder
    out.WriteString("<section data-react-island id=\"counter\">\n<p>")
    fmt.Fprint(&out, valueOrZero(assign.Island_label))
    out.WriteString("</p>\n</section>\n")
 return out.String() }
func render_layout_tpl(assign Assign, slots map[string]string) string { var out strings.Builder
    out.WriteString("<main>\n<h1>")
    fmt.Fprint(&out, valueOrZero(assign.Title))
    out.WriteString("</h1>\n")
    out.WriteString(slots["content"])
    out.WriteString("</main>\n")
 return out.String() }
func renderTemplate(target string, assign Assign, slots map[string]string) string { switch target {
	case "content.tpl": return render_content_tpl(assign, slots)
	case "layout.tpl": return render_layout_tpl(assign, slots)
	default: panic("generated template is missing: " + target)
} }
func Render(assign Assign, slots map[string]string) string { return renderTemplate("layout.tpl", assign, slots) }
var _ = fmt.Fprint
