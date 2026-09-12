// Generated.
package generated
import ("fmt"; "strings")
type Page struct { Title string }
type Slot struct { Template string; HTML string }
type Assign struct {
	Title string
	Heading string
	Island_label string
	Root_label string
	Defined_label string
	Page Page
}
func Render(assign Assign, slots map[string]string) string { var out strings.Builder
    out.WriteString("<main>\n<h1>")
    fmt.Fprint(&out, assign.Title)
    out.WriteString("</h1>\n")
    out.WriteString(slots["content"])
    out.WriteString("</main>\n")
 return out.String() }
var _ = fmt.Fprint
