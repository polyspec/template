package generated

import "github.com/polyspec/template/packages/go/value"

func generatedPlain(input any) any {
	switch item := input.(type) {
	case *value.OrderedMap:
		result := map[string]any{}
		for _, key := range item.Keys() {
			entry, _ := item.Get(key)
			result[key] = generatedPlain(entry)
		}
		return result
	case value.List:
		result := make([]any, len(item))
		for index, entry := range item {
			result[index] = generatedPlain(entry)
		}
		return result
	default:
		return input
	}
}
