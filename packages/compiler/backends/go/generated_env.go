package generated

import (
	"time"

	template "github.com/polyspec/template/packages/go"
	"github.com/polyspec/template/packages/go/functions"
)

func generatedEnv(options template.RenderOptions) functions.Env {
	env := functions.Env{Timezone: "Z", Now: float64(time.Now().Unix())}
	if options.Env != nil {
		if options.Env.Timezone != "" {
			env.Timezone = options.Env.Timezone
		}
		env.Now = options.Env.Now
	}
	return env
}
