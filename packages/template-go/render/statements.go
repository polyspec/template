package render

import (
	"errors"

	"github.com/polyspec/template/ast"
	"github.com/polyspec/template/errs"
	"github.com/polyspec/template/loader"
)

// Renderer renders statement nodes (RT-11 to RT-32).
type Renderer struct {
	context   *Context
	evaluator *Evaluator
	program   *Engine
}

// NewRenderer creates a renderer.
func NewRenderer(context *Context, program *Engine) *Renderer {
	return &Renderer{context: context, evaluator: NewEvaluator(context), program: program}
}

// RenderNodes renders a node list in a frame.
func (r *Renderer) RenderNodes(nodes []ast.Node, frame *Frame, scope *Scope) error {
	for _, node := range nodes {
		if err := r.renderNode(node, frame, scope); err != nil {
			return err
		}
	}
	return nil
}

func (r *Renderer) renderNode(node ast.Node, frame *Frame, scope *Scope) error {
	switch n := node.(type) {
	case *ast.Text:
		return r.context.Write(n.Value, frame, &n.Span)
	case *ast.Echo:
		v, err := r.evaluator.EvaluateIn(n.Expr, frame, scope)
		if err != nil {
			return err
		}
		text, err := r.evaluator.runtime.Escape(v, frame, ast.SpanOf(n.Expr))
		if err != nil {
			return err
		}
		return r.context.Write(text, frame, &n.Span)
	case *ast.If:
		for _, branch := range n.Branches {
			test, err := r.evaluator.EvaluateIn(branch.Test, frame, scope)
			if err != nil {
				return err
			}
			if r.evaluator.runtime.Truthy(test) {
				return r.RenderNodes(branch.Body, frame, scope)
			}
		}
		if n.Else != nil {
			return r.RenderNodes(n.Else, frame, scope)
		}
		return nil
	case *ast.For:
		return r.renderFor(n, frame, scope)
	case *ast.Set:
		v, err := r.evaluator.EvaluateIn(n.Expr, frame, scope)
		if err != nil {
			return err
		}
		scope.Locals[n.Name] = v
		return nil
	case *ast.Include:
		return r.renderInclude(n.Path, n.Span, frame, scope)
	case *ast.Block:
		return r.renderBlock(n, frame, scope)
	case *ast.IfBlock:
		if _, ok := r.context.Registry[n.ID]; ok {
			return r.RenderNodes(n.Body, frame, scope)
		}
		if n.Else != nil {
			return r.RenderNodes(n.Else, frame, scope)
		}
		return nil
	}
	return nil
}

func (r *Renderer) renderFor(n *ast.For, frame *Frame, scope *Scope) error {
	iterable, err := r.evaluator.EvaluateIn(n.Iter, frame, scope)
	if err != nil {
		return err
	}
	entries, err := r.evaluator.runtime.Entries(iterable, frame, n.Span)
	if err != nil {
		return err
	}
	if len(entries) == 0 {
		if n.Empty != nil {
			return r.RenderNodes(n.Empty, frame, scope)
		}
		return nil
	}
	previous, hadLocal := scope.Locals[n.Name]
	meta := &LoopMeta{Size: len(entries)}
	scope.Loops[n.Name] = append(scope.Loops[n.Name], meta)
	defer func() {
		stack := scope.Loops[n.Name]
		scope.Loops[n.Name] = stack[:len(stack)-1]
		if hadLocal {
			scope.Locals[n.Name] = previous
		} else {
			delete(scope.Locals, n.Name)
		}
	}()
	for i, item := range entries {
		r.context.Iterations++
		if err := r.evaluator.runtime.Limit("iteration", r.context.Iterations, frame, n.Span); err != nil {
			return err
		}
		meta.Index = i
		meta.Key = item.Key
		meta.Value = item.Value
		meta.First = i == 0
		meta.Last = i == len(entries)-1
		scope.Locals[n.Name] = item.Value
		if err := r.RenderNodes(n.Body, frame, scope); err != nil {
			return err
		}
	}
	return nil
}

func (r *Renderer) resolve(path string, frame *Frame, span ast.Span) (string, error) {
	name, err := loader.ResolvePath(frame.Name, path)
	if err != nil {
		if errors.Is(err, loader.ErrOutsideRoot) {
			return "", r.context.Fail(errs.LoadOutsideRoot, frame, &span, err.Error())
		}
		return "", err
	}
	return name, nil
}

func (r *Renderer) renderInclude(path string, span ast.Span, frame *Frame, scope *Scope) error {
	name, err := r.resolve(path, frame, span)
	if err != nil {
		return err
	}
	template, err := r.program.LoadTemplate(name, frame, &span)
	if err != nil {
		return err
	}
	if err := r.context.Enter(name, frame, &span); err != nil {
		return err
	}
	defer r.context.Leave()
	// RT-21: the included template shares the local scope and the loops of the including template.
	shared := &Frame{Name: template.AST.Name, Lines: template.Lines, Context: frame.Context}
	return r.RenderNodes(template.AST.Body, shared, scope)
}

func (r *Renderer) renderBlock(n *ast.Block, frame *Frame, scope *Scope) error {
	registry := r.context.Registry
	var entry *DefineEntry
	if n.ID != nil && n.Path == nil {
		registered, ok := registry[*n.ID]
		if !ok {
			return r.context.Fail(errs.RuntimeBlockUndefined, frame, &n.Span, "define "+*n.ID+" is not registered")
		}
		entry = registered
	} else {
		name, err := r.resolve(*n.Path, frame, n.Span)
		if err != nil {
			return err
		}
		if n.ID != nil {
			if registered, ok := registry[*n.ID]; ok {
				if registered.HTML != nil || registered.Template != name {
					return r.context.Fail(errs.RuntimeBlockRedefined, frame, &n.Span, "define "+*n.ID+" is registered with a different template")
				}
				entry = registered
			} else {
				entry = &DefineEntry{Template: name}
				registry[*n.ID] = entry
			}
		} else {
			entry = &DefineEntry{Template: name}
		}
	}
	if entry.HTML != nil {
		return r.context.Write(*entry.HTML, frame, &n.Span)
	}
	data := r.context.RootData.Clone()
	if entry.Data != nil {
		for _, k := range entry.Data.Keys() {
			data.Set(k, entry.Data.MustGet(k))
		}
	}
	for _, item := range n.Scope {
		v, err := r.evaluator.EvaluateIn(item.Expr, frame, scope)
		if err != nil {
			return err
		}
		data.Set(item.Name, v)
	}
	template, err := r.program.LoadTemplate(entry.Template, frame, &n.Span)
	if err != nil {
		return err
	}
	if err := r.context.Enter(entry.Template, frame, &n.Span); err != nil {
		return err
	}
	defer r.context.Leave()
	return r.RenderNodes(template.AST.Body, NewFrame(template.AST.Name, template.Lines, data), NewScope())
}
