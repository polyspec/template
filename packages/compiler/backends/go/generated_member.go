package generated

import (
	"github.com/polyspec/template/legacy/packages/go/ast"
	"github.com/polyspec/template/legacy/packages/go/render"
)

func generatedMember[T any](runtime *render.RuntimeBindings, input any, key string, frame *render.Frame, span ast.Span) T {
	result, err := runtime.Member(generatedValue(input), key, frame, span)
	generatedPanic(err)
	return generatedResult[T](result)
}
