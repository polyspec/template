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
	"github.com/polyspec/template/packages/go/value"
)

func readIf(path string) []byte {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	return data
}

func plainJSON(v value.Value) any {
	switch x := v.(type) {
	case value.SafeString:
		return x.Text
	case value.List:
		out := make([]any, len(x))
		for i, item := range x {
			out[i] = plainJSON(item)
		}
		return out
	case *value.OrderedMap:
		out := map[string]any{}
		for _, k := range x.Keys() {
			out[k] = plainJSON(x.MustGet(k))
		}
		return out
	}
	return v
}

func errorFields(err error) map[string]any {
	var te *errs.Error
	if errors.As(err, &te) {
		return map[string]any{"code": string(te.Code), "template": te.Template, "line": float64(te.Line), "col": float64(te.Col)}
	}
	return map[string]any{"unexpected": err.Error()}
}

func renderCase(t *testing.T, c casetest.Case) (string, error) {
	t.Helper()
	options := template.Options{Loader: template.NewFSLoader(os.DirFS(c.Dir)), Delimiters: casetest.DelimiterOption(t, c.Dir)}
	program, err := template.NewAstProgram(options)
	if err != nil {
		return "", err
	}
	engine := template.NewEngine(program)
	var assign value.Value = value.NewOrderedMap()
	// VAL-12: every JSON file of a case is data; its data errors have the position of ERR-5.
	parseData := func(text []byte) (value.Value, error) {
		parsed, err := value.ParseJSON(text)
		var be *value.BindError
		if errors.As(err, &be) {
			return nil, errs.WithoutPosition(be.Code, "input.tpl", be.Message)
		}
		return parsed, err
	}
	if dataBytes := readIf(filepath.Join(c.Dir, "data.json")); dataBytes != nil {
		if assign, err = parseData(dataBytes); err != nil {
			return "", err
		}
	}
	renderOptions := template.RenderOptions{}
	if defineBytes := readIf(filepath.Join(c.Dir, "define.json")); defineBytes != nil {
		if _, err := parseData(defineBytes); err != nil {
			return "", err
		}
		var define map[string]json.RawMessage
		if err := json.Unmarshal(defineBytes, &define); err != nil {
			return "", err
		}
		renderOptions.Define = map[string]template.DefineInput{}
		for id, raw := range define {
			var path string
			if err := json.Unmarshal(raw, &path); err == nil {
				renderOptions.Define[id] = template.DefineInput{Template: path}
				continue
			}
			var entry struct {
				Template string  `json:"template"`
				Data     any     `json:"data"`
				HTML     *string `json:"html"`
			}
			if err := json.Unmarshal(raw, &entry); err != nil {
				return "", err
			}
			renderOptions.Define[id] = template.DefineInput{Template: entry.Template, Data: entry.Data, HTML: entry.HTML}
		}
	}
	if envBytes := readIf(filepath.Join(c.Dir, "env.json")); envBytes != nil {
		if _, err := parseData(envBytes); err != nil {
			return "", err
		}
		env := &template.Env{Timezone: "Z"}
		var raw struct {
			Timezone string  `json:"timezone"`
			Now      float64 `json:"now"`
		}
		if err := json.Unmarshal(envBytes, &raw); err != nil {
			return "", err
		}
		if raw.Timezone != "" {
			env.Timezone = raw.Timezone
		}
		env.Now = raw.Now
		renderOptions.Env = env
	}
	return engine.Render("input.tpl", assign, renderOptions)
}

func TestConformanceCases(t *testing.T) {
	for _, c := range casetest.List(t) {
		t.Run(c.ID, func(t *testing.T) {
			if expectedAST := readIf(filepath.Join(c.Dir, "expected.ast.json")); expectedAST != nil {
				source, err := os.ReadFile(filepath.Join(c.Dir, "input.tpl"))
				if err != nil {
					t.Fatal(err)
				}
				parseOptions := template.ParseOptions{Delimiters: casetest.DelimiterOption(t, c.Dir)}
				tree, err := template.Parse(source, "input.tpl", parseOptions)
				if err != nil {
					t.Fatalf("parse: %v", err)
				}
				var got, want any
				data, _ := json.Marshal(tree)
				_ = json.Unmarshal(data, &got)
				_ = json.Unmarshal(expectedAST, &want)
				if !reflect.DeepEqual(got, want) {
					t.Errorf("ast differs\n got %s\nwant %s", data, expectedAST)
				}
			}
			html, err := renderCase(t, c)
			if expectedError := readIf(filepath.Join(c.Dir, "expected.error.json")); expectedError != nil {
				var want map[string]any
				_ = json.Unmarshal(expectedError, &want)
				if err == nil {
					t.Fatalf("expected error %v, got output %q", want, html)
				}
				if got := errorFields(err); !reflect.DeepEqual(got, want) {
					t.Errorf("error got %v, want %v", got, want)
				}
				return
			}
			if err != nil {
				t.Fatalf("render: %v", err)
			}
			want := string(readIf(filepath.Join(c.Dir, "expected.html")))
			if html != want {
				t.Errorf("html differs\n got %q\nwant %q", html, want)
			}
		})
	}
}
