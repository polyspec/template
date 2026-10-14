package generated

import (
	"github.com/polyspec/template/packages/go/ast"
	"github.com/polyspec/template/packages/go/render"
)

func generatedUnary[T any](runtime *render.RuntimeBindings, operator string, input any, frame *render.Frame, span ast.Span) T {
	result, err := runtime.Unary(operator, generatedValue(input), frame, span)
	generatedPanic(err)
	return generatedResult[T](result)
}
