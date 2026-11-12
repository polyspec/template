package generated

import (
	"github.com/polyspec/template/legacy/packages/go/ast"
	"github.com/polyspec/template/legacy/packages/go/render"
)

func generatedLimit(runtime *render.RuntimeBindings, kind string, count int, frame *render.Frame, span ast.Span) {
	generatedPanic(runtime.Limit(kind, count, frame, span))
}
