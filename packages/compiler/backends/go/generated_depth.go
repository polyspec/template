package generated

import (
	"github.com/polyspec/template/legacy/packages/go/ast"
	"github.com/polyspec/template/legacy/packages/go/render"
)

func generatedDepth[T any](runtime *render.RuntimeBindings, input T, frame *render.Frame, span ast.Span) T {
	_, err := runtime.Depth(generatedValue(input), frame, span)
	generatedPanic(err)
	return input
}
