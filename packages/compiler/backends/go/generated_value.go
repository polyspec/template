package generated

import "github.com/polyspec/template/packages/go/value"

func generatedValue(input any) value.Value {
	switch item := input.(type) {
	case nil:
		return nil
	case bool:
		return item
	case float64:
		return item
	case string:
		return item
	case value.SafeString:
		return item
	case value.List:
		result := make(value.List, len(item))
		for index, element := range item {
			result[index] = generatedValue(element)
		}
		return result
	case *value.OrderedMap:
		return item
	}
	result, err := value.Convert(input)
	generatedPanic(err)
	return result
}
