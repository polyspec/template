package generated

import "github.com/polyspec/template/legacy/packages/go/value"

func generatedResult[T any](input value.Value) T {
	result, err := generatedAs[T](input)
	generatedPanic(err)
	return result
}
