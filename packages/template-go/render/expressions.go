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

var indexPattern = regexp.MustCompile(`^(0|[1-9][0-9]*)$`)

// Evaluator evaluates expressions (docs/spec/expressions.md).
type Evaluator struct {
	context *Context
	depth   int
}

// NewEvaluator creates an evaluator.
func NewEvaluator(context *Context) *Evaluator { return &Evaluator{context: context} }

func (e *Evaluator) fail(frame *Frame, span ast.Span, code errs.Code, message string) error {
	return e.context.Fail(code, frame, &span, message)
}

// Evaluate evaluates an expression in a frame.
func (e *Evaluator) Evaluate(expr ast.Expr, frame *Frame) (value.Value, error) {
	e.depth++
	defer func() { e.depth-- }()
	if e.depth > e.context.Services.Limits().ExpressionDepth {
		return nil, e.fail(frame, ast.SpanOf(expr), errs.RuntimeLimit, fmt.Sprintf("expression nesting exceeds %d", e.context.Services.Limits().ExpressionDepth))
	}
	switch n := expr.(type) {
	case *ast.Literal:
		return n.Value, nil
	case *ast.Var:
		return frame.Lookup(n.Name), nil
	case *ast.LoopMeta:
		meta := frame.LoopMeta(n.Loop)
		if meta == nil {
			return nil, e.fail(frame, n.Span, errs.RuntimeUnknownLoop, n.Loop+" is not an active loop variable")
		}
		switch n.Field {
		case "index_":
			return float64(meta.Index), nil
		case "key_":
			return meta.Key, nil
		case "value_":
			return meta.Value, nil
		case "first_":
			return meta.First, nil
		case "last_":
			return meta.Last, nil
		case "size_":
			return float64(meta.Size), nil
		}
		return nil, nil
	case *ast.Member:
		object, err := e.Evaluate(n.Object, frame)
		if err != nil {
			return nil, err
		}
		return Lookup(object, n.Key), nil
	case *ast.Index:
		object, err := e.Evaluate(n.Object, frame)
		if err != nil {
			return nil, err
		}
		key, err := e.Evaluate(n.Index, frame)
		if err != nil {
			return nil, err
		}
		return Lookup(object, key), nil
	case *ast.Call:
		args := make([]value.Value, len(n.Args))
		for i, arg := range n.Args {
			v, err := e.Evaluate(arg, frame)
			if err != nil {
				return nil, err
			}
			args[i] = v
		}
		return e.call(n.Name, args, frame, n.Span)
	case *ast.Unary:
		operand, err := e.Evaluate(n.Operand, frame)
		if err != nil {
			return nil, err
		}
		if n.Op == "!" {
			return !value.IsTruthy(operand), nil
		}
		x, err := e.number(operand, frame, n.Span)
		if err != nil {
			return nil, err
		}
		return e.finite(-x, frame, n.Span)
	case *ast.Binary:
		return e.binary(n, frame)
	case *ast.Ternary:
		test, err := e.Evaluate(n.Test, frame)
		if err != nil {
			return nil, err
		}
		if value.IsTruthy(test) {
			if n.Then == nil {
				return test, nil
			}
			return e.Evaluate(n.Then, frame)
		}
		return e.Evaluate(n.Else, frame)
	case *ast.List:
		list := value.List{}
		for _, item := range n.Items {
			if spread, ok := item.(*ast.Spread); ok {
				v, err := e.Evaluate(spread.Expr, frame)
				if err != nil {
					return nil, err
				}
				inner, ok := v.(value.List)
				if !ok {
					return nil, e.fail(frame, spread.Span, errs.RuntimeType, "spread in a list requires a list")
				}
				list = append(list, inner...)
				continue
			}
			v, err := e.Evaluate(item.(ast.Expr), frame)
			if err != nil {
				return nil, err
			}
			list = append(list, v)
		}
		return list, nil
	case *ast.Map:
		m := value.NewOrderedMap()
		for _, entry := range n.Entries {
			if spread, ok := entry.(*ast.Spread); ok {
				v, err := e.Evaluate(spread.Expr, frame)
				if err != nil {
					return nil, err
				}
				inner, ok := v.(*value.OrderedMap)
				if !ok {
					return nil, e.fail(frame, spread.Span, errs.RuntimeType, "spread in a map requires a map")
				}
				for _, k := range inner.Keys() {
					m.Set(k, inner.MustGet(k))
				}
				continue
			}
			pair := entry.(*ast.MapEntry)
			keyValue, err := e.Evaluate(pair.Key, frame)
			if err != nil {
				return nil, err
			}
			key, err := e.stringify(keyValue, frame, ast.SpanOf(pair.Key))
			if err != nil {
				return nil, err
			}
			v, err := e.Evaluate(pair.Value, frame)
			if err != nil {
				return nil, err
			}
			m.Set(key, v)
		}
		return m, nil
	}
	return nil, e.fail(frame, ast.SpanOf(expr), errs.RuntimeType, "unknown expression node")
}

func isCollection(v value.Value) bool {
	switch v.(type) {
	case value.List, *value.OrderedMap:
		return true
	}
	return false
}

func (e *Evaluator) binary(n *ast.Binary, frame *Frame) (value.Value, error) {
	switch n.Op {
	case "&&":
		left, err := e.Evaluate(n.Left, frame)
		if err != nil {
			return nil, err
		}
		if !value.IsTruthy(left) {
			return false, nil
		}
		right, err := e.Evaluate(n.Right, frame)
		if err != nil {
			return nil, err
		}
		return value.IsTruthy(right), nil
	case "||":
		left, err := e.Evaluate(n.Left, frame)
		if err != nil {
			return nil, err
		}
		if value.IsTruthy(left) {
			return true, nil
		}
		right, err := e.Evaluate(n.Right, frame)
		if err != nil {
			return nil, err
		}
		return value.IsTruthy(right), nil
	case "??":
		left, err := e.Evaluate(n.Left, frame)
		if err != nil {
			return nil, err
		}
		if left != nil {
			return left, nil
		}
		return e.Evaluate(n.Right, frame)
	}
	left, err := e.Evaluate(n.Left, frame)
	if err != nil {
		return nil, err
	}
	right, err := e.Evaluate(n.Right, frame)
	if err != nil {
		return nil, err
	}
	span := n.Span
	switch n.Op {
	case "+":
		if isCollection(left) || isCollection(right) {
			return nil, e.fail(frame, span, errs.RuntimeStringify, "a list or map cannot be converted to text")
		}
		if value.IsString(left) || value.IsString(right) {
			l, err := e.stringify(left, frame, span)
			if err != nil {
				return nil, err
			}
			r, err := e.stringify(right, frame, span)
			if err != nil {
				return nil, err
			}
			return l + r, nil
		}
		return e.arith(left, right, frame, span, func(a, b float64) float64 { return a + b })
	case "-":
		return e.arith(left, right, frame, span, func(a, b float64) float64 { return a - b })
	case "*":
		return e.arith(left, right, frame, span, func(a, b float64) float64 { return a * b })
	case "/":
		divisor, err := e.number(right, frame, span)
		if err != nil {
			return nil, err
		}
		if divisor == 0 {
			return nil, e.fail(frame, span, errs.RuntimeDivZero, "division by zero")
		}
		dividend, err := e.number(left, frame, span)
		if err != nil {
			return nil, err
		}
		return e.finite(dividend/divisor, frame, span)
	case "%":
		dividend, err := e.number(left, frame, span)
		if err != nil {
			return nil, err
		}
		divisor, err := e.number(right, frame, span)
		if err != nil {
			return nil, err
		}
		if dividend != math.Trunc(dividend) || divisor != math.Trunc(divisor) {
			return nil, e.fail(frame, span, errs.RuntimeType, "% requires integer operands")
		}
		if divisor == 0 {
			return nil, e.fail(frame, span, errs.RuntimeDivZero, "division by zero")
		}
		return math.Mod(dividend, divisor), nil
	case "==":
		return value.LooseEquals(left, right), nil
	case "!=":
		return !value.LooseEquals(left, right), nil
	case "===":
		return value.StrictEquals(left, right), nil
	case "!==":
		return !value.StrictEquals(left, right), nil
	case "<", ">", "<=", ">=":
		order, ok := value.Compare(left, right)
		if !ok {
			return nil, e.fail(frame, span, errs.RuntimeCompare, fmt.Sprintf("%s and %s have no order", value.TypeOf(left), value.TypeOf(right)))
		}
		switch n.Op {
		case "<":
			return order < 0, nil
		case ">":
			return order > 0, nil
		case "<=":
			return order <= 0, nil
		}
		return order >= 0, nil
	case "in":
		switch r := right.(type) {
		case value.List:
			for _, item := range r {
				if value.LooseEquals(item, left) {
					return true, nil
				}
			}
			return false, nil
		case *value.OrderedMap:
			key, err := e.stringify(left, frame, span)
			if err != nil {
				return nil, err
			}
			return r.Has(key), nil
		}
		if text, ok := value.TextOf(right); ok {
			needle, err := e.stringify(left, frame, span)
			if err != nil {
				return nil, err
			}
			return contains(text, needle), nil
		}
		return nil, e.fail(frame, span, errs.RuntimeType, "in requires a list, map or string on the right")
	}
	return nil, e.fail(frame, span, errs.RuntimeType, "unknown operator "+n.Op)
}

func contains(text, needle string) bool {
	for i := 0; i+len(needle) <= len(text); i++ {
		if text[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}

func (e *Evaluator) arith(left, right value.Value, frame *Frame, span ast.Span, op func(a, b float64) float64) (value.Value, error) {
	a, err := e.number(left, frame, span)
	if err != nil {
		return nil, err
	}
	b, err := e.number(right, frame, span)
	if err != nil {
		return nil, err
	}
	return e.finite(op(a, b), frame, span)
}

func (e *Evaluator) number(v value.Value, frame *Frame, span ast.Span) (float64, error) {
	n, err := functions.ToNumber(v)
	if err != nil {
		var fe *functions.Error
		if errors.As(err, &fe) {
			return 0, e.fail(frame, span, fe.Code, fe.Message)
		}
		return 0, err
	}
	return n, nil
}

func (e *Evaluator) finite(v float64, frame *Frame, span ast.Span) (value.Value, error) {
	if math.IsInf(v, 0) || math.IsNaN(v) {
		return nil, e.fail(frame, span, errs.RuntimeType, "arithmetic result is not finite")
	}
	return v, nil
}

func (e *Evaluator) stringify(v value.Value, frame *Frame, span ast.Span) (string, error) {
	text, err := value.Stringify(v)
	if err != nil {
		return "", e.fail(frame, span, errs.RuntimeStringify, err.Error())
	}
	return text, nil
}

func (e *Evaluator) call(name string, args []value.Value, frame *Frame, span ast.Span) (value.Value, error) {
	ctx := functions.Context{Env: e.context.Env}
	if builtin, ok := e.context.Services.Builtins()[name]; ok {
		if len(args) < builtin.Min || (builtin.Max >= 0 && len(args) > builtin.Max) {
			return nil, e.fail(frame, span, errs.RuntimeArity, fmt.Sprintf("%s accepts %d to %d arguments, got %d", name, builtin.Min, builtin.Max, len(args)))
		}
		result, err := builtin.Call(args, ctx)
		if err != nil {
			var fe *functions.Error
			if errors.As(err, &fe) {
				return nil, e.fail(frame, span, fe.Code, fe.Message)
			}
			return nil, err
		}
		return result, nil
	}
	host, ok := e.context.Services.Functions()[name]
	if !ok {
		return nil, e.fail(frame, span, errs.RuntimeUnknownFunction, name+" is not a function")
	}
	result, err := host(args, ctx)
	if err != nil {
		return nil, e.fail(frame, span, errs.RuntimeHostFunction, name+" failed: "+err.Error())
	}
	bound, err := value.Bind(result)
	if err != nil {
		var be *value.BindError
		if errors.As(err, &be) {
			return nil, e.fail(frame, span, be.Code, be.Message)
		}
		return nil, err
	}
	return bound, nil
}

// Lookup implements EXP-19.
func Lookup(container, key value.Value) value.Value {
	switch c := container.(type) {
	case *value.OrderedMap:
		if text, ok := value.TextOf(key); ok {
			return c.MustGet(text)
		}
		if n, ok := key.(float64); ok && n == math.Trunc(n) {
			return c.MustGet(value.NumberToString(n))
		}
		return nil
	case value.List:
		index := -1
		if n, ok := key.(float64); ok && n == math.Trunc(n) {
			index = int(n)
		} else if text, ok := value.TextOf(key); ok && indexPattern.MatchString(text) {
			index, _ = strconv.Atoi(text)
		}
		if index < 0 || index >= len(c) {
			return nil
		}
		return c[index]
	}
	return nil
}
