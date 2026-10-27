package template_test

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	template "github.com/polyspec/template/packages/go"
	"github.com/polyspec/template/packages/go/errs"
	"github.com/polyspec/template/packages/go/format"
	"github.com/polyspec/template/packages/go/internal/casetest"
)

type formatterSDKFixture struct {
	Cases []struct {
		ID, Source string
		Options    struct {
			Name, Delimiters, TemplateBlocks string
			Range                            *template.FormatRange
			Indent                           json.RawMessage
		}
		Expected json.RawMessage
	}
	Errors []struct {
		Reason    string
		Code      *string
		Line, Col int
		Message   string
	}
}

func formatterSDKData(t *testing.T) formatterSDKFixture {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(casetest.Dir(t), "..", "fixtures", "formatter-sdk.json"))
	if err != nil {
		t.Fatal(err)
	}
	var fixture formatterSDKFixture
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	if len(fixture.Cases) == 0 || len(fixture.Errors) != 3 {
		t.Fatal("incomplete formatter fixture")
	}
	return fixture
}

// FMT-16: root and native formatter entries share the public options/result data.
func TestFormatterSDKPreservesSharedResults(t *testing.T) {
	for _, item := range formatterSDKData(t).Cases {
		t.Run(item.ID, func(t *testing.T) {
			var options format.Options = template.FormatOptions{Name: item.Options.Name, Delimiters: item.Options.Delimiters,
				Range: item.Options.Range, TemplateBlocks: item.Options.TemplateBlocks}
			if string(item.Options.Indent) == "null" {
				options.KeepIndentation = true
			} else if len(item.Options.Indent) > 0 {
				if err := json.Unmarshal(item.Options.Indent, &options.Indent); err != nil {
					t.Fatal(err)
				}
			}
			for _, call := range []func(string, format.Options) (format.Result, error){template.Format, format.Format} {
				result, err := call(item.Source, options)
				var actual map[string]any
				if err == nil {
					actual = map[string]any{"ok": true, "text": result.Text, "changed": result.Changed}
				} else {
					var failure *template.FormatError
					if !errors.As(err, &failure) {
						t.Fatal(err)
					}
					if failure.Message == "" {
						t.Fatal("empty error message")
					}
					var code any
					if failure.Code != "" {
						code = failure.Code
					}
					actual = map[string]any{"ok": false, "error": map[string]any{"reason": failure.Reason, "code": code,
						"line": failure.Line, "col": failure.Col}}
				}
				encoded, err := json.Marshal(actual)
				if err != nil {
					t.Fatal(err)
				}
				var got, want any
				if err := json.Unmarshal(encoded, &got); err != nil {
					t.Fatal(err)
				}
				if err := json.Unmarshal(item.Expected, &want); err != nil {
					t.Fatal(err)
				}
				if !reflect.DeepEqual(got, want) {
					t.Fatalf("formatter = %s, want %s", encoded, item.Expected)
				}
			}
		})
	}
}

// FMT-16: each native error reason preserves all five public error fields.
func TestFormatterSDKConstructsSharedErrorData(t *testing.T) {
	for _, data := range formatterSDKData(t).Errors {
		var code errs.Code
		if data.Code != nil {
			code = errs.Code(*data.Code)
		}
		native := format.Error{Reason: format.Reason(data.Reason), Code: code, Line: data.Line, Col: data.Col, Message: data.Message}
		var public *template.FormatError = &native
		if string(public.Reason) != data.Reason || public.Code != code || public.Line != data.Line || public.Col != data.Col || public.Message != data.Message {
			t.Fatalf("error fields changed: %+v", public)
		}
		if !strings.Contains(public.Error(), data.Message) {
			t.Fatal("native diagnostic lost its message")
		}
		var value template.FormatResult = format.Result{Text: "text", Changed: false}
		if value.Text != "text" || value.Changed {
			t.Fatalf("result fields changed: %+v", value)
		}
	}
}
