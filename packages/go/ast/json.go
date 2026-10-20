package ast

import (
	"encoding/json"
	"fmt"
)

// DecodeTemplate decodes the canonical JSON text of a template AST (AST-7) into the Go AST. The JSON is validated
// against contracts/schema/ast.schema.json first (AST-10): text that is not JSON fails with the error of reading JSON,
// and JSON that the schema rejects fails with a *DecodeError that names the JSON Pointer of the invalid node.
func DecodeTemplate(data []byte) (*Template, error) {
	if err := validate(data); err != nil {
		return nil, err
	}
	var raw struct {
		Type     string            `json:"type"`
		Name     string            `json:"name"`
		Body     []json.RawMessage `json:"body"`
		Comments *[]*Comment       `json:"comments"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}
	if raw.Type != "Template" {
		return nil, fmt.Errorf("ast root type must be Template")
	}
	if raw.Comments == nil {
		return nil, fmt.Errorf("ast field comments is missing")
	}
	template := &Template{Type: raw.Type, Name: raw.Name, Body: make([]Node, 0, len(raw.Body)), Comments: *raw.Comments}
	for _, item := range raw.Body {
		node, err := decodeNode(item)
		if err != nil {
			return nil, err
		}
		template.Body = append(template.Body, node)
	}
	return template, nil
}

// fieldReader reads the fields of one JSON object of the AST. The first failure is kept and every later read returns the zero
// value, so a decoder reads all the fields of a node and checks the failure once.
type fieldReader struct {
	fields map[string]json.RawMessage
	err    error
}

func newFieldReader(data []byte) *fieldReader {
	reader := &fieldReader{}
	reader.fields, reader.err = object(data)
	return reader
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

// read decodes the field name into target; a failure is kept.
func read[T any](r *fieldReader, name string, target *T) {
	if r.err == nil {
		r.err = required(r.fields, name, target)
	}
}

func (r *fieldReader) text(name string) string {
	var value string
	read(r, name, &value)
	return value
}

func (r *fieldReader) span() Span {
	var value Span
	read(r, "span", &value)
	return value
}

func (r *fieldReader) raw(name string) json.RawMessage {
	var value json.RawMessage
	read(r, name, &value)
	return value
}

// expr decodes the expression of the field name.
func (r *fieldReader) expr(name string) Expr {
	raw := r.raw(name)
	if r.err != nil {
		return nil
	}
	value, err := decodeExpr(raw)
	r.err = err
	return value
}

// exprs decodes the list of expressions of the field name.
func (r *fieldReader) exprs(name string) []Expr {
	var raws []json.RawMessage
	read(r, name, &raws)
	if r.err != nil {
		return nil
	}
	result := make([]Expr, 0, len(raws))
	for _, raw := range raws {
		item, err := decodeExpr(raw)
		if err != nil {
			r.err = err
			return nil
		}
		result = append(result, item)
	}
	return result
}

// nodes decodes the list of nodes of the field name; JSON null stays nil (AST-3).
func (r *fieldReader) nodes(name string) []Node {
	raw := r.raw(name)
	if r.err != nil {
		return nil
	}
	value, err := nodes(raw)
	r.err = err
	return value
}

func nodes(data json.RawMessage) ([]Node, error) {
	var raw []json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}
	// JSON null, the absent branch of a block (AST-3), stays nil, which encodes as null again; an empty list is an
	// empty slice.
	if raw == nil {
		return nil, nil
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
	r := newFieldReader(data)
	typ := r.text("type")
	if r.err != nil {
		return nil, r.err
	}
	var node Node
	switch typ {
	case "Text":
		node = &Text{Type: typ, Value: r.text("value"), Span: r.span()}
	case "Echo":
		node = &Echo{Type: typ, Expr: r.expr("expr"), Span: r.span()}
	case "If":
		node = decodeIf(r, typ)
	case "For":
		node = &For{Type: typ, Name: r.text("name"), Iter: r.expr("iter"), Body: r.nodes("body"), Empty: r.nodes("empty"), Span: r.span()}
	case "Set":
		node = &Set{Type: typ, Name: r.text("name"), Expr: r.expr("expr"), Span: r.span()}
	case "Include":
		node = &Include{Type: typ, Path: r.text("path"), Span: r.span()}
	case "Block":
		node = decodeBlock(r, typ)
	case "IfBlock":
		node = &IfBlock{Type: typ, ID: r.text("id"), Body: r.nodes("body"), Else: r.nodes("else"), Span: r.span()}
	default:
		return nil, fmt.Errorf("unknown AST node type %q", typ)
	}
	if r.err != nil {
		return nil, r.err
	}
	return node, nil
}

func decodeIf(r *fieldReader, typ string) *If {
	var rawBranches []struct {
		Test json.RawMessage `json:"test"`
		Body json.RawMessage `json:"body"`
		Span Span            `json:"span"`
	}
	read(r, "branches", &rawBranches)
	branches := make([]*IfBranch, 0, len(rawBranches))
	for _, branch := range rawBranches {
		if r.err != nil {
			break
		}
		test, err := decodeExpr(branch.Test)
		if err != nil {
			r.err = err
			break
		}
		body, err := nodes(branch.Body)
		if err != nil {
			r.err = err
			break
		}
		branches = append(branches, &IfBranch{Test: test, Body: body, Span: branch.Span})
	}
	return &If{Type: typ, Branches: branches, Else: r.nodes("else"), Span: r.span()}
}

func decodeBlock(r *fieldReader, typ string) *Block {
	var id, path *string
	read(r, "id", &id)
	read(r, "path", &path)
	var rawScope []struct {
		Name string          `json:"name"`
		Expr json.RawMessage `json:"expr"`
	}
	read(r, "scope", &rawScope)
	scope := make([]*ScopeItem, 0, len(rawScope))
	for _, item := range rawScope {
		if r.err != nil {
			break
		}
		expr, err := decodeExpr(item.Expr)
		if err != nil {
			r.err = err
			break
		}
		scope = append(scope, &ScopeItem{Name: item.Name, Expr: expr})
	}
	return &Block{Type: typ, ID: id, Path: path, Scope: scope, Span: r.span()}
}

func decodeExpr(data []byte) (Expr, error) {
	r := newFieldReader(data)
	typ := r.text("type")
	span := r.span()
	if r.err != nil {
		return nil, r.err
	}
	var expr Expr
	switch typ {
	case "Literal":
		var value any
		kind := r.text("kind")
		read(r, "value", &value)
		expr = &Literal{Type: typ, Kind: kind, Value: value, Span: span}
	case "Var":
		expr = &Var{Type: typ, Name: r.text("name"), Span: span}
	case "LoopMeta":
		expr = &LoopMeta{Type: typ, Loop: r.text("loop"), Field: r.text("field"), Span: span}
	case "Member":
		expr = &Member{Type: typ, Object: r.expr("object"), Key: r.text("key"), Span: span}
	case "MemberCall":
		expr = &MemberCall{Type: typ, Object: r.expr("object"), Method: r.text("method"), Args: r.exprs("args"), Span: span}
	case "ClassCall":
		expr = &ClassCall{Type: typ, ClassName: r.text("className"), Method: r.text("method"), Args: r.exprs("args"), Span: span}
	case "Index":
		expr = &Index{Type: typ, Object: r.expr("object"), Index: r.expr("index"), Span: span}
	case "Call":
		expr = &Call{Type: typ, Name: r.text("name"), Args: r.exprs("args"), Span: span}
	case "Unary":
		expr = &Unary{Type: typ, Op: r.text("op"), Operand: r.expr("operand"), Span: span}
	case "Binary":
		expr = &Binary{Type: typ, Op: r.text("op"), Left: r.expr("left"), Right: r.expr("right"), Span: span}
	case "Ternary":
		expr = decodeTernary(r, typ, span)
	case "List":
		expr = &List{Type: typ, Items: r.entries("items", decodeListItem), Span: span}
	case "Map":
		expr = &Map{Type: typ, Entries: r.entries("entries", decodeMapEntry), Span: span}
	default:
		return nil, fmt.Errorf("unknown AST expression type %q", typ)
	}
	if r.err != nil {
		return nil, r.err
	}
	return expr, nil
}

func decodeTernary(r *fieldReader, typ string, span Span) *Ternary {
	test := r.expr("test")
	thenRaw := r.raw("then")
	// The elvis form a ?: b has no then branch, which the artifact writes as null.
	var thenExpr Expr
	if r.err == nil && string(thenRaw) != "null" {
		thenExpr, r.err = decodeExpr(thenRaw)
	}
	return &Ternary{Type: typ, Test: test, Then: thenExpr, Else: r.expr("else"), Span: span}
}

// entries decodes the list of the field name with decode, which reads one item as a reader of its fields.
func (r *fieldReader) entries(name string, decode func(raw json.RawMessage) (any, error)) []any {
	var raws []json.RawMessage
	read(r, name, &raws)
	if r.err != nil {
		return nil
	}
	result := make([]any, 0, len(raws))
	for _, raw := range raws {
		item, err := decode(raw)
		if err != nil {
			r.err = err
			return nil
		}
		result = append(result, item)
	}
	return result
}

// spread decodes a spread entry (EXP-16), which a list and a map hold beside their own items.
func spread(r *fieldReader, itemType string) *Spread {
	return &Spread{Type: itemType, Expr: r.expr("expr"), Span: spanOf(r.fields)}
}

func decodeListItem(raw json.RawMessage) (any, error) {
	r := newFieldReader(raw)
	itemType := r.text("type")
	if r.err != nil {
		return nil, r.err
	}
	if itemType != "Spread" {
		return decodeExpr(raw)
	}
	item := spread(r, itemType)
	return item, r.err
}

func decodeMapEntry(raw json.RawMessage) (any, error) {
	r := newFieldReader(raw)
	if r.err != nil {
		return nil, r.err
	}
	var itemType string
	if err := json.Unmarshal(r.fields["type"], &itemType); err == nil && itemType == "Spread" {
		item := spread(r, itemType)
		return item, r.err
	}
	entry := &MapEntry{Key: r.expr("key"), Value: r.expr("value")}
	return entry, r.err
}

func spanOf(fields map[string]json.RawMessage) Span {
	var span Span
	_ = required(fields, "span", &span)
	return span
}
