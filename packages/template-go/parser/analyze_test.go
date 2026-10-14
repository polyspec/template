package parser_test

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/polyspec/template/packages/template-go/lexer"
	"github.com/polyspec/template/packages/template-go/parser"
)

// EDT-8: the parser classifies every part of a tag, so no editor tool reads the tag syntax again (T23.2).
func TestAnalyzeClassifiesEveryPartOfEveryTagKind(t *testing.T) {
	cases := []struct {
		source   string
		expected []string
	}{
		{"{* note *}", []string{"comment {* note *}"}},
		{`{= (user.name ?? null) | upper(1, "x")}`, []string{"delimiter {", "keyword =", "operator (", "variable user", "property .name", "operator ??", "keyword null", "operator )", "operator |", "function upper", "operator (", "number 1", "operator ,", `string "x"`, "operator )", "delimiter }"}},
		{"{@ item = items}{/}", []string{"delimiter {", "keyword @", "variable item", "operator =", "variable items", "delimiter }", "delimiter {", "keyword /", "delimiter }"}},
		{"{: count += 1}", []string{"delimiter {", "keyword :", "variable count", "operator +=", "number 1", "delimiter }"}},
		{"{: count++}", []string{"delimiter {", "keyword :", "variable count", "operator ++", "delimiter }"}},
		{"{? a in b}{:? !c}{:}{/}", []string{"delimiter {", "keyword ?", "variable a", "keyword in", "variable b", "delimiter }", "delimiter {", "keyword :?", "operator !", "variable c", "delimiter }", "delimiter {", "keyword :", "delimiter }", "delimiter {", "keyword /", "delimiter }"}},
		{"{?# side}{/}", []string{"delimiter {", "keyword ?#", "variable side", "delimiter }", "delimiter {", "keyword /", "delimiter }"}},
		{`{+ parts/head.tpl}{+ "quoted.tpl"}`, []string{"delimiter {", "keyword +", "path parts/head.tpl", "delimiter }", "delimiter {", "keyword +", `string "quoted.tpl"`, "delimiter }"}},
		{"{# card cards/card.tpl title:page.title x}", []string{"delimiter {", "keyword #", "path card", "path cards/card.tpl", "path title:page.title", "path x", "delimiter }"}},
		{"{% delimiter []}[= a]", []string{"delimiter {", "keyword %", "keyword delimiter", "string []", "delimiter }", "delimiter [", "keyword =", "variable a", "delimiter ]"}},
		{`<a href="{{= url }}">`, []string{`delimiter "{{`, "keyword =", "variable url", `delimiter }}"`}},
		{"{= obj.m(x)[0]}", []string{"delimiter {", "keyword =", "variable obj", "function .m", "operator (", "variable x", "operator )", "operator [", "number 0", "operator ]", "delimiter }"}},
	}
	for _, c := range cases {
		analysis, err := parser.Analyze(lexer.FromString("t.tpl", c.source), parser.DefaultDelimiters)
		if err != nil {
			t.Fatalf("%s: %v", c.source, err)
		}
		var got []string
		for _, token := range analysis.Tokens {
			got = append(got, string(token.Kind)+" "+c.source[token.Start:token.End])
		}
		if !reflect.DeepEqual(got, c.expected) {
			t.Errorf("%s:\n got %q\nwant %q", c.source, got, c.expected)
		}
	}
}

func TestAnalyzeTokenOffsetsAreBytes(t *testing.T) {
	source := "é{= 'ü' + a}"
	analysis, err := parser.Analyze(lexer.FromString("t.tpl", source), parser.DefaultDelimiters)
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, token := range analysis.Tokens {
		got = append(got, string(token.Kind)+" "+source[token.Start:token.End])
	}
	want := []string{"delimiter {", "keyword =", "string 'ü'", "operator +", "variable a", "delimiter }"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %q want %q", got, want)
	}
	if analysis.Tokens[0].Start != 2 {
		t.Errorf("first token starts at %d, want byte offset 2", analysis.Tokens[0].Start)
	}
}

func TestAnalyzeGivesEachTagItsKindAndBodyRange(t *testing.T) {
	source := `<a href="{{= url }}">{* c *}{? a}{:x = 1}{:}{/}`
	analysis, err := parser.Analyze(lexer.FromString("t.tpl", source), parser.DefaultDelimiters)
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, tag := range analysis.Tags {
		got = append(got, string(tag.Kind)+" "+source[tag.Start:tag.End]+" |"+source[tag.BodyStart:tag.BodyEnd]+"|")
	}
	want := []string{`echo "{{= url }}" |= url |`, "comment {* c *} |* c *|", "if {? a} |? a|", "assignment {:x = 1} |:x = 1|", "else {:} |:|", "close {/} |/|"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %q\nwant %q", got, want)
	}
	if analysis.AST == nil || analysis.AST.Type != "Template" {
		t.Error("analysis has no AST")
	}
}

// Every conformance case whose input parses gives the tokens of its expected.tokens.json, and a case whose input does
// not parse has no such file (CNF-2, CNF-17). Each case is the subtest TestConformanceTokens/<group>/<name>, as the
// suite unit tokens of config/parity.json reads the results.
func TestConformanceTokens(t *testing.T) {
	dirs, err := filepath.Glob(filepath.Join("..", "..", "..", "tests", "cases", "*", "*"))
	if err != nil {
		t.Fatal(err)
	}
	if len(dirs) < 200 {
		t.Fatalf("found %d case directories", len(dirs))
	}
	for _, dir := range dirs {
		t.Run(filepath.Base(filepath.Dir(dir))+"/"+filepath.Base(dir), func(t *testing.T) {
			path := filepath.Join(dir, "expected.tokens.json")
			if _, err := os.Stat(filepath.Join(dir, "expected.ast.json")); err != nil {
				if _, err := os.Stat(path); err == nil {
					t.Fatalf("%s exists although the case has no expected.ast.json", path)
				}
				return
			}
			data, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			var expected [][3]any
			if err := json.Unmarshal(data, &expected); err != nil {
				t.Fatalf("%s: %v", path, err)
			}
			delimiters := parser.DefaultDelimiters
			options, err := os.ReadFile(filepath.Join(dir, "options.json"))
			if err != nil && !errors.Is(err, fs.ErrNotExist) {
				t.Fatal(err)
			}
			if err == nil {
				var value struct{ Delimiters string }
				if err := json.Unmarshal(options, &value); err != nil {
					t.Fatal(err)
				}
				var ok bool
				if delimiters, ok = parser.ParseDelimiters(value.Delimiters); !ok {
					t.Fatalf("options.json delimiters %q", value.Delimiters)
				}
			}
			input, err := os.ReadFile(filepath.Join(dir, "input.tpl"))
			if err != nil {
				t.Fatal(err)
			}
			source, err := lexer.FromBytes("input.tpl", input)
			if err != nil {
				t.Fatal(err)
			}
			analysis, err := parser.Analyze(source, delimiters)
			if err != nil {
				t.Fatal(err)
			}
			got := make([][3]any, len(analysis.Tokens))
			for i, token := range analysis.Tokens {
				got[i] = [3]any{float64(token.Start), float64(token.End), string(token.Kind)}
			}
			if !reflect.DeepEqual(got, expected) {
				t.Errorf("got %v\nwant %v", got, expected)
			}
		})
	}
}
