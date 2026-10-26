package template_test

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	template "github.com/polyspec/template/packages/go"
	"github.com/polyspec/template/packages/go/errs"
	"github.com/polyspec/template/packages/go/internal/casetest"
)

// EDT-10: public analysis preserves AST, tags and classified byte ranges.
func TestPublicAnalysisMatchesSharedContexts(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(casetest.Dir(t), "..", "fixtures", "analysis-context.json"))
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Cases []struct {
			ID, Name, Source string
			Expected         json.RawMessage
		}
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	if len(fixture.Cases) == 0 {
		t.Fatal("no analysis cases")
	}
	for _, item := range fixture.Cases {
		t.Run(item.ID, func(t *testing.T) {
			result, err := template.Analyze([]byte(item.Source), item.Name, template.ParseOptions{})
			if err != nil {
				t.Fatal(err)
			}
			tags := make([]map[string]any, 0, len(result.Tags))
			for _, tag := range result.Tags {
				tags = append(tags, map[string]any{"kind": tag.Kind, "echo": tag.Echo, "start": tag.Start, "end": tag.End,
					"bodyStart": tag.BodyStart, "bodyEnd": tag.BodyEnd})
			}
			tokens := make([]map[string]any, 0, len(result.Tokens))
			for _, token := range result.Tokens {
				tokens = append(tokens, map[string]any{"kind": token.Kind, "start": token.Start, "end": token.End})
			}
			encoded, err := json.Marshal(map[string]any{"ast": result.AST, "tags": tags, "tokens": tokens})
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
				t.Fatalf("analysis changed: %s", encoded)
			}
			parsed, err := template.Parse([]byte(item.Source), item.Name, template.ParseOptions{})
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(parsed, result.AST) {
				t.Fatal("analysis AST differs from Parse")
			}
		})
	}
}

// EDT-10: full analysis reports the parser error instead of returning a partial result.
func TestPublicAnalysisRejectsIncompleteSource(t *testing.T) {
	_, err := template.Analyze([]byte("{? x}"), "invalid.tpl", template.ParseOptions{})
	var got *errs.Error
	if !errors.As(err, &got) || got.Code != errs.ParseUnclosedBlock {
		t.Fatalf("analysis error = %v", err)
	}
}
