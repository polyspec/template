package render

import (
	"github.com/polyspec/template/ast"
	"github.com/polyspec/template/errs"
	"github.com/polyspec/template/value"
)

// Evaluator evaluates expressions (docs/spec/expressions.md).
type Evaluator struct {
	context *Context
	runtime *RuntimeBindings
	depth   int
	scope   *Scope
}

// NewEvaluator creates an evaluator.
func NewEvaluator(context *Context) *Evaluator {
	return &Evaluator{context: context, runtime: NewRuntimeBindings(context), scope: NewScope()}
}

// EvaluateIn evaluates with an explicit local and loop scope.
func (e *Evaluator) EvaluateIn(expr ast.Expr, frame *Frame, scope *Scope) (value.Value, error) {
	e.scope = scope
	return e.Evaluate(expr, frame)
}

func (e *Evaluator) fail(frame *Frame, span ast.Span, code errs.Code, message string) error {
	return e.runtime.Error(frame, span, code, message)
}

// Evaluate evaluates an expression in a frame.
func (e *Evaluator) Evaluate(expr ast.Expr, frame *Frame) (value.Value, error) {
	e.depth++
	defer func() { e.depth-- }()
	if err := e.runtime.Limit("expression", e.depth, frame, ast.SpanOf(expr)); err != nil {
		return nil, err
	}
	switch n := expr.(type) {
	case *ast.Literal:
		return n.Value, nil
	case *ast.Var:
		return e.scope.Lookup(frame, n.Name), nil
	case *ast.LoopMeta:
		meta := e.scope.LoopMeta(n.Loop)
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
		return e.runtime.Member(object, n.Key), nil
	case *ast.Index:
		object, err := e.Evaluate(n.Object, frame)
		if err != nil {
			return nil, err
		}
		key, err := e.Evaluate(n.Index, frame)
		if err != nil {
			return nil, err
		}
		return e.runtime.Index(object, key), nil
	case *ast.Call:
		args := make([]value.Value, len(n.Args))
		for i, arg := range n.Args {
			v, err := e.Evaluate(arg, frame)
			if err != nil {
				return nil, err
			}
			args[i] = v
		}
		return e.runtime.Call(n.Name, args, frame, n.Span)
	case *ast.Unary:
		operand, err := e.Evaluate(n.Operand, frame)
		if err != nil {
			return nil, err
		}
		return e.runtime.Unary(n.Op, operand, frame, n.Span)
	case *ast.Binary:
		return e.binary(n, frame)
	case *ast.Ternary:
		test, err := e.Evaluate(n.Test, frame)
		if err != nil {
			return nil, err
		}
		if e.runtime.Truthy(test) {
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
			key, err := e.runtime.Stringify(keyValue, frame, ast.SpanOf(pair.Key))
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

func (e *Evaluator) binary(n *ast.Binary, frame *Frame) (value.Value, error) {
	switch n.Op {
	case "&&":
		left, err := e.Evaluate(n.Left, frame)
		if err != nil {
			return nil, err
		}
		if !e.runtime.Truthy(left) {
			return false, nil
		}
		right, err := e.Evaluate(n.Right, frame)
		if err != nil {
			return nil, err
		}
		return e.runtime.Truthy(right), nil
	case "||":
		left, err := e.Evaluate(n.Left, frame)
		if err != nil {
			return nil, err
		}
		if e.runtime.Truthy(left) {
			return true, nil
		}
		right, err := e.Evaluate(n.Right, frame)
		if err != nil {
			return nil, err
		}
		return e.runtime.Truthy(right), nil
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
	return e.runtime.Binary(n.Op, left, right, frame, n.Span)
}
