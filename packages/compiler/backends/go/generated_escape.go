package generated

import (
	"github.com/polyspec/template/packages/go/ast"
	"github.com/polyspec/template/packages/go/render"
)

func generatedEscape(runtime *render.RuntimeBindings, input any, frame *render.Frame, span ast.Span) string {
	result, err := runtime.Escape(generatedValue(input), frame, span)
	generatedPanic(err)
	return result
}
