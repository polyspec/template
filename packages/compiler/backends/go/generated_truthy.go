package generated

import "github.com/polyspec/template/packages/go/render"

func generatedTruthy(runtime *render.RuntimeBindings, input any) bool {
	return runtime.Truthy(generatedValue(input))
}
