package template_test

import (
	"errors"
	"fmt"
	"strings"
	"testing"

	template "github.com/polyspec/template"
	"github.com/polyspec/template/errs"
	"github.com/polyspec/template/functions"
	"github.com/polyspec/template/value"
)

// Host binding of Go values and native objects (VAL-2, VAL-15, VAL-17 to VAL-20, FUN-46, ERR-13).

type hostOrder struct {
	Name    string
	Invalid string
	Huge    float64
}

func (o *hostOrder) Same(other any) bool { return other == any(o) }
func (o *hostOrder) Bad() float64        { return 1e19 }
func (o *hostOrder) Fail() (string, error) {
	return "", fmt.Errorf("method exploded")
}

func hostProgram(t *testing.T, templates map[string]string) *template.AstProgram {
	t.Helper()
	program, err := template.NewAstProgram(template.Options{Loader: template.NewMapLoader(templates)})
	if err != nil {
		t.Fatal(err)
	}
	return program
}

func templateError(t *testing.T, err error) *errs.Error {
	t.Helper()
	var templateErr *errs.Error
	if !errors.As(err, &templateErr) {
		t.Fatalf("expected a template error, got %v", err)
	}
	return templateErr
}

func bindCode(input any) errs.Code {
	_, err := value.BindValue(input)
	var bindErr *value.BindError
	if errors.As(err, &bindErr) {
		return bindErr.Code
	}
	if err != nil {
		return "OTHER"
	}
	return "OK"
}

func nestedList(levels int) any {
	var current any = []any{}
	for level := 1; level < levels; level++ {
		current = []any{current}
	}
	return current
}

func TestNumbersAreCheckedByValue(t *testing.T) {
	for _, input := range []any{1e19, float64(1 << 53), int64(1) << 53, uint64(1) << 60, -9007199254740992.0} {
		if code := bindCode(input); code != errs.DataNumberRange {
			t.Errorf("BindValue(%v) = %s", input, code)
		}
	}
	for _, text := range []string{"9007199254740992", "9007199254740992.0", "1e19", "-9.007199254740992e15"} {
		_, err := value.ParseJSON([]byte(text))
		var bindErr *value.BindError
		if !errors.As(err, &bindErr) || bindErr.Code != errs.DataNumberRange {
			t.Errorf("ParseJSON(%s) = %v", text, err)
		}
	}
	if code := bindCode(-9007199254740991.0); code != "OK" {
		t.Errorf("safe number = %s", code)
	}
}

func TestKeysAndJSONTextAreCheckedAsUnicode(t *testing.T) {
	for _, input := range []any{map[string]any{"\xff": 1}, []any{map[string]any{"\xff": 1}}} {
		if code := bindCode(input); code != errs.DataInvalidUTF8 {
			t.Errorf("BindValue(%v) = %s", input, code)
		}
	}
	ordered := value.NewOrderedMap()
	ordered.Set("\xff", 1.0)
	if code := bindCode(ordered); code != errs.DataInvalidUTF8 {
		t.Errorf("ordered map key = %s", code)
	}
	program := hostProgram(t, map[string]string{"a.tpl": "1"})
	_, err := program.Render("a.tpl", nil, template.RenderOptions{Define: map[string]template.DefineInput{"\xff": {Template: "a.tpl"}}})
	if got := templateError(t, err); got.Code != errs.DataInvalidUTF8 {
		t.Errorf("define id = %s", got.Code)
	}
	cases := map[string]errs.Code{
		`"\ud800"`:                   errs.DataInvalidUTF8,
		`{"\udc00": 1}`:              errs.DataInvalidUTF8,
		`{"a": 1e19, "b": "\ud800"}`: errs.DataNumberRange,
		`{"b": "\ud800", "a": 1e19}`: errs.DataInvalidUTF8,
		strings.Repeat("[", 200000):  errs.DataDepth,
		`"😀"`:                        "OK",
		strings.Repeat("[", 64) + strings.Repeat("]", 64): "OK",
		strings.Repeat("[", 65) + strings.Repeat("]", 65): errs.DataDepth,
	}
	for text, want := range cases {
		_, err := value.ParseJSON([]byte(text))
		got := errs.Code("OK")
		var bindErr *value.BindError
		if errors.As(err, &bindErr) {
			got = bindErr.Code
		} else if err != nil {
			got = "OTHER"
		}
		if got != want {
			t.Errorf("ParseJSON(%.40s) = %s, want %s", text, got, want)
		}
	}
}

func TestCyclesAndDeepValuesStopAtTheDepthLimit(t *testing.T) {
	cyclicMap := map[string]any{}
	cyclicMap["self"] = cyclicMap
	cyclicSlice := []any{nil}
	cyclicSlice[0] = cyclicSlice
	var pointer any
	pointer = &pointer
	for name, input := range map[string]any{"map": cyclicMap, "slice": cyclicSlice, "pointer": pointer, "deep": nestedList(200000), "limit": nestedList(65)} {
		if code := bindCode(input); code != errs.DataDepth {
			t.Errorf("%s = %s", name, code)
		}
	}
	if code := bindCode(nestedList(64)); code != "OK" {
		t.Errorf("64 levels = %s", code)
	}
	if code := bindCode(func() {}); code != errs.DataUnsupportedType {
		t.Errorf("function = %s", code)
	}
}

func TestNativeObjectMembersAndArguments(t *testing.T) {
	order := &hostOrder{Name: "n", Invalid: "\xff", Huge: 1e19}
	program := hostProgram(t, map[string]string{
		"fields.tpl":  `{= o.name}|{= o["Name"]}|{= o.missing}`,
		"invalid.tpl": `x{= o.invalid}`,
		"huge.tpl":    `x{= o["huge"]}`,
		"bad.tpl":     `x{= o.bad()}`,
		"fail.tpl":    `x{= o.fail()}`,
		"same.tpl":    `{= same(o, [o], ["k" => o])}|{= o.same(o)}|{= Order::same(o)}`,
		"made.tpl":    `{= make().name}`,
		"panic.tpl":   `{= boom()}`,
	})
	assign := map[string]any{"o": order}
	if out, err := program.Render("fields.tpl", assign, template.RenderOptions{}); err != nil || out != "n|n|" {
		t.Fatalf("fields = %q %v", out, err)
	}
	positions := map[string]errs.Code{"invalid.tpl": errs.DataInvalidUTF8, "huge.tpl": errs.DataNumberRange, "bad.tpl": errs.DataNumberRange}
	for name, code := range positions {
		_, err := program.Render(name, assign, template.RenderOptions{})
		got := templateError(t, err)
		if got.Code != code || got.Line != 1 || got.Col != 5 {
			t.Errorf("%s = %s %d:%d", name, got.Code, got.Line, got.Col)
		}
	}
	_, err := program.Render("fail.tpl", assign, template.RenderOptions{})
	if got := templateError(t, err); got.Code != errs.RuntimeHostFunction || !strings.Contains(got.Message, "method exploded") {
		t.Errorf("fail = %v", got)
	}
	if err := program.Register("same", func(args []value.Value, _ functions.Context) (any, error) {
		list := args[1].(value.List)
		ordered := args[2].(*value.OrderedMap)
		return args[0] == any(order) && list[0] == any(order) && ordered.MustGet("k") == any(order), nil
	}); err != nil {
		t.Fatal(err)
	}
	if err := program.RegisterClass("Order", "same", func(args []value.Value, _ functions.Context) (any, error) {
		return args[0] == any(order), nil
	}); err != nil {
		t.Fatal(err)
	}
	if out, err := program.Render("same.tpl", assign, template.RenderOptions{}); err != nil || out != "true|true|true" {
		t.Fatalf("same = %q %v", out, err)
	}
	if err := program.Register("make", func([]value.Value, functions.Context) (any, error) { return order, nil }); err != nil {
		t.Fatal(err)
	}
	if out, err := program.Render("made.tpl", nil, template.RenderOptions{}); err != nil || out != "n" {
		t.Fatalf("made = %q %v", out, err)
	}
	if err := program.Register("boom", func([]value.Value, functions.Context) (any, error) { panic("host defect") }); err != nil {
		t.Fatal(err)
	}
	_, err = program.Render("panic.tpl", nil, template.RenderOptions{})
	if got := templateError(t, err); got.Code != errs.Internal || got.Template != "panic.tpl" || got.Line != 0 || !strings.Contains(got.Message, "host defect") {
		t.Errorf("panic = %v", got)
	}
	prepared, err := program.Prepare("panic.tpl", nil, template.RenderOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := prepared.Render(); templateError(t, err).Code != errs.Internal {
		t.Errorf("prepared panic = %v", err)
	}
}
