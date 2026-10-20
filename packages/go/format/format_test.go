package format

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	"github.com/polyspec/template/packages/go/internal/casetest"
	"github.com/polyspec/template/packages/go/lexer"
	"github.com/polyspec/template/packages/go/parser"
)

var repositoryRoot = filepath.Join("..", "..", "..")

func formatted(t *testing.T, source string, options Options) string {
	t.Helper()
	once, err := Format(source, options)
	if err != nil {
		t.Fatalf("format %q: %v", source, err)
	}
	twice, err := Format(once.Text, options)
	if err != nil || twice.Changed || twice.Text != once.Text {
		t.Fatalf("not idempotent on %q: %+v %v", once.Text, twice, err)
	}
	return once.Text
}

func formatError(t *testing.T, source string, options Options) *Error {
	t.Helper()
	result, err := Format(source, options)
	var failure *Error
	if !errors.As(err, &failure) {
		t.Fatalf("expected a format error for %q, got %+v %v", source, result, err)
	}
	return failure
}

func lines(items ...string) string { return strings.Join(items, "\n") }

// FMT-5: the tokens are joined with one space around a binary operator.
func TestJoinTokens(t *testing.T) {
	type tk = [2]string
	cases := []struct {
		tokens   []tk
		expected string
	}{
		{[]tk{{"a", "variable"}, {"+", "operator"}, {"b", "variable"}}, "a + b"},
		{[]tk{{"-", "operator"}, {"a", "variable"}, {"-", "operator"}, {"-", "operator"}, {"1", "number"}}, "-a - -1"},
		{[]tk{{"!", "operator"}, {"done", "variable"}, {"&&", "operator"}, {"(", "operator"}, {"x", "variable"}, {"||", "operator"}, {"y", "variable"}, {")", "operator"}}, "!done && (x || y)"},
		{[]tk{{"f", "function"}, {"(", "operator"}, {"x", "variable"}, {",", "operator"}, {"g", "function"}, {"(", "operator"}, {"y", "variable"}, {")", "operator"}, {")", "operator"}}, "f(x, g(y))"},
		{[]tk{{"obj", "variable"}, {".method", "function"}, {"(", "operator"}, {"1", "number"}, {")", "operator"}}, "obj.method(1)"},
		{[]tk{{"Order", "variable"}, {"::", "operator"}, {"total", "function"}, {"(", "operator"}, {"x", "variable"}, {")", "operator"}}, "Order::total(x)"},
		{[]tk{{"c", "variable"}, {"?", "operator"}, {"a", "variable"}, {":", "operator"}, {"b", "variable"}}, "c ? a : b"},
		{[]tk{{"a", "variable"}, {"?:", "operator"}, {"b", "variable"}}, "a ?: b"},
		{[]tk{{"x", "variable"}, {"??", "operator"}}, "x ??"},
		{[]tk{{"x", "variable"}, {"|", "operator"}, {"slice", "function"}, {"(", "operator"}, {"0", "number"}, {",", "operator"}, {"10", "number"}, {")", "operator"}}, "x | slice(0, 10)"},
		{[]tk{{"[", "operator"}, {"1", "number"}, {",", "operator"}, {"...", "operator"}, {"rest", "variable"}, {",", "operator"}, {"]", "operator"}}, "[1, ...rest,]"},
		{[]tk{{"[", "operator"}, {"'a'", "string"}, {"=>", "operator"}, {"1", "number"}, {"]", "operator"}}, "['a' => 1]"},
		{[]tk{{"list", "variable"}, {"[", "operator"}, {"i", "variable"}, {"]", "operator"}, {".name", "property"}}, "list[i].name"},
		{[]tk{{"a", "variable"}, {".0", "property"}, {".b", "property"}}, "a.0.b"},
		{[]tk{{"x", "variable"}, {"in", "keyword"}, {"[", "operator"}, {"1", "number"}, {"]", "operator"}}, "x in [1]"},
		{[]tk{{"x", "variable"}, {"in", "keyword"}, {"(", "operator"}, {"y", "variable"}, {")", "operator"}}, "x in (y)"},
		{[]tk{{"(", "operator"}, {"-", "operator"}, {"1", "number"}, {")", "operator"}, {"*", "operator"}, {"2", "number"}}, "(-1) * 2"},
	}
	for _, c := range cases {
		tokens := make([]expressionToken, len(c.tokens))
		for i, token := range c.tokens {
			tokens[i] = expressionToken{text: token[0], kind: parser.TokenKind(token[1])}
		}
		if got := joinTokens(tokens); got != c.expected {
			t.Errorf("joinTokens(%v) = %q, want %q", c.tokens, got, c.expected)
		}
	}
}

func TestFixtures(t *testing.T) {
	fixtures := filepath.Join(repositoryRoot, "packages", "language", "tests", "fixtures")
	names, err := filepath.Glob(filepath.Join(fixtures, "input", "*.tpl"))
	if err != nil || len(names) == 0 {
		t.Fatalf("no fixtures: %v", err)
	}
	for _, path := range names {
		name := filepath.Base(path)
		input, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		expected, err := os.ReadFile(filepath.Join(fixtures, "expected", name))
		if err != nil {
			t.Fatal(err)
		}
		if got := formatted(t, string(input), Options{Name: name}); got != string(expected) {
			t.Errorf("%s:\n got %q\nwant %q", name, got, expected)
		}
	}
}

// FMT-8, LEX-22, LEX-20: the formatter reads the tags with the delimiter option []; LEX-11, LEX-21: the ] of a[0] stays
// in the expression; FMT-4, FMT-5: the echo tag and its operators take the spacing of the style. FMT-14: when nothing
// changes, the text is the source.
func TestFormat(t *testing.T) {
	if result, err := Format("<p>{= a}</p>", Options{}); err != nil || result.Changed || result.Text != "<p>{= a}</p>" {
		t.Errorf("unchanged source: %+v %v", result, err)
	}
	if got := formatted(t, "\ufeff<ul>\r\n{@ x=xs}\r\n<li>{=x}</li>\r\n{/}\r\n</ul>\r\n", Options{}); got != "\ufeff<ul>\r\n  {@ x = xs}\r\n    <li>{= x}</li>\r\n  {/}\r\n</ul>\r\n" {
		t.Errorf("bom and crlf: %q", got)
	}
	if result, err := Format("{=a}{=b}{=c}", Options{Range: &Range{Start: 4, End: 8}}); err != nil || result.Text != "{=a}{= b}{=c}" {
		t.Errorf("range: %q %v", result.Text, err)
	}
	if got := formatted(t, "[= a[0]+1]\n[= [1,2][1]]", Options{Delimiters: "[]"}); got != "[= a[0] + 1]\n[= [1, 2][1]]" {
		t.Errorf("delimiters: %q", got)
	}
	if got := formatted(t, `var page = ";;=json(page)|raw;;";`, Options{Delimiters: ";;"}); got != `var page = ";;= json(page) | raw;;";` {
		t.Errorf("wrapped: %q", got)
	}
	failure := formatError(t, "<p>\n  {? a}\n</p>", Options{Name: "x.tpl"})
	if failure.Reason != ReasonParse || failure.Code != "E_PARSE_UNCLOSED_BLOCK" || failure.Line != 2 || failure.Col != 3 || failure.Message == "" {
		t.Errorf("parse error: %+v", failure)
	}
	if result, err := Format("{*   a   *}{**}", Options{}); err != nil || result.Changed {
		t.Errorf("comment changed: %+v %v", result, err)
	}
	if got := formatted(t, "{: n=1}{: n ++}{# card  cards/c.tpl   x:a.b}{+  \"q.tpl\" }{?#  side }{: }{/ }", Options{KeepIndentation: true}); got != "{:n = 1}{:n++}{# card cards/c.tpl x:a.b}{+ \"q.tpl\"}{?# side}{:}{/}" {
		t.Errorf("tag kinds: %q", got)
	}
}

func TestOptionErrors(t *testing.T) {
	for _, indent := range []string{" \t", "x"} {
		if _, err := Format("<p></p>", Options{Indent: indent}); err == nil || !strings.Contains(err.Error(), "indent") {
			t.Errorf("indent %q: %v", indent, err)
		}
	}
	if _, err := Format("<p></p>", Options{TemplateBlocks: "deep"}); err == nil {
		t.Error("templateBlocks deep accepted")
	}
}

const board = "<div class=\"board-list\">\n<h2>{= t[\"list.heading\"]}</h2>\n{? length(p.props.posts) == 0}\n<p>{= t[\"list.empty\"]}</p>\n{:}\n<ul>\n{@ post = p.props.posts}\n<li><a href=\"{= post.href}\">{= post.title}</a></li>\n{/}\n</ul>\n{/}\n</div>\n"

// FMT-9, FMT-10: each line is indented by two spaces for each open element and template block, and a line that starts
// with {:}, {/} or an end tag one level less; FMT-15: formatting the result again changes nothing.
func TestIndentation(t *testing.T) {
	cases := []struct {
		source, expected string
		options          Options
	}{
		{board, lines(`<div class="board-list">`, `  <h2>{= t["list.heading"]}</h2>`, `  {? length(p.props.posts) == 0}`, `    <p>{= t["list.empty"]}</p>`, `  {:}`, `    <ul>`, `      {@ post = p.props.posts}`, `        <li><a href="{= post.href}">{= post.title}</a></li>`, `      {/}`, `    </ul>`, `  {/}`, `</div>`, ``), Options{}},
		{board, lines(`<div class="board-list">`, `  <h2>{= t["list.heading"]}</h2>`, `  {? length(p.props.posts) == 0}`, `  <p>{= t["list.empty"]}</p>`, `  {:}`, `  <ul>`, `    {@ post = p.props.posts}`, `    <li><a href="{= post.href}">{= post.title}</a></li>`, `    {/}`, `  </ul>`, `  {/}`, `</div>`, ``), Options{TemplateBlocks: "flat"}},
		{lines("<ul>", "        <li>a</li>", "\t<li>b</li>", "</ul>"), lines("<ul>", "\t<li>a</li>", "\t<li>b</li>", "</ul>"), Options{Indent: "\t"}},
		{lines("<ul>", "        <li>a</li>", "\t<li>b</li>", "</ul>"), lines("<ul>", "    <li>a</li>", "    <li>b</li>", "</ul>"), Options{Indent: "    "}},
		{"<ul>\n        <li>{=a}</li>\n</ul>", "<ul>\n        <li>{= a}</li>\n</ul>", Options{KeepIndentation: true}},
		{"<div>\n   \n  a   b  \n</div>", "<div>\n\n  a   b  \n</div>", Options{}},
		{lines("<div>", "<input", `type="text"`, `      name="q">`, `<p title="first`, `      second">x</p>`, "</div>"), lines("<div>", "  <input", `    type="text"`, `    name="q">`, `  <p title="first`, `      second">x</p>`, "</div>"), Options{}},
		{lines("<div>", "{= a +", "      b}", "</div>"), lines("<div>", "  {= a +", "      b}", "</div>"), Options{}},
		{lines("<!DOCTYPE html>", "<div>", "<br>", `<img src="a.png" />`, `<svg><path d="M0"/></svg>`, "<p>x</p>", "</div>"), lines("<!DOCTYPE html>", "<div>", "  <br>", `  <img src="a.png" />`, `  <svg><path d="M0"/></svg>`, "  <p>x</p>", "</div>"), Options{}},
		{lines("<main>", "{? a}", `<div class="x">`, "{:}", `<div class="y">`, "{/}", "<p>{= b}</p>", "</div>", "</main>"), lines("<main>", "  {? a}", `    <div class="x">`, "  {:}", `    <div class="y">`, "  {/}", "    <p>{= b}</p>", "  </div>", "</main>"), Options{}},
		{lines(`<DIV {? a}class="x"{/}>`, "<span>{= b}</span>", "</div>"), lines(`<DIV {? a}class="x"{/}>`, "  <span>{= b}</span>", "</div>"), Options{}},
		{"\ufeff<ul>\r\n[@ x = xs]\r\n<li>[= x]</li>\r\n[/]\r\n</ul>\r\n", "\ufeff<ul>\r\n  [@ x = xs]\r\n    <li>[= x]</li>\r\n  [/]\r\n</ul>\r\n", Options{Delimiters: "[]"}},
	}
	for _, c := range cases {
		if got := formatted(t, c.source, c.options); got != c.expected {
			t.Errorf("%q:\n got %q\nwant %q", c.source, got, c.expected)
		}
	}
	source := lines("<ul>", "<li>a</li>", "<li>{=b}</li>", "</ul>")
	start := strings.Index(source, "<li>{=b}")
	if result, err := Format(source, Options{Range: &Range{Start: start, End: len(source)}}); err != nil || result.Text != lines("<ul>", "<li>a</li>", "  <li>{= b}</li>", "</ul>") {
		t.Errorf("range indentation: %q %v", result.Text, err)
	}
}

// FMT-11: the lines inside pre, textarea, script, style and comments keep their indentation, including the end tag line.
func TestKeepsTheIndentationInsideRawElements(t *testing.T) {
	source := lines("<div>", "<pre>", "    code {= x}", "</pre>", "<textarea>", "   <b>text</b>", "   </textarea>", "<script>", `  if (a < b) { f("</div>"); }`, "    </script>", "<style>", "      p { color: red; }", "</style>", "<!--", "        <div>", "-->", "<p>a</p>", "</div>")
	expected := lines("<div>", "  <pre>", "    code {= x}", "</pre>", "  <textarea>", "   <b>text</b>", "   </textarea>", "  <script>", `  if (a < b) { f("</div>"); }`, "    </script>", "  <style>", "      p { color: red; }", "</style>", "  <!--", "        <div>", "-->", "  <p>a</p>", "</div>")
	if got := formatted(t, source, Options{}); got != expected {
		t.Errorf("got %q\nwant %q", got, expected)
	}
}

func TestHTMLError(t *testing.T) {
	cases := []struct {
		source    string
		line, col int
	}{
		{"<div>\n<p>a</div>", 2, 5},
		{"<ul>\n<li>a\n</ul>", 3, 1},
		{"<div>\n<p>a</p>", 1, 1},
		{"{? a}<div class=\"x\">{:}<p>{/}\n</div>", 1, 27},
		{"{? a}<div>{/}\n</div>", 1, 11},
		{"{? a}<div>{:? b}<div>{/}\n</div>", 1, 22},
	}
	for _, c := range cases {
		failure := formatError(t, c.source, Options{})
		if failure.Reason != ReasonHTML || failure.Code != "" || failure.Line != c.line || failure.Col != c.col {
			t.Errorf("%q: %+v", c.source, failure)
		}
	}
	if got := formatted(t, "<div>\n<p>{=a}</div>", Options{KeepIndentation: true}); got != "<div>\n<p>{= a}</div>" {
		t.Errorf("indent none: %q", got)
	}
}

func TestSameTree(t *testing.T) {
	if !sameTree(map[string]any{"type": "Var", "name": "a", "span": []any{0, 1}}, map[string]any{"span": []any{4, 5}, "name": "a", "type": "Var"}) {
		t.Error("spans are not ignored")
	}
	if sameTree(map[string]any{"type": "Text", "value": "a ", "span": []any{0, 2}}, map[string]any{"type": "Text", "value": "a", "span": []any{0, 1}}) {
		t.Error("different value")
	}
	if sameTree(map[string]any{"body": []any{1, 2}}, map[string]any{"body": []any{1}}) {
		t.Error("different length")
	}
}

// The safety invariant over every conformance input: the formatted AST equals the source AST, the text outside tags
// is unchanged (without line indentation for indent mode), and formatting is idempotent.
// FMT-13: the result is returned only when the ASTs without their spans are equal; FMT-3, FMT-7: the text outside the
// tags is kept; FMT-12: with indent null the structure is not read; FMT-14: a source that does not parse fails with the
// reason parse; FMT-15: formatting the result again changes nothing.
func TestInvariantOverConformanceInputs(t *testing.T) {
	var files []string
	err := filepath.WalkDir(casetest.Dir(t), func(path string, entry os.DirEntry, err error) error {
		if err == nil && !entry.IsDir() && strings.HasSuffix(path, ".tpl") {
			files = append(files, path)
		}
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	sort.Strings(files)
	if len(files) == 0 {
		t.Fatal("tests/cases holds no template")
	}
	for _, file := range files {
		data, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		source := string(data)
		delimiters := casetest.DelimiterOption(t, filepath.Dir(file))
		keep := Options{Name: file, Delimiters: delimiters, KeepIndentation: true}
		indent := Options{Name: file, Delimiters: delimiters}
		kept, keptErr := Format(source, keep)
		indented, indentedErr := Format(source, indent)
		original, parseErr := parseTree(t, data, delimiters)
		if parseErr != nil {
			for _, err := range []error{keptErr, indentedErr} {
				var failure *Error
				if !errors.As(err, &failure) || failure.Reason != ReasonParse {
					t.Errorf("%s: %v, want a parse error", file, err)
				}
			}
			continue
		}
		if keptErr != nil {
			t.Errorf("%s: %v", file, keptErr)
			continue
		}
		after, err := parseTree(t, []byte(kept.Text), delimiters)
		if err != nil || !sameTree(original, after) {
			t.Errorf("%s: kept result parses to a different AST: %v", file, err)
		}
		if !reflect.DeepEqual(outsideTags(t, kept.Text, delimiters), outsideTags(t, source, delimiters)) {
			t.Errorf("%s: text outside tags changed", file)
		}
		if again, err := Format(kept.Text, keep); err != nil || again.Changed {
			t.Errorf("%s: not idempotent: %v", file, err)
		}
		if indentedErr != nil {
			var failure *Error
			if !errors.As(indentedErr, &failure) || failure.Reason != ReasonHTML {
				t.Errorf("%s: %v, want an html error", file, indentedErr)
			}
			continue
		}
		after, err = parseTree(t, []byte(indented.Text), delimiters)
		if err != nil || !sameTree(withoutLineIndentation(original), withoutLineIndentation(after)) {
			t.Errorf("%s: indented result parses to a different AST: %v", file, err)
		}
		if !reflect.DeepEqual(withoutIndentation(outsideTags(t, indented.Text, delimiters)), withoutIndentation(outsideTags(t, source, delimiters))) {
			t.Errorf("%s: text outside tags changed beyond indentation", file)
		}
		if again, err := Format(indented.Text, indent); err != nil || again.Changed {
			t.Errorf("%s: indented not idempotent: %v", file, err)
		}
	}
}

func delimitersOf(t *testing.T, option string) parser.Delimiters {
	if option == "" {
		return parser.DefaultDelimiters
	}
	d, ok := parser.ParseDelimiters(option)
	if !ok {
		t.Fatalf("invalid delimiters %q", option)
	}
	return d
}

func parseTree(t *testing.T, data []byte, delimiters string) (any, error) {
	t.Helper()
	d := delimitersOf(t, delimiters)
	source, err := lexer.FromBytes("x.tpl", data)
	if err != nil {
		return nil, err
	}
	tree, err := parser.Parse(source, d)
	if err != nil {
		return nil, err
	}
	return treeValue(tree)
}

// outsideTags is the source text outside every tag, comment and directive, in order.
func outsideTags(t *testing.T, text, delimiters string) []string {
	source, err := lexer.FromBytes("x.tpl", []byte(text))
	if err != nil {
		t.Fatal(err)
	}
	analysis, err := parser.Analyze(source, delimitersOf(t, delimiters))
	if err != nil {
		t.Fatal(err)
	}
	var pieces []string
	cursor := 0
	for _, tag := range analysis.Tags {
		pieces = append(pieces, source.Text[cursor:tag.Start])
		cursor = tag.End
	}
	return append(pieces, source.Text[cursor:])
}

func withoutIndentation(pieces []string) []string {
	result := make([]string, len(pieces))
	for i, piece := range pieces {
		result[i] = stripLineIndentation(piece)
	}
	return result
}

// Every conformance case whose input parses formats to the text or error of its expected.format.json in both modes, and
// a case whose input does not parse has no such file (CNF-2, CNF-18). Each case is the subtest
// TestConformanceFormat/<group>/<name>, as the suite unit formatting of config/parity.json reads the results.
func TestConformanceFormat(t *testing.T) {
	type expectedResult struct {
		Text  *string `json:"text"`
		Error *struct {
			Reason Reason  `json:"reason"`
			Code   *string `json:"code"`
			Line   int     `json:"line"`
			Col    int     `json:"col"`
		} `json:"error"`
	}
	for _, c := range casetest.List(t) {
		dir := c.Dir
		t.Run(c.ID, func(t *testing.T) {
			path := filepath.Join(dir, "expected.format.json")
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
			var expected map[string]expectedResult
			if err := json.Unmarshal(data, &expected); err != nil {
				t.Fatalf("%s: %v", path, err)
			}
			source, err := os.ReadFile(filepath.Join(dir, "input.tpl"))
			if err != nil {
				t.Fatal(err)
			}
			for mode, options := range map[string]Options{"indent": {Name: "input.tpl"}, "keep": {Name: "input.tpl", KeepIndentation: true}} {
				options.Delimiters = casetest.DelimiterOption(t, dir)
				want := expected[mode]
				result, err := Format(string(source), options)
				switch {
				case want.Text != nil:
					if err != nil || result.Text != *want.Text {
						t.Errorf("%s: %q %v, want %q", mode, result.Text, err, *want.Text)
					}
				case want.Error != nil:
					var failure *Error
					ok := errors.As(err, &failure)
					code := ""
					if want.Error.Code != nil {
						code = *want.Error.Code
					}
					if !ok || failure.Reason != want.Error.Reason || string(failure.Code) != code || failure.Line != want.Error.Line || failure.Col != want.Error.Col {
						t.Errorf("%s: %v, want %+v", mode, err, *want.Error)
					}
				default:
					t.Errorf("no %s result", mode)
				}
			}
		})
	}
}
