package generated

import (
	"github.com/polyspec/template/packages/go/ast"
	"github.com/polyspec/template/packages/go/render"
)

func generatedBinary[T any](runtime *render.RuntimeBindings, operator string, left, right any, frame *render.Frame, span ast.Span) T {
	result, err := runtime.Binary(operator, generatedValue(left), generatedValue(right), frame, span)
	generatedPanic(err)
	return generatedResult[T](result)
}
