package render

import (
	"errors"
	"fmt"
	"math"
	"reflect"
	"regexp"
	"strconv"
	"strings"

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

// Unary applies one eager unary operator.
func (r *RuntimeBindings) Unary(operator string, operand value.Value, frame *Frame, span ast.Span) (value.Value, error) {
	if operator == "!" {
		return !r.Truthy(operand), nil
	}
	if operator == "-" {
		number, err := r.Number(operand, frame, span)
		if err != nil {
			return nil, err
		}
		return r.Finite(-number, frame, span)
	}
	return nil, r.Error(frame, span, errs.RuntimeType, "unknown operator "+operator)
}

// Binary applies one eager binary operator. Short-circuit selection remains generated control flow.
func (r *RuntimeBindings) Binary(operator string, left, right value.Value, frame *Frame, span ast.Span) (value.Value, error) {
	switch operator {
	case "+":
		if runtimeCollection(left) || runtimeCollection(right) {
			return nil, r.Error(frame, span, errs.RuntimeStringify, "a list or map cannot be converted to text")
		}
		if value.IsString(left) || value.IsString(right) {
			leftText, err := r.Stringify(left, frame, span)
			if err != nil {
				return nil, err
			}
			rightText, err := r.Stringify(right, frame, span)
			if err != nil {
				return nil, err
			}
			return leftText + rightText, nil
		}
		return runtimeArithmetic(r, left, right, frame, span, func(a, b float64) float64 { return a + b })
	case "-":
		return runtimeArithmetic(r, left, right, frame, span, func(a, b float64) float64 { return a - b })
	case "*":
		return runtimeArithmetic(r, left, right, frame, span, func(a, b float64) float64 { return a * b })
	case "/":
		divisor, err := r.Number(right, frame, span)
		if err != nil {
			return nil, err
		}
		if divisor == 0 {
			return nil, r.Error(frame, span, errs.RuntimeDivZero, "division by zero")
		}
		dividend, err := r.Number(left, frame, span)
		if err != nil {
			return nil, err
		}
		return r.Finite(dividend/divisor, frame, span)
	case "%":
		dividend, err := r.Number(left, frame, span)
		if err != nil {
			return nil, err
		}
		divisor, err := r.Number(right, frame, span)
		if err != nil {
			return nil, err
		}
		if dividend != math.Trunc(dividend) || divisor != math.Trunc(divisor) {
			return nil, r.Error(frame, span, errs.RuntimeType, "% requires integer operands")
		}
		if divisor == 0 {
			return nil, r.Error(frame, span, errs.RuntimeDivZero, "division by zero")
		}
		return math.Mod(dividend, divisor), nil
	case "==":
		return r.Equal(left, right, false), nil
	case "!=":
		return !r.Equal(left, right, false), nil
	case "===":
		return r.Equal(left, right, true), nil
	case "!==":
		return !r.Equal(left, right, true), nil
	case "<", ">", "<=", ">=":
		order, err := r.Compare(left, right, frame, span)
		if err != nil {
			return nil, err
		}
		if operator == "<" {
			return order < 0, nil
		}
		if operator == ">" {
			return order > 0, nil
		}
		if operator == "<=" {
			return order <= 0, nil
		}
		return order >= 0, nil
	case "in":
		switch collection := right.(type) {
		case value.List:
			for _, item := range collection {
				if r.Equal(item, left, false) {
					return true, nil
				}
			}
			return false, nil
		case *value.OrderedMap:
			key, err := r.Stringify(left, frame, span)
			if err != nil {
				return nil, err
			}
			return collection.Has(key), nil
		}
		if text, ok := value.TextOf(right); ok {
			needle, err := r.Stringify(left, frame, span)
			if err != nil {
				return nil, err
			}
			return strings.Contains(text, needle), nil
		}
		return nil, r.Error(frame, span, errs.RuntimeType, "in requires a list, map or string on the right")
	default:
		return nil, r.Error(frame, span, errs.RuntimeType, "unknown operator "+operator)
	}
}

func runtimeArithmetic(r *RuntimeBindings, left, right value.Value, frame *Frame, span ast.Span, operation func(float64, float64) float64) (value.Value, error) {
	a, err := r.Number(left, frame, span)
	if err != nil {
		return nil, err
	}
	b, err := r.Number(right, frame, span)
	if err != nil {
		return nil, err
	}
	return r.Finite(operation(a, b), frame, span)
}

func runtimeCollection(input value.Value) bool {
	_, list := input.(value.List)
	_, object := input.(*value.OrderedMap)
	return list || object
}

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
	if result, ok := nativeMember(container, key); ok {
		return result
	}
	return r.Index(container, key)
}

// MemberCall invokes a public method on the original assigned Go value.
func (r *RuntimeBindings) MemberCall(container value.Value, method string, args []value.Value, frame *Frame, span ast.Span) (value.Value, error) {
	result, ok, err := nativeCall(container, method, args)
	if err != nil {
		return nil, r.Error(frame, span, errs.RuntimeHostFunction, method+" failed: "+err.Error())
	}
	if !ok {
		return nil, r.Error(frame, span, errs.RuntimeUnknownFunction, method+" is not a function")
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

// ClassCall invokes a registered logical class function.
func (r *RuntimeBindings) ClassCall(className, method string, args []value.Value, frame *Frame, span ast.Span) (value.Value, error) {
	fn, ok := r.context.Services.ClassFunction(className, method)
	if !ok {
		return nil, r.Error(frame, span, errs.RuntimeUnknownFunction, className+"::"+method+" is not a function")
	}
	result, err := fn(args, functions.Context{Env: r.context.Env})
	if err != nil {
		return nil, r.Error(frame, span, errs.RuntimeHostFunction, className+"::"+method+" failed: "+err.Error())
	}
	return value.Bind(result)
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

func nativeValue(v reflect.Value) value.Value {
	if !v.IsValid() {
		return nil
	}
	if v.Kind() == reflect.Interface && !v.IsNil() {
		return nativeValue(v.Elem())
	}
	return v.Interface()
}

func nativeMember(container value.Value, key string) (value.Value, bool) {
	rv := reflect.ValueOf(container)
	if !rv.IsValid() {
		return nil, false
	}
	for rv.Kind() == reflect.Pointer {
		if rv.IsNil() {
			return nil, false
		}
		rv = rv.Elem()
	}
	if rv.Kind() != reflect.Struct {
		return nil, false
	}
	typeOf := rv.Type()
	for index := 0; index < typeOf.NumField(); index++ {
		metadata := typeOf.Field(index)
		jsonName := strings.Split(metadata.Tag.Get("json"), ",")[0]
		if metadata.Name != key && !strings.EqualFold(metadata.Name, key) && (jsonName == "" || jsonName != key) {
			continue
		}
		field := rv.Field(index)
		if field.CanInterface() {
			bound, err := value.Bind(nativeValue(field))
			if err == nil {
				return bound, true
			}
		}
	}
	return nil, false
}

func nativeMethodName(method string) string {
	parts := strings.Split(method, "_")
	for index := range parts {
		if parts[index] != "" {
			parts[index] = strings.ToUpper(parts[index][:1]) + parts[index][1:]
		}
	}
	return strings.Join(parts, "")
}

func nativeCall(container value.Value, method string, args []value.Value) (value.Value, bool, error) {
	rv := reflect.ValueOf(container)
	if !rv.IsValid() {
		return nil, false, nil
	}
	candidate := rv.MethodByName(method)
	if !candidate.IsValid() {
		candidate = rv.MethodByName(nativeMethodName(method))
	}
	if !candidate.IsValid() {
		return nil, false, nil
	}
	t := candidate.Type()
	if t.NumIn() != len(args) {
		return nil, true, fmt.Errorf("%s accepts %d arguments, got %d", method, t.NumIn(), len(args))
	}
	inputs := make([]reflect.Value, len(args))
	for i, arg := range args {
		input := reflect.ValueOf(arg)
		if !input.IsValid() || !input.Type().AssignableTo(t.In(i)) {
			return nil, true, fmt.Errorf("argument %d has incompatible type", i)
		}
		inputs[i] = input
	}
	outputs := candidate.Call(inputs)
	if len(outputs) == 0 {
		return nil, true, nil
	}
	if len(outputs) > 1 && !outputs[len(outputs)-1].IsNil() {
		return nil, true, outputs[len(outputs)-1].Interface().(error)
	}
	return nativeValue(outputs[0]), true, nil
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

// ListSpread validates and expands one list spread operand.
func (r *RuntimeBindings) ListSpread(input value.Value, frame *Frame, span ast.Span) (value.List, error) {
	if list, ok := input.(value.List); ok {
		return list, nil
	}
	return nil, r.Error(frame, span, errs.RuntimeType, "spread in a list requires a list")
}

// MapSpread validates and expands one map spread operand.
func (r *RuntimeBindings) MapSpread(input value.Value, frame *Frame, span ast.Span) (*value.OrderedMap, error) {
	if object, ok := input.(*value.OrderedMap); ok {
		return object, nil
	}
	return nil, r.Error(frame, span, errs.RuntimeType, "spread in a map requires a map")
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
