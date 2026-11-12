package generated

import (
	"github.com/polyspec/template/legacy/packages/go/ast"
	"github.com/polyspec/template/legacy/packages/go/render"
	"github.com/polyspec/template/legacy/packages/go/value"
)

func generatedClassCall[T any](runtime *render.RuntimeBindings, className, method string, args []value.Value, frame *render.Frame, span ast.Span) T {
	result, err := runtime.ClassCall(className, method, args, frame, span)
	generatedPanic(err)
	return generatedResult[T](result)
}
