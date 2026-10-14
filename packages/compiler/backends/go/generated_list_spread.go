package generated

import (
	"github.com/polyspec/template/packages/go/ast"
	"github.com/polyspec/template/packages/go/render"
)

func generatedListSpread[T any](runtime *render.RuntimeBindings, input any, frame *render.Frame, span ast.Span) []T {
	source, err := runtime.ListSpread(generatedValue(input), frame, span)
	generatedPanic(err)
	result := make([]T, len(source))
	for index, item := range source {
		result[index] = generatedResult[T](item)
	}
	return result
}
