package render

import (
	"fmt"
	"regexp"

	"github.com/polyspec/template/functions"
)

var identifier = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

// RuntimeEnvironment owns host functions and limits for AST and generated programs.
type RuntimeEnvironment struct {
	limits        Limits
	hostFunctions map[string]functions.HostFunction
}

// NewRuntimeEnvironment validates and creates shared runtime services.
func NewRuntimeEnvironment(limits *Limits, hostFunctions map[string]functions.HostFunction) (*RuntimeEnvironment, error) {
	runtime := &RuntimeEnvironment{limits: DefaultLimits, hostFunctions: map[string]functions.HostFunction{}}
	if limits != nil {
		runtime.limits = *limits
	}
	for name, function := range hostFunctions {
		if err := runtime.Register(name, function); err != nil {
			return nil, err
		}
	}
	return runtime, nil
}

// Register adds a host function.
func (r *RuntimeEnvironment) Register(name string, function functions.HostFunction) error {
	if !identifier.MatchString(name) {
		return fmt.Errorf("%q is not an identifier", name)
	}
	if _, ok := functions.Builtins[name]; ok {
		return fmt.Errorf("%s is a built-in function", name)
	}
	r.hostFunctions[name] = function
	return nil
}

// Limits returns the active resource limits.
func (r *RuntimeEnvironment) Limits() Limits { return r.limits }

// HostFunction returns one registered host function.
func (r *RuntimeEnvironment) HostFunction(name string) (functions.HostFunction, bool) {
	function, ok := r.hostFunctions[name]
	return function, ok
}
