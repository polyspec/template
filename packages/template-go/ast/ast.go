// Package ast defines the AST nodes of docs/spec/ast.md and their JSON form.
package ast

// Span is a byte range [start, end) of the template source.
type Span [2]int

// Template is the root node.
type Template struct {
	Type string `json:"type"`
	Name string `json:"name"`
	Body []Node `json:"body"`
}

// Node is a statement node.
type Node interface{ node() }

// Expr is an expression node.
type Expr interface{ expr() }

// Text node.
type Text struct {
	Type  string `json:"type"`
	Value string `json:"value"`
	Span  Span   `json:"span"`
}

// Echo node.
type Echo struct {
	Type string `json:"type"`
	Expr Expr   `json:"expr"`
	Span Span   `json:"span"`
}

// IfBranch is one branch of an If node.
type IfBranch struct {
	Test Expr   `json:"test"`
	Body []Node `json:"body"`
	Span Span   `json:"span"`
}

// If node.
type If struct {
	Type     string      `json:"type"`
	Branches []*IfBranch `json:"branches"`
	Else     []Node      `json:"else"`
	Span     Span        `json:"span"`
}

// For node.
type For struct {
	Type  string `json:"type"`
	Name  string `json:"name"`
	Iter  Expr   `json:"iter"`
	Body  []Node `json:"body"`
	Empty []Node `json:"empty"`
	Span  Span   `json:"span"`
}

// Set node.
type Set struct {
	Type string `json:"type"`
	Name string `json:"name"`
	Expr Expr   `json:"expr"`
	Span Span   `json:"span"`
}

// Include node.
type Include struct {
	Type string `json:"type"`
	Path string `json:"path"`
	Span Span   `json:"span"`
}

// ScopeItem is one scope argument of a block tag.
type ScopeItem struct {
	Name string `json:"name"`
	Expr Expr   `json:"expr"`
}

// Block node.
type Block struct {
	Type  string       `json:"type"`
	ID    *string      `json:"id"`
	Path  *string      `json:"path"`
	Scope []*ScopeItem `json:"scope"`
	Span  Span         `json:"span"`
}

// IfBlock node.
type IfBlock struct {
	Type string `json:"type"`
	ID   string `json:"id"`
	Body []Node `json:"body"`
	Else []Node `json:"else"`
	Span Span   `json:"span"`
}

func (*Text) node()    {}
func (*Echo) node()    {}
func (*If) node()      {}
func (*For) node()     {}
func (*Set) node()     {}
func (*Include) node() {}
func (*Block) node()   {}
func (*IfBlock) node() {}

// Literal node; Value is nil, bool, float64 or string.
type Literal struct {
	Type  string `json:"type"`
	Kind  string `json:"kind"`
	Value any    `json:"value"`
	Span  Span   `json:"span"`
}

// Var node.
type Var struct {
	Type string `json:"type"`
	Name string `json:"name"`
	Span Span   `json:"span"`
}

// LoopMeta node.
type LoopMeta struct {
	Type  string `json:"type"`
	Loop  string `json:"loop"`
	Field string `json:"field"`
	Span  Span   `json:"span"`
}

// Member node.
type Member struct {
	Type   string `json:"type"`
	Object Expr   `json:"object"`
	Key    string `json:"key"`
	Span   Span   `json:"span"`
}

// MemberCall invokes a method on an assigned object.
type MemberCall struct {
	Type   string `json:"type"`
	Object Expr   `json:"object"`
	Method string `json:"method"`
	Args   []Expr `json:"args"`
	Span   Span   `json:"span"`
}

// ClassCall invokes a declared logical class function.
type ClassCall struct {
	Type      string `json:"type"`
	ClassName string `json:"className"`
	Method    string `json:"method"`
	Args      []Expr `json:"args"`
	Span      Span   `json:"span"`
}

// Index node.
type Index struct {
	Type   string `json:"type"`
	Object Expr   `json:"object"`
	Index  Expr   `json:"index"`
	Span   Span   `json:"span"`
}

// Call node.
type Call struct {
	Type string `json:"type"`
	Name string `json:"name"`
	Args []Expr `json:"args"`
	Span Span   `json:"span"`
}

// Unary node.
type Unary struct {
	Type    string `json:"type"`
	Op      string `json:"op"`
	Operand Expr   `json:"operand"`
	Span    Span   `json:"span"`
}

// Binary node.
type Binary struct {
	Type  string `json:"type"`
	Op    string `json:"op"`
	Left  Expr   `json:"left"`
	Right Expr   `json:"right"`
	Span  Span   `json:"span"`
}

// Ternary node; Then is nil for the elvis form.
type Ternary struct {
	Type string `json:"type"`
	Test Expr   `json:"test"`
	Then Expr   `json:"then"`
	Else Expr   `json:"else"`
	Span Span   `json:"span"`
}

// Spread entry of a list or map literal.
type Spread struct {
	Type string `json:"type"`
	Expr Expr   `json:"expr"`
	Span Span   `json:"span"`
}

// List literal; Items holds Expr or *Spread.
type List struct {
	Type  string `json:"type"`
	Items []any  `json:"items"`
	Span  Span   `json:"span"`
}

// MapEntry of a map literal.
type MapEntry struct {
	Key   Expr `json:"key"`
	Value Expr `json:"value"`
}

// Map literal; Entries holds *MapEntry or *Spread.
type Map struct {
	Type    string `json:"type"`
	Entries []any  `json:"entries"`
	Span    Span   `json:"span"`
}

func (*Literal) expr()  {}
func (*Var) expr()      {}
func (*LoopMeta) expr() {}
func (*Member) expr()   {}
func (*MemberCall) expr() {}
func (*ClassCall) expr() {}
func (*Index) expr()    {}
func (*Call) expr()     {}
func (*Unary) expr()    {}
func (*Binary) expr()   {}
func (*Ternary) expr()  {}
func (*List) expr()     {}
func (*Map) expr()      {}

// LoopMetaFields are the fields of EXP-21.
var LoopMetaFields = map[string]bool{"index_": true, "key_": true, "value_": true, "last_": true, "first_": true, "size_": true}

// SpanOf returns the span of an expression node.
func SpanOf(e Expr) Span {
	switch n := e.(type) {
	case *Literal:
		return n.Span
	case *Var:
		return n.Span
	case *LoopMeta:
		return n.Span
	case *Member:
		return n.Span
	case *MemberCall:
		return n.Span
	case *ClassCall:
		return n.Span
	case *Index:
		return n.Span
	case *Call:
		return n.Span
	case *Unary:
		return n.Span
	case *Binary:
		return n.Span
	case *Ternary:
		return n.Span
	case *List:
		return n.Span
	case *Map:
		return n.Span
	}
	return Span{}
}
