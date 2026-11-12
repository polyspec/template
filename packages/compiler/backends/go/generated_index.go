package generated

import (
	"github.com/polyspec/template/legacy/packages/go/ast"
	"github.com/polyspec/template/legacy/packages/go/render"
)

func generatedIndex[T any](runtime *render.RuntimeBindings, input, key any, frame *render.Frame, span ast.Span) T {
	result, err := runtime.Index(generatedValue(input), generatedValue(key), frame, span)
	generatedPanic(err)
	return generatedResult[T](result)
}
