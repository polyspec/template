package generated

import (
	"github.com/polyspec/template/packages/go/ast"
	"github.com/polyspec/template/packages/go/render"
)

func generatedWrite(context *render.Context, text string, frame *render.Frame, span ast.Span) {
	generatedPanic(context.Write(text, frame, &span))
}
