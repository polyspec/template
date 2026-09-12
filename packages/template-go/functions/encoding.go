package functions

import (
	"fmt"
	"strings"

	"github.com/polyspec/template/value"
)

// EscapeHTML replaces the five characters of RT-32.
func EscapeHTML(text string) string {
	var b strings.Builder
	for i := 0; i < len(text); i++ {
		switch text[i] {
		case '&':
			b.WriteString("&amp;")
		case '<':
			b.WriteString("&lt;")
		case '>':
			b.WriteString("&gt;")
		case '"':
			b.WriteString("&quot;")
		case '\'':
			b.WriteString("&#39;")
		default:
			b.WriteByte(text[i])
		}
	}
	return b.String()
}

func jsonString(text string) string {
	var b strings.Builder
	b.WriteByte('"')
	for _, r := range text {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		case '<', '>', '&', 0x2028, 0x2029:
			fmt.Fprintf(&b, `\u%04x`, r)
		default:
			if r < 0x20 {
				fmt.Fprintf(&b, `\u%04x`, r)
			} else {
				b.WriteRune(r)
			}
		}
	}
	b.WriteByte('"')
	return b.String()
}

// ToJSON implements FUN-26 to FUN-28.
func ToJSON(v value.Value) string {
	switch x := v.(type) {
	case nil:
		return "null"
	case bool:
		if x {
			return "true"
		}
		return "false"
	case float64:
		return value.NumberToString(x)
	case string:
		return jsonString(x)
	case value.SafeString:
		return jsonString(x.Text)
	case value.List:
		parts := make([]string, len(x))
		for i, item := range x {
			parts[i] = ToJSON(item)
		}
		return "[" + strings.Join(parts, ",") + "]"
	case *value.OrderedMap:
		parts := make([]string, 0, x.Len())
		for _, key := range x.Keys() {
			parts = append(parts, jsonString(key)+":"+ToJSON(x.MustGet(key)))
		}
		return "{" + strings.Join(parts, ",") + "}"
	}
	return "null"
}

// PercentEncode implements FUN-29.
func PercentEncode(text string) string {
	const hex = "0123456789ABCDEF"
	var b strings.Builder
	for i := 0; i < len(text); i++ {
		c := text[i]
		if c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-' || c == '_' || c == '.' || c == '~' {
			b.WriteByte(c)
		} else {
			b.WriteByte('%')
			b.WriteByte(hex[c>>4])
			b.WriteByte(hex[c&15])
		}
	}
	return b.String()
}

var encodingFunctions = map[string]BuiltIn{
	"escape": {1, 1, func(args []value.Value, _ Context) (value.Value, error) {
		text, err := stringifyArg(args[0])
		if err != nil {
			return nil, err
		}
		return safe(EscapeHTML(text)), nil
	}},
	"raw": {1, 1, func(args []value.Value, _ Context) (value.Value, error) {
		text, err := stringifyArg(args[0])
		if err != nil {
			return nil, err
		}
		return safe(text), nil
	}},
	"json": {1, 1, func(args []value.Value, _ Context) (value.Value, error) {
		return ToJSON(args[0]), nil
	}},
	"url": {1, 1, func(args []value.Value, _ Context) (value.Value, error) {
		text, err := stringifyArg(args[0])
		if err != nil {
			return nil, err
		}
		return PercentEncode(text), nil
	}},
	"nl2br": {1, 1, func(args []value.Value, _ Context) (value.Value, error) {
		text, err := argString(args[0], "nl2br")
		if err != nil {
			return nil, err
		}
		text = strings.ReplaceAll(text, "\r\n", "\n")
		return strings.ReplaceAll(text, "\n", "<br>\n"), nil
	}},
	"str": {1, 1, func(args []value.Value, _ Context) (value.Value, error) {
		text, err := stringifyArg(args[0])
		if err != nil {
			return nil, err
		}
		return text, nil
	}},
	"type": {1, 1, func(args []value.Value, _ Context) (value.Value, error) {
		return string(value.TypeOf(args[0])), nil
	}},
}
