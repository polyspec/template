package generated

import "github.com/polyspec/template/packages/go/value"

func generatedAs[T any](input value.Value) (T, error) {
	if result, ok := input.(T); ok {
		return result, nil
	}
	var result T
	err := generatedDecode(input, &result)
	return result, err
}
