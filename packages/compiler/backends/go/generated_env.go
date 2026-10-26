package generated

import (
	"time"

	template "github.com/polyspec/template/packages/go"
)

func generatedEnv(options template.RenderOptions) template.Env {
	env := template.Env{Timezone: "Z", Now: float64(time.Now().Unix())}
	if options.Env != nil {
		if options.Env.Timezone != "" {
			env.Timezone = options.Env.Timezone
		}
		env.Now = options.Env.Now
	}
	return env
}
