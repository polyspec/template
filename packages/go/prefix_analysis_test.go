package template_test

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"testing"

	template "github.com/polyspec/template/packages/go"
	"github.com/polyspec/template/packages/go/errs"
	"github.com/polyspec/template/packages/go/internal/casetest"
)

// EDT-11: prefix analysis preserves accepted ranges and the first parser error.
func TestPublicPrefixAnalysisMatchesSharedContexts(t *testing.T) {
	typ := reflect.TypeFor[template.PrefixAnalysis]()
	fields := []string{}
	for index := range typ.NumField() {
		field := typ.Field(index)
		if field.IsExported() {
			fields = append(fields, field.Name)
		}
	}
	sort.Strings(fields)
	if !reflect.DeepEqual(fields, []string{"AST", "Error", "Tags", "Tokens"}) {
		t.Fatalf("unexpected public prefix fields: %v", fields)
	}
	data, err := os.ReadFile(filepath.Join(casetest.Dir(t), "..", "fixtures", "prefix-analysis.json"))
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Cases []struct {
			ID, Name, Source, Delimiters string
			Expected                     json.RawMessage
		}
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	if len(fixture.Cases) == 0 {
		t.Fatal("no prefix cases")
	}
	for _, item := range fixture.Cases {
		t.Run(item.ID, func(t *testing.T) {
			result, err := template.AnalyzePrefix([]byte(item.Source), item.Name, template.ParseOptions{Delimiters: item.Delimiters})
			if err != nil {
				t.Fatal(err)
			}
			value := analysisRanges(result.Tags, result.Tokens)
			value["ast"] = result.AST
			value["error"] = nil
			if failure := result.Error; failure != nil {
				if failure.Message == "" {
					t.Fatal("empty error message")
				}
				value["error"] = map[string]any{"code": failure.Code, "template": failure.Template, "line": failure.Line,
					"col": failure.Col, "offset": failure.Offset, "end": failure.End}
			}
			encoded, err := json.Marshal(value)
			if err != nil {
				t.Fatal(err)
			}
			var expected, actual any
			if err := json.Unmarshal(item.Expected, &expected); err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(encoded, &actual); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(actual, expected) {
				t.Fatalf("prefix changed: %s", encoded)
			}
		})
	}
}

// EDT-11: invalid UTF-8 and invalid options reject the operation at the boundary.
func TestPublicPrefixAnalysisRejectsInvalidInputs(t *testing.T) {
	_, err := template.AnalyzePrefix([]byte{255}, "invalid.tpl", template.ParseOptions{})
	var failure *errs.Error
	if !errors.As(err, &failure) || failure.Code != errs.LexInvalidUTF8 {
		t.Fatalf("UTF-8 error = %v", err)
	}
	_, err = template.AnalyzePrefix([]byte("x"), "invalid.tpl", template.ParseOptions{Delimiters: "["})
	if err == nil || errors.As(err, &failure) {
		t.Fatalf("argument error = %v", err)
	}
}
