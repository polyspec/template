package template_test

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	template "github.com/polyspec/template/packages/template-go"
	"github.com/polyspec/template/packages/template-go/errs"
	"github.com/polyspec/template/packages/template-go/functions"
	"github.com/polyspec/template/packages/template-go/value"
)

// Host argument form (VAL-21) and native object equality (EXP-39) with the shared fixture of
// tests/fixtures/native-object/host-values.json.

var nativeFixtureDir = filepath.Join("..", "..", "tests", "fixtures", "native-object")

type valueOrder struct{ Label string }

// Describe is the instance method of the shared fixture; it receives every argument as an `any`.
func (o *valueOrder) Describe(a, b, c, d, e, f, g, h any) string {
	return describeArguments([]any{a, b, c, d, e, f, g, h}, o)
}

func describeValue(input any, order *valueOrder) string {
	switch current := input.(type) {
	case nil:
		return "null"
	case bool:
		return "bool(" + strconv.FormatBool(current) + ")"
	case float64:
		return "number(" + strconv.FormatFloat(current, 'f', -1, 64) + ")"
	case string:
		return "string(" + current + ")"
	case value.List:
		parts := make([]string, len(current))
		for index, item := range current {
			parts[index] = describeValue(item, order)
		}
		return "list(" + strings.Join(parts, ",") + ")"
	case *value.OrderedMap:
		parts := []string{}
		for _, key := range current.Keys() {
			parts = append(parts, key+"="+describeValue(current.MustGet(key), order))
		}
		return "map(" + strings.Join(parts, ",") + ")"
	case *valueOrder:
		if current == order {
			return "object(order)"
		}
	}
	return "unexpected"
}

func describeArguments(args []any, order *valueOrder) string {
	parts := make([]string, len(args))
	for index, item := range args {
		parts[index] = describeValue(item, order)
	}
	return strings.Join(parts, ",")
}

type hostValueExpectations struct {
	Outputs map[string]string `json:"outputs"`
	Errors  map[string]string `json:"errors"`
}

func renderHostValue(t *testing.T, target string, templates map[string]string) (string, error) {
	t.Helper()
	order := &valueOrder{Label: "order"}
	program := hostProgram(t, templates)
	register := func(name string, fn functions.HostFunction) {
		if err := program.Register(name, fn); err != nil {
			t.Fatal(err)
		}
	}
	register("describe", func(args []value.Value, _ functions.Context) (any, error) {
		return describeArguments(args, order), nil
	})
	register("mutate", func(args []value.Value, _ functions.Context) (any, error) {
		list := args[0].(value.List)
		list[0] = "changed"
		args[1].(*value.OrderedMap).Set("k", "changed")
		args[1].(*value.OrderedMap).Set("added", true)
		args[2].(value.List)[0] = "changed"
		return nil, nil
	})
	register("pick", func(args []value.Value, _ functions.Context) (any, error) { return args[0], nil })
	if err := program.RegisterClass("Order", "describe", func(args []value.Value, _ functions.Context) (any, error) {
		return describeArguments(args, order), nil
	}); err != nil {
		t.Fatal(err)
	}
	assign := map[string]any{"order": order, "same": order, "other": &valueOrder{Label: "order"}, "items": []any{1}}
	return program.Render(target, assign, template.RenderOptions{})
}

func TestHostArgumentsAndNativeEquality(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(nativeFixtureDir, "host-values.json"))
	if err != nil {
		t.Fatal(err)
	}
	var expected hostValueExpectations
	if err := json.Unmarshal(data, &expected); err != nil {
		t.Fatal(err)
	}
	templates := map[string]string{}
	for name := range expected.Outputs {
		templates[name] = readFixture(t, name)
	}
	for name := range expected.Errors {
		templates[name] = readFixture(t, name)
	}
	for target, output := range expected.Outputs {
		if actual, err := renderHostValue(t, target, templates); err != nil || actual != output {
			t.Errorf("%s = %q %v, want %q", target, actual, err, output)
		}
	}
	for target, code := range expected.Errors {
		_, err := renderHostValue(t, target, templates)
		var templateErr *errs.Error
		if !errors.As(err, &templateErr) || string(templateErr.Code) != code {
			t.Errorf("%s = %v, want %s", target, err, code)
		}
	}
}

func readFixture(t *testing.T, name string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(nativeFixtureDir, name))
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

type comparableOrder struct{ ID int }

type listOrder struct{ Items []int }

// EXP-39 in Go: a struct value has no identity, so two struct values are the same object when Go
// == reports them equal; a value whose contents are not comparable equals no native object.
func TestStructValueEquality(t *testing.T) {
	program := hostProgram(t, map[string]string{"eq.tpl": `{= a == b}|{= a == c}|{= l == l}|{= p == q}`})
	assign := map[string]any{
		"a": comparableOrder{ID: 1}, "b": comparableOrder{ID: 1}, "c": comparableOrder{ID: 2},
		"l": listOrder{Items: []int{1}}, "p": &comparableOrder{ID: 1}, "q": &comparableOrder{ID: 1},
	}
	if out, err := program.Render("eq.tpl", assign, template.RenderOptions{}); err != nil || out != "true|false|false|false" {
		t.Fatalf("struct equality = %q %v", out, err)
	}
}
