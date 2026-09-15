package render

import (
	"testing"

	"github.com/polyspec/template/ast"
	"github.com/polyspec/template/functions"
	"github.com/polyspec/template/value"
)

type testOrder struct{ Total float64 }

func (o *testOrder) StatusLabel(prefix string) string { return prefix + ":12" }

func TestAssignedObjectRetainsPublicFieldsAndMethods(t *testing.T) {
	runtime, err := NewRuntimeEnvironment(nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	root := value.NewOrderedMap()
	root.Set("order", &testOrder{Total: 12})
	context := NewContext(runtime, root, functions.Env{Timezone: "Z"}, "page.tpl")
	bindings := NewRuntimeBindings(context)
	if got := bindings.Member(root.MustGet("order"), "total"); got != float64(12) {
		t.Fatalf("member = %v", got)
	}
	frame := NewFrame("page.tpl", nil, root)
	got, err := bindings.MemberCall(root.MustGet("order"), "status_label", []value.Value{"ready"}, frame, ast.Span{0, 1})
	if err != nil {
		t.Fatal(err)
	}
	if got != "ready:12" {
		t.Fatalf("method = %v", got)
	}
}

func TestRegisteredClassFunctionIsCallable(t *testing.T) {
	runtime, err := NewRuntimeEnvironment(nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.RegisterClass("Order", "status_label", func(args []value.Value, _ functions.Context) (value.Value, error) {
		return args[0].(string) + ":ok", nil
	}); err != nil {
		t.Fatal(err)
	}
	root := value.NewOrderedMap()
	context := NewContext(runtime, root, functions.Env{Timezone: "Z"}, "page.tpl")
	got, err := NewRuntimeBindings(context).ClassCall("Order", "status_label", []value.Value{"ready"}, NewFrame("page.tpl", nil, root), ast.Span{0, 1})
	if err != nil {
		t.Fatal(err)
	}
	if got != "ready:ok" {
		t.Fatalf("class method = %v", got)
	}
}
