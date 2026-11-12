// Package consumer contains standalone SDK visibility probes compiled outside the module.
package consumer

import template "github.com/polyspec/template/packages/go"
import "github.com/polyspec/template/packages/go/value"

// Configuration carriers remain nameable without importing implementation packages.
var Environment = template.Env{Timezone: "+09:00", Now: 123}
var Context = template.FunctionContext{Env: Environment}
var Policies = []template.ArtifactRefresh{template.ArtifactRefreshDev, template.ArtifactRefreshTrue, template.ArtifactRefreshFalse}
var Options = template.Options{
	Loader: template.NewMapLoader(nil), Functions: map[string]template.HostFunction{"custom": Callback},
	Limits: &template.Limits{OutputBytes: 128}, Delimiters: "[]", ArtifactRefresh: template.ArtifactRefreshFalse,
}
var Request = template.RenderOptions{Env: &Environment, Define: map[string]template.DefineInput{}}

// Callback uses only public SDK types.
var Callback template.HostFunction = func(args []template.Value, ctx template.FunctionContext) (any, error) {
	return ctx.Env.Timezone, nil
}

// Public root aliases and the native value package carry the same objects.
func Values() (template.Value, value.List, string, []string) {
	var safe template.SafeString = value.SafeString{Text: "<i>"}
	var ordered *template.OrderedMap = value.NewOrderedMap()
	ordered.Set("first", safe)
	ordered.Set("second", false)
	copy := ordered.Clone()
	_, _ = copy.Get("first")
	_ = copy.MustGet("first")
	_, _ = copy.Has("first"), copy.Len()
	list := value.List{nil, true, float64(12.5), "é😀", safe, ordered}
	return ordered, list, safe.Text, ordered.Keys()
}
