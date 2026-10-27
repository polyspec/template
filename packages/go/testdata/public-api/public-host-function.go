// Package consumer contains standalone SDK visibility probes compiled outside the module.
package consumer

import template "github.com/polyspec/template/packages/go"

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
