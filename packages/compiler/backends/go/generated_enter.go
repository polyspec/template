package generated

import (
	"github.com/polyspec/template/packages/go/ast"
	"github.com/polyspec/template/packages/go/render"
)

func generatedEnter(context *render.Context, name string, frame *render.Frame, span ast.Span) {
	generatedPanic(context.Enter(name, frame, &span))
}
