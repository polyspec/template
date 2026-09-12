package template_test

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	template "github.com/polyspec/template"
	"github.com/polyspec/template/errs"
	"github.com/polyspec/template/value"
)

var casesDir = filepath.Join("..", "..", "tests", "cases")

type conformanceCase struct {
	id  string
	dir string
}

func listCases(t *testing.T) []conformanceCase {
	t.Helper()
	groups, err := os.ReadDir(casesDir)
	if err != nil {
		t.Fatal(err)
	}
	var cases []conformanceCase
	for _, group := range groups {
		if !group.IsDir() {
			continue
		}
		entries, err := os.ReadDir(filepath.Join(casesDir, group.Name()))
		if err != nil {
			t.Fatal(err)
		}
		for _, entry := range entries {
			if entry.IsDir() {
				cases = append(cases, conformanceCase{id: group.Name() + "/" + entry.Name(), dir: filepath.Join(casesDir, group.Name(), entry.Name())})
			}
		}
	}
	return cases
}

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

func renderCase(c conformanceCase) (string, error) {
	options := template.Options{Loader: template.NewFSLoader(os.DirFS(c.dir))}
	if optionsBytes := readIf(filepath.Join(c.dir, "options.json")); optionsBytes != nil {
		var opts struct {
			Delimiters string `json:"delimiters"`
		}
		if err := json.Unmarshal(optionsBytes, &opts); err != nil {
			return "", err
		}
		options.Delimiters = opts.Delimiters
	}
	engine, err := template.NewEngine(options)
	if err != nil {
		return "", err
	}
	var assign value.Value = value.NewOrderedMap()
	if dataBytes := readIf(filepath.Join(c.dir, "data.json")); dataBytes != nil {
		if assign, err = value.ParseJSON(dataBytes); err != nil {
			var be *value.BindError
			if errors.As(err, &be) {
				return "", errs.WithoutPosition(be.Code, "input.tpl", be.Message)
			}
			return "", err
		}
	}
	renderOptions := template.RenderOptions{}
	if defineBytes := readIf(filepath.Join(c.dir, "define.json")); defineBytes != nil {
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
	if envBytes := readIf(filepath.Join(c.dir, "env.json")); envBytes != nil {
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
	for _, c := range listCases(t) {
		t.Run(c.id, func(t *testing.T) {
			if expectedAST := readIf(filepath.Join(c.dir, "expected.ast.json")); expectedAST != nil {
				source, err := os.ReadFile(filepath.Join(c.dir, "input.tpl"))
				if err != nil {
					t.Fatal(err)
				}
				parseOptions := template.ParseOptions{}
				if optionsBytes := readIf(filepath.Join(c.dir, "options.json")); optionsBytes != nil {
					var opts struct {
						Delimiters string `json:"delimiters"`
					}
					_ = json.Unmarshal(optionsBytes, &opts)
					parseOptions.Delimiters = opts.Delimiters
				}
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
			html, err := renderCase(c)
			if expectedError := readIf(filepath.Join(c.dir, "expected.error.json")); expectedError != nil {
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
			want := string(readIf(filepath.Join(c.dir, "expected.html")))
			if html != want {
				t.Errorf("html differs\n got %q\nwant %q", html, want)
			}
		})
	}
}
