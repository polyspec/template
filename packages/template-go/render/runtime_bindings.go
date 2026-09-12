package render

import (
	"errors"
	"fmt"
	"math"
	"regexp"
	"strconv"

	"github.com/polyspec/template/ast"
	"github.com/polyspec/template/errs"
	"github.com/polyspec/template/functions"
	"github.com/polyspec/template/value"
)

var runtimeIndexPattern = regexp.MustCompile(`^(0|[1-9][0-9]*)$`)

// RuntimeEntry is one iterable key and value pair.
type RuntimeEntry struct {
	Key   value.Value
	Value value.Value
}

// RuntimeBindings owns the value, function and error semantics shared by AST and generated programs.
type RuntimeBindings struct{ context *Context }

// NewRuntimeBindings creates runtime semantics for one render context.
func NewRuntimeBindings(context *Context) *RuntimeBindings { return &RuntimeBindings{context: context} }

// Truthy applies template truthiness.
func (r *RuntimeBindings) Truthy(input value.Value) bool { return value.IsTruthy(input) }

// Stringify converts one template value to text at a source location.
func (r *RuntimeBindings) Stringify(input value.Value, frame *Frame, span ast.Span) (string, error) {
	text, err := value.Stringify(input)
	if err != nil {
		return "", r.Error(frame, span, errs.RuntimeStringify, err.Error())
	}
	return text, nil
}

// Escape applies echo semantics, preserving explicitly safe text.
func (r *RuntimeBindings) Escape(input value.Value, frame *Frame, span ast.Span) (string, error) {
	if safe, ok := input.(value.SafeString); ok {
		return safe.Text, nil
	}
	text, err := r.Stringify(input, frame, span)
	if err != nil {
		return "", err
	}
	return functions.EscapeHTML(text), nil
}

// Number converts one template value to a number.
func (r *RuntimeBindings) Number(input value.Value, frame *Frame, span ast.Span) (float64, error) {
	number, err := functions.ToNumber(input)
	if err != nil {
		var functionError *functions.Error
		if errors.As(err, &functionError) {
			return 0, r.Error(frame, span, functionError.Code, functionError.Message)
		}
		return 0, err
	}
	return number, nil
}

// Finite rejects non-finite arithmetic results.
func (r *RuntimeBindings) Finite(input float64, frame *Frame, span ast.Span) (value.Value, error) {
	if math.IsInf(input, 0) || math.IsNaN(input) {
		return nil, r.Error(frame, span, errs.RuntimeType, "arithmetic result is not finite")
	}
	return input, nil
}

// Equal applies loose or strict template equality.
func (r *RuntimeBindings) Equal(left, right value.Value, strict bool) bool {
	if strict {
		return value.StrictEquals(left, right)
	}
	return value.LooseEquals(left, right)
}

// Compare orders two values or returns the specified runtime error.
func (r *RuntimeBindings) Compare(left, right value.Value, frame *Frame, span ast.Span) (int, error) {
	order, ok := value.Compare(left, right)
	if !ok {
		return 0, r.Error(frame, span, errs.RuntimeCompare, fmt.Sprintf("%s and %s have no order", value.TypeOf(left), value.TypeOf(right)))
	}
	return order, nil
}

// Member reads a fixed member name.
func (r *RuntimeBindings) Member(container value.Value, key string) value.Value {
	return r.Index(container, key)
}

// Index reads a dynamic list or map key.
func (r *RuntimeBindings) Index(container, key value.Value) value.Value {
	switch current := container.(type) {
	case *value.OrderedMap:
		if text, ok := value.TextOf(key); ok {
			return current.MustGet(text)
		}
		if number, ok := key.(float64); ok && number == math.Trunc(number) {
			return current.MustGet(value.NumberToString(number))
		}
	case value.List:
		position := -1
		if number, ok := key.(float64); ok && number == math.Trunc(number) {
			position = int(number)
		} else if text, ok := value.TextOf(key); ok && runtimeIndexPattern.MatchString(text) {
			position, _ = strconv.Atoi(text)
		}
		if position >= 0 && position < len(current) {
			return current[position]
		}
	}
	return nil
}

// Entries normalizes a loop operand.
func (r *RuntimeBindings) Entries(input value.Value, frame *Frame, span ast.Span) ([]RuntimeEntry, error) {
	entries := []RuntimeEntry{}
	switch current := input.(type) {
	case nil:
		return entries, nil
	case value.List:
		for index, item := range current {
			entries = append(entries, RuntimeEntry{Key: float64(index), Value: item})
		}
		return entries, nil
	case *value.OrderedMap:
		for _, key := range current.Keys() {
			entries = append(entries, RuntimeEntry{Key: key, Value: current.MustGet(key)})
		}
		return entries, nil
	default:
		return nil, r.Error(frame, span, errs.RuntimeType, "loop requires a list, a map or null")
	}
}

// Call invokes a built-in or host function and binds its result.
func (r *RuntimeBindings) Call(name string, args []value.Value, frame *Frame, span ast.Span) (value.Value, error) {
	functionContext := functions.Context{Env: r.context.Env}
	if builtin, ok := functions.Builtins[name]; ok {
		if len(args) < builtin.Min || (builtin.Max >= 0 && len(args) > builtin.Max) {
			return nil, r.Error(frame, span, errs.RuntimeArity, fmt.Sprintf("%s accepts %d to %d arguments, got %d", name, builtin.Min, builtin.Max, len(args)))
		}
		result, err := builtin.Call(args, functionContext)
		if err != nil {
			var functionError *functions.Error
			if errors.As(err, &functionError) {
				return nil, r.Error(frame, span, functionError.Code, functionError.Message)
			}
			return nil, err
		}
		return result, nil
	}
	host, ok := r.context.Services.HostFunction(name)
	if !ok {
		return nil, r.Error(frame, span, errs.RuntimeUnknownFunction, name+" is not a function")
	}
	result, err := host(args, functionContext)
	if err != nil {
		return nil, r.Error(frame, span, errs.RuntimeHostFunction, name+" failed: "+err.Error())
	}
	bound, err := value.Bind(result)
	if err != nil {
		var bindError *value.BindError
		if errors.As(err, &bindError) {
			return nil, r.Error(frame, span, bindError.Code, bindError.Message)
		}
		return nil, err
	}
	return bound, nil
}

// Limit checks expression and iteration limits.
func (r *RuntimeBindings) Limit(kind string, count int, frame *Frame, span ast.Span) error {
	maximum := r.context.Services.Limits().Iterations
	message := "loop iterations exceed %d"
	if kind == "expression" {
		maximum = r.context.Services.Limits().ExpressionDepth
		message = "expression nesting exceeds %d"
	}
	if count > maximum {
		return r.Error(frame, span, errs.RuntimeLimit, fmt.Sprintf(message, maximum))
	}
	return nil
}

// Error creates one positioned runtime error.
func (r *RuntimeBindings) Error(frame *Frame, span ast.Span, code errs.Code, message string) error {
	return r.context.Fail(code, frame, &span, message)
}
