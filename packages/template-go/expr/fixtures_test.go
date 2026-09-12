package expr_test

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/polyspec/template/errs"
	"github.com/polyspec/template/expr"
	"github.com/polyspec/template/functions"
	"github.com/polyspec/template/lexer"
	"github.com/polyspec/template/render"
	"github.com/polyspec/template/value"
)

type exprCase struct {
	Name   string `json:"name"`
	Expr   string `json:"expr"`
	Tokens []struct {
		Type  string `json:"type"`
		Value string `json:"value"`
	} `json:"tokens"`
	AST   any `json:"ast"`
	Cases []struct {
		Data  any `json:"data"`
		Value any `json:"value"`
	} `json:"cases"`
	Error string `json:"error"`
}

var bare = expr.Options{Close: "", CloseCount: 0, OpenIndex: -1}

func roundTrip(t *testing.T, v any) any {
	data, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	var out any
	if err := json.Unmarshal(data, &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func plain(v value.Value) any {
	switch x := v.(type) {
	case value.SafeString:
		return x.Text
	case value.List:
		out := make([]any, len(x))
		for i, item := range x {
			out[i] = plain(item)
		}
		return out
	case *value.OrderedMap:
		out := map[string]any{}
		for _, k := range x.Keys() {
			out[k] = plain(x.MustGet(k))
		}
		return out
	case float64:
		if x == 0 {
			return float64(0)
		}
		return x
	}
	return v
}

func TestExpressionFixtures(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "tests", "fixtures", "expr", "cases.json"))
	if err != nil {
		t.Fatal(err)
	}
	var cases []exprCase
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	engine, err := render.NewEngine(render.Options{}, func() float64 { return 0 })
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		t.Run(c.Name, func(t *testing.T) {
			source := lexer.FromString("expression", c.Expr)
			if c.Error != "" {
				parser := expr.NewParser(source, 0, bare)
				_, err := parser.ParseExpression()
				if err == nil {
					tok, perr := parser.Peek()
					if perr == nil && tok.Type != "EOF" {
						err = parser.Unexpected(tok)
					}
				}
				var te *errs.Error
				if !errors.As(err, &te) || string(te.Code) != c.Error {
					t.Fatalf("expected %s, got %v", c.Error, err)
				}
				return
			}
			lex := expr.NewLexer(source, 0, bare)
			var tokens []map[string]string
			for {
				tok, err := lex.Next()
				if err != nil {
					t.Fatal(err)
				}
				tokens = append(tokens, map[string]string{"type": string(tok.Type), "value": tok.Value})
				if tok.Type == "EOF" {
					break
				}
			}
			if got, want := roundTrip(t, tokens), roundTrip(t, c.Tokens); !reflect.DeepEqual(got, want) {
				t.Errorf("tokens\n got %v\nwant %v", got, want)
			}
			parser := expr.NewParser(source, 0, bare)
			tree, err := parser.ParseExpression()
			if err != nil {
				t.Fatal(err)
			}
			if got, want := roundTrip(t, tree), c.AST; !reflect.DeepEqual(got, want) {
				t.Errorf("ast\n got %v\nwant %v", got, want)
			}
			for i, evaluation := range c.Cases {
				root, err := value.BindMap(evaluation.Data)
				if err != nil {
					t.Fatal(err)
				}
				context := render.NewContext(engine, root, functions.Env{Timezone: "Z"}, "expression")
				frame := render.NewFrame("expression", nil, root)
				result, err := render.NewEvaluator(context).EvaluateIn(tree, frame, render.NewScope())
				if err != nil {
					t.Fatalf("case %d: %v", i, err)
				}
				if got, want := roundTrip(t, plain(result)), evaluation.Value; !reflect.DeepEqual(got, want) {
					t.Errorf("case %d: got %v, want %v", i, got, want)
				}
			}
		})
	}
}
