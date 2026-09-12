// Package functions implements the built-in functions of docs/spec/functions.md.
package functions

import (
	"fmt"
	"math"

	"github.com/polyspec/template/errs"
	"github.com/polyspec/template/value"
)

// Env is the render environment (FUN-39, FUN-42).
type Env struct {
	Timezone string
	Now      float64
}

// Context is passed to every function call.
type Context struct {
	Env Env
}

// Error is an error raised by a function with an error code.
type Error struct {
	Code    errs.Code
	Message string
}

func (e *Error) Error() string { return e.Message }

// BuiltIn is a built-in function with its arity.
type BuiltIn struct {
	Min  int
	Max  int // -1 for unbounded
	Call func(args []value.Value, ctx Context) (value.Value, error)
}

// HostFunction is a function registered by the host (FUN-43).
type HostFunction func(args []value.Value, ctx Context) (any, error)

func typeError(format string, args ...any) error {
	return &Error{Code: errs.RuntimeType, Message: fmt.Sprintf(format, args...)}
}

func argString(v value.Value, name string) (string, error) {
	text, ok := value.TextOf(v)
	if !ok {
		return "", typeError("%s requires a string, got %s", name, value.TypeOf(v))
	}
	return text, nil
}

func argList(v value.Value, name string) (value.List, error) {
	list, ok := v.(value.List)
	if !ok {
		return nil, typeError("%s requires a list, got %s", name, value.TypeOf(v))
	}
	return list, nil
}

// ToNumber implements EXP-23.
func ToNumber(v value.Value) (float64, error) {
	switch x := v.(type) {
	case nil:
		return 0, nil
	case bool:
		if x {
			return 1, nil
		}
		return 0, nil
	case float64:
		return x, nil
	}
	if text, ok := value.TextOf(v); ok {
		n, ok := value.ParseNumericString(text)
		if !ok {
			return 0, typeError("%q is not a number", text)
		}
		return n, nil
	}
	return 0, typeError("a %s is not a number", value.TypeOf(v))
}

func argNumber(v value.Value) (float64, error) { return ToNumber(v) }

func argInteger(v value.Value) (int, error) {
	n, err := ToNumber(v)
	if err != nil {
		return 0, err
	}
	return int(math.Trunc(n)), nil
}

func stringifyArg(v value.Value) (string, error) {
	text, err := value.Stringify(v)
	if err != nil {
		return "", &Error{Code: errs.RuntimeStringify, Message: err.Error()}
	}
	return text, nil
}

func safe(text string) value.SafeString { return value.SafeString{Text: text} }

func optString(args []value.Value, index int, fallback, name string) (string, error) {
	if index >= len(args) {
		return fallback, nil
	}
	return argString(args[index], name)
}
