package generated

import (
	"github.com/polyspec/template/legacy/packages/go/ast"
	"github.com/polyspec/template/legacy/packages/go/render"
)

func generatedEntries(runtime *render.RuntimeBindings, input any, frame *render.Frame, span ast.Span) []render.RuntimeEntry {
	result, err := runtime.Entries(generatedValue(input), frame, span)
	generatedPanic(err)
	return result
}
