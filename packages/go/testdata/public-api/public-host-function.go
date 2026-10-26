// Package consumer contains standalone SDK visibility probes compiled outside the module.
package consumer

import template "github.com/polyspec/template/packages/go"

// Callback uses only public SDK types.
var Callback template.HostFunction = func(args []template.Value, ctx template.FunctionContext) (any, error) {
	return ctx.Env.Timezone, nil
}
