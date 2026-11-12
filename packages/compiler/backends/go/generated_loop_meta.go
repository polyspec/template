package generated

import "github.com/polyspec/template/legacy/packages/go/render"

func generatedLoopMeta(scope *render.Scope, name string) *render.LoopMeta {
	result := scope.LoopMeta(name)
	if result == nil {
		panic("generated loop metadata is missing")
	}
	return result
}
