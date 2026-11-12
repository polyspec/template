package generated

import (
	"github.com/polyspec/template/legacy/packages/go/ast"
	"github.com/polyspec/template/legacy/packages/go/render"
	"github.com/polyspec/template/legacy/packages/go/value"
)

func generatedCall[T any](runtime *render.RuntimeBindings, name string, args []value.Value, frame *render.Frame, span ast.Span) T {
	result, err := runtime.Call(name, args, frame, span)
	generatedPanic(err)
	return generatedResult[T](result)
}
