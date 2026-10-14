package generated

import (
	"github.com/polyspec/template/packages/go/ast"
	"github.com/polyspec/template/packages/go/render"
)

func generatedMapSpread[K comparable, V any](runtime *render.RuntimeBindings, input any, frame *render.Frame, span ast.Span) OrderedMap[K, V] {
	source, err := runtime.MapSpread(generatedValue(input), frame, span)
	generatedPanic(err)
	result := NewOrderedMap[K, V]()
	for _, key := range source.Keys() {
		result.Set(generatedResult[K](key), generatedResult[V](source.MustGet(key)))
	}
	return result
}
