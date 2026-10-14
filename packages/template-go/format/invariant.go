package format

import (
	"encoding/json"
	"reflect"
	"strings"
)

// Safety invariant: two templates are equivalent when their ASTs are equal after every `span` field is removed (AST-2,
// AST-7), and, for indented lines, after the spaces and tabs at the start of every line of text are removed.

// jsonValue is the canonical JSON value of an AST: maps, slices, strings, numbers, booleans and nil.
func jsonValue(tree any) (any, error) {
	data, err := json.Marshal(tree)
	if err != nil {
		return nil, err
	}
	var value any
	if err := json.Unmarshal(data, &value); err != nil {
		return nil, err
	}
	return value, nil
}

// withoutSpans is a copy of a JSON value without `span` fields.
func withoutSpans(value any) any {
	switch v := value.(type) {
	case []any:
		result := make([]any, len(v))
		for i, item := range v {
			result[i] = withoutSpans(item)
		}
		return result
	case map[string]any:
		result := make(map[string]any, len(v))
		for key, field := range v {
			if key != "span" {
				result[key] = withoutSpans(field)
			}
		}
		return result
	}
	return value
}

// withoutLineIndentation is a copy of a JSON value whose `Text` nodes have no spaces or tabs at the start of a line. A
// `Text` node that becomes empty is removed: indentation after a line that the renderer removes is a `Text` node of its
// own.
func withoutLineIndentation(value any) any {
	switch v := value.(type) {
	case []any:
		result := []any{}
		for _, item := range v {
			item = withoutLineIndentation(item)
			if node, ok := item.(map[string]any); ok && node["type"] == "Text" && node["value"] == "" {
				continue
			}
			result = append(result, item)
		}
		return result
	case map[string]any:
		result := make(map[string]any, len(v))
		for key, field := range v {
			if text, ok := field.(string); ok && key == "value" && v["type"] == "Text" {
				result[key] = stripLineIndentation(text)
			} else {
				result[key] = withoutLineIndentation(field)
			}
		}
		return result
	}
	return value
}

// stripLineIndentation removes the spaces and tabs at the start of the text and after every line feed.
func stripLineIndentation(text string) string {
	lines := strings.Split(text, "\n")
	for i, line := range lines {
		lines[i] = strings.TrimLeft(line, " \t")
	}
	return strings.Join(lines, "\n")
}

// sameTree compares two JSON values structurally, ignoring object key order and every `span` field.
func sameTree(left, right any) bool {
	return reflect.DeepEqual(withoutSpans(left), withoutSpans(right))
}
