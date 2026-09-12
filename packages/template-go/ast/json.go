package ast

import (
	"encoding/json"
	"fmt"
)

// DecodeTemplate decodes the canonical AST artifact into the Go AST.
func DecodeTemplate(data []byte) (*Template, error) {
	var raw struct {
		Type string            `json:"type"`
		Name string            `json:"name"`
		Body []json.RawMessage `json:"body"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}
	if raw.Type != "Template" {
		return nil, fmt.Errorf("ast root type must be Template")
	}
	template := &Template{Type: raw.Type, Name: raw.Name, Body: make([]Node, 0, len(raw.Body))}
	for _, item := range raw.Body {
		node, err := decodeNode(item)
		if err != nil {
			return nil, err
		}
		template.Body = append(template.Body, node)
	}
	return template, nil
}

func object(data []byte) (map[string]json.RawMessage, error) {
	var value map[string]json.RawMessage
	if err := json.Unmarshal(data, &value); err != nil {
		return nil, err
	}
	return value, nil
}

func required[T any](fields map[string]json.RawMessage, name string, target *T) error {
	data, ok := fields[name]
	if !ok {
		return fmt.Errorf("ast field %s is missing", name)
	}
	return json.Unmarshal(data, target)
}

func nodes(data json.RawMessage) ([]Node, error) {
	var raw []json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}
	result := make([]Node, 0, len(raw))
	for _, item := range raw {
		node, err := decodeNode(item)
		if err != nil {
			return nil, err
		}
		result = append(result, node)
	}
	return result, nil
}

func decodeNode(data []byte) (Node, error) {
	fields, err := object(data)
	if err != nil {
		return nil, err
	}
	var typ string
	if err := required(fields, "type", &typ); err != nil {
		return nil, err
	}
	switch typ {
	case "Text":
		var value string
		var span Span
		if err := required(fields, "value", &value); err != nil {
			return nil, err
		}
		if err := required(fields, "span", &span); err != nil {
			return nil, err
		}
		return &Text{Type: typ, Value: value, Span: span}, nil
	case "Echo":
		var expression json.RawMessage
		var span Span
		if err := required(fields, "expr", &expression); err != nil {
			return nil, err
		}
		if err := required(fields, "span", &span); err != nil {
			return nil, err
		}
		expr, err := decodeExpr(expression)
		if err != nil {
			return nil, err
		}
		return &Echo{Type: typ, Expr: expr, Span: span}, nil
	case "If":
		var rawBranches []struct {
			Test json.RawMessage `json:"test"`
			Body json.RawMessage `json:"body"`
			Span Span            `json:"span"`
		}
		if err := required(fields, "branches", &rawBranches); err != nil {
			return nil, err
		}
		branches := make([]*IfBranch, 0, len(rawBranches))
		for _, branch := range rawBranches {
			test, e := decodeExpr(branch.Test)
			if e != nil {
				return nil, e
			}
			body, e := nodes(branch.Body)
			if e != nil {
				return nil, e
			}
			branches = append(branches, &IfBranch{Test: test, Body: body, Span: branch.Span})
		}
		var elseRaw json.RawMessage
		if err := required(fields, "else", &elseRaw); err != nil {
			return nil, err
		}
		empty, err := nodes(elseRaw)
		if err != nil {
			return nil, err
		}
		return &If{Type: typ, Branches: branches, Else: empty, Span: spanOf(fields)}, nil
	case "For":
		var name string
		var iterRaw json.RawMessage
		var bodyRaw, emptyRaw json.RawMessage
		var span Span
		if err := required(fields, "name", &name); err != nil {
			return nil, err
		}
		if err := required(fields, "iter", &iterRaw); err != nil {
			return nil, err
		}
		if err := required(fields, "body", &bodyRaw); err != nil {
			return nil, err
		}
		if err := required(fields, "empty", &emptyRaw); err != nil {
			return nil, err
		}
		if err := required(fields, "span", &span); err != nil {
			return nil, err
		}
		iter, err := decodeExpr(iterRaw)
		if err != nil {
			return nil, err
		}
		body, err := nodes(bodyRaw)
		if err != nil {
			return nil, err
		}
		empty, err := nodes(emptyRaw)
		if err != nil {
			return nil, err
		}
		return &For{Type: typ, Name: name, Iter: iter, Body: body, Empty: empty, Span: span}, nil
	case "Set":
		var name string
		var exprRaw json.RawMessage
		var span Span
		if err := required(fields, "name", &name); err != nil {
			return nil, err
		}
		if err := required(fields, "expr", &exprRaw); err != nil {
			return nil, err
		}
		if err := required(fields, "span", &span); err != nil {
			return nil, err
		}
		expr, err := decodeExpr(exprRaw)
		if err != nil {
			return nil, err
		}
		return &Set{Type: typ, Name: name, Expr: expr, Span: span}, nil
	case "Include":
		var path string
		var span Span
		if err := required(fields, "path", &path); err != nil {
			return nil, err
		}
		if err := required(fields, "span", &span); err != nil {
			return nil, err
		}
		return &Include{Type: typ, Path: path, Span: span}, nil
	case "Block":
		var id, path *string
		var scopeRaw json.RawMessage
		var span Span
		if err := required(fields, "id", &id); err != nil {
			return nil, err
		}
		if err := required(fields, "path", &path); err != nil {
			return nil, err
		}
		if err := required(fields, "scope", &scopeRaw); err != nil {
			return nil, err
		}
		if err := required(fields, "span", &span); err != nil {
			return nil, err
		}
		var rawScope []struct {
			Name string          `json:"name"`
			Expr json.RawMessage `json:"expr"`
		}
		if err := json.Unmarshal(scopeRaw, &rawScope); err != nil {
			return nil, err
		}
		scope := make([]*ScopeItem, 0, len(rawScope))
		for _, item := range rawScope {
			expr, e := decodeExpr(item.Expr)
			if e != nil {
				return nil, e
			}
			scope = append(scope, &ScopeItem{Name: item.Name, Expr: expr})
		}
		return &Block{Type: typ, ID: id, Path: path, Scope: scope, Span: span}, nil
	case "IfBlock":
		var id string
		var bodyRaw, elseRaw json.RawMessage
		var span Span
		if err := required(fields, "id", &id); err != nil {
			return nil, err
		}
		if err := required(fields, "body", &bodyRaw); err != nil {
			return nil, err
		}
		if err := required(fields, "else", &elseRaw); err != nil {
			return nil, err
		}
		if err := required(fields, "span", &span); err != nil {
			return nil, err
		}
		body, err := nodes(bodyRaw)
		if err != nil {
			return nil, err
		}
		empty, err := nodes(elseRaw)
		if err != nil {
			return nil, err
		}
		return &IfBlock{Type: typ, ID: id, Body: body, Else: empty, Span: span}, nil
	default:
		return nil, fmt.Errorf("unknown AST node type %q", typ)
	}
}

func spanOf(fields map[string]json.RawMessage) Span {
	var span Span
	_ = required(fields, "span", &span)
	return span
}

func decodeExpr(data []byte) (Expr, error) {
	fields, err := object(data)
	if err != nil {
		return nil, err
	}
	var typ string
	if err := required(fields, "type", &typ); err != nil {
		return nil, err
	}
	var span Span
	if err := required(fields, "span", &span); err != nil {
		return nil, err
	}
	switch typ {
	case "Literal":
		var kind string
		var value any
		if err := required(fields, "kind", &kind); err != nil {
			return nil, err
		}
		if err := required(fields, "value", &value); err != nil {
			return nil, err
		}
		return &Literal{Type: typ, Kind: kind, Value: value, Span: span}, nil
	case "Var":
		var name string
		if err := required(fields, "name", &name); err != nil {
			return nil, err
		}
		return &Var{Type: typ, Name: name, Span: span}, nil
	case "LoopMeta":
		var loop, field string
		if err := required(fields, "loop", &loop); err != nil {
			return nil, err
		}
		if err := required(fields, "field", &field); err != nil {
			return nil, err
		}
		return &LoopMeta{Type: typ, Loop: loop, Field: field, Span: span}, nil
	case "Member":
		var raw json.RawMessage
		var key string
		if err := required(fields, "object", &raw); err != nil {
			return nil, err
		}
		if err := required(fields, "key", &key); err != nil {
			return nil, err
		}
		objectExpr, err := decodeExpr(raw)
		if err != nil {
			return nil, err
		}
		return &Member{Type: typ, Object: objectExpr, Key: key, Span: span}, nil
	case "Index":
		var objectRaw, indexRaw json.RawMessage
		if err := required(fields, "object", &objectRaw); err != nil {
			return nil, err
		}
		if err := required(fields, "index", &indexRaw); err != nil {
			return nil, err
		}
		objectExpr, err := decodeExpr(objectRaw)
		if err != nil {
			return nil, err
		}
		indexExpr, err := decodeExpr(indexRaw)
		if err != nil {
			return nil, err
		}
		return &Index{Type: typ, Object: objectExpr, Index: indexExpr, Span: span}, nil
	case "Call":
		var name string
		var argsRaw []json.RawMessage
		if err := required(fields, "name", &name); err != nil {
			return nil, err
		}
		if err := required(fields, "args", &argsRaw); err != nil {
			return nil, err
		}
		args := make([]Expr, 0, len(argsRaw))
		for _, raw := range argsRaw {
			item, e := decodeExpr(raw)
			if e != nil {
				return nil, e
			}
			args = append(args, item)
		}
		return &Call{Type: typ, Name: name, Args: args, Span: span}, nil
	case "Unary":
		var op string
		var raw json.RawMessage
		if err := required(fields, "op", &op); err != nil {
			return nil, err
		}
		if err := required(fields, "operand", &raw); err != nil {
			return nil, err
		}
		operand, err := decodeExpr(raw)
		if err != nil {
			return nil, err
		}
		return &Unary{Type: typ, Op: op, Operand: operand, Span: span}, nil
	case "Binary":
		var op string
		var leftRaw, rightRaw json.RawMessage
		if err := required(fields, "op", &op); err != nil {
			return nil, err
		}
		if err := required(fields, "left", &leftRaw); err != nil {
			return nil, err
		}
		if err := required(fields, "right", &rightRaw); err != nil {
			return nil, err
		}
		left, err := decodeExpr(leftRaw)
		if err != nil {
			return nil, err
		}
		right, err := decodeExpr(rightRaw)
		if err != nil {
			return nil, err
		}
		return &Binary{Type: typ, Op: op, Left: left, Right: right, Span: span}, nil
	case "Ternary":
		var testRaw, thenRaw, elseRaw json.RawMessage
		if err := required(fields, "test", &testRaw); err != nil {
			return nil, err
		}
		if err := required(fields, "then", &thenRaw); err != nil {
			return nil, err
		}
		if err := required(fields, "else", &elseRaw); err != nil {
			return nil, err
		}
		test, err := decodeExpr(testRaw)
		if err != nil {
			return nil, err
		}
		thenExpr, err := decodeExpr(thenRaw)
		if err != nil {
			return nil, err
		}
		elseExpr, err := decodeExpr(elseRaw)
		if err != nil {
			return nil, err
		}
		return &Ternary{Type: typ, Test: test, Then: thenExpr, Else: elseExpr, Span: span}, nil
	case "List":
		var rawItems []json.RawMessage
		if err := required(fields, "items", &rawItems); err != nil {
			return nil, err
		}
		items := make([]any, 0, len(rawItems))
		for _, raw := range rawItems {
			itemFields, e := object(raw)
			if e != nil {
				return nil, e
			}
			var itemType string
			if e = required(itemFields, "type", &itemType); e != nil {
				return nil, e
			}
			if itemType == "Spread" {
				var exprRaw json.RawMessage
				if e = required(itemFields, "expr", &exprRaw); e != nil {
					return nil, e
				}
				expr, e := decodeExpr(exprRaw)
				if e != nil {
					return nil, e
				}
				var itemSpan Span
				_ = required(itemFields, "span", &itemSpan)
				items = append(items, &Spread{Type: itemType, Expr: expr, Span: itemSpan})
			} else {
				item, e := decodeExpr(raw)
				if e != nil {
					return nil, e
				}
				items = append(items, item)
			}
		}
		return &List{Type: typ, Items: items, Span: span}, nil
	case "Map":
		var rawEntries []json.RawMessage
		if err := required(fields, "entries", &rawEntries); err != nil {
			return nil, err
		}
		entries := make([]any, 0, len(rawEntries))
		for _, raw := range rawEntries {
			entryFields, e := object(raw)
			if e != nil {
				return nil, e
			}
			var itemType string
			if e = json.Unmarshal(entryFields["type"], &itemType); e == nil && itemType == "Spread" {
				var exprRaw json.RawMessage
				if e = required(entryFields, "expr", &exprRaw); e != nil {
					return nil, e
				}
				expr, e := decodeExpr(exprRaw)
				if e != nil {
					return nil, e
				}
				var itemSpan Span
				_ = required(entryFields, "span", &itemSpan)
				entries = append(entries, &Spread{Type: itemType, Expr: expr, Span: itemSpan})
			} else {
				var keyRaw, valueRaw json.RawMessage
				if e = required(entryFields, "key", &keyRaw); e != nil {
					return nil, e
				}
				if e = required(entryFields, "value", &valueRaw); e != nil {
					return nil, e
				}
				key, e := decodeExpr(keyRaw)
				if e != nil {
					return nil, e
				}
				value, e := decodeExpr(valueRaw)
				if e != nil {
					return nil, e
				}
				entries = append(entries, &MapEntry{Key: key, Value: value})
			}
		}
		return &Map{Type: typ, Entries: entries, Span: span}, nil
	default:
		return nil, fmt.Errorf("unknown AST expression type %q", typ)
	}
}
