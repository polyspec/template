package render

import (
	"testing"

	"github.com/polyspec/template/packages/go/ast"
	"github.com/polyspec/template/packages/go/internal/functions"
	"github.com/polyspec/template/packages/go/value"
)

type testOrder struct{ Total float64 }

func (o *testOrder) StatusLabel(prefix string) string { return prefix + ":12" }

// RT-60: an assigned native instance keeps its identity; its public fields are read by member lookup and its public methods are called as object.method(args).
func TestAssignedObjectRetainsPublicFieldsAndMethods(t *testing.T) {
	runtime, err := NewRuntimeEnvironment(nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	root := value.NewOrderedMap()
	root.Set("order", &testOrder{Total: 12})
	context := NewContext(runtime, root, functions.Env{Timezone: "Z"}, "page.tpl")
	bindings := NewRuntimeBindings(context)
	frame := NewFrame("page.tpl", nil, root)
	if got, err := bindings.Member(root.MustGet("order"), "total", frame, ast.Span{0, 1}); err != nil || got != float64(12) {
		t.Fatalf("member = %v %v", got, err)
	}
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
		text, ok := args[0].(string)
		if !ok {
			t.Fatalf("argument is %T, not a string", args[0])
		}
		return text + ":ok", nil
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
