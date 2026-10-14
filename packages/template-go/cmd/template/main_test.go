package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

var casesDir = filepath.Join("..", "..", "..", "..", "tests", "cases")

func TestParseCommand(t *testing.T) {
	var stdout, stderr bytes.Buffer
	if status := run([]string{"parse", filepath.Join(casesDir, "text", "plain", "input.tpl")}, &stdout, &stderr); status != 0 {
		t.Fatalf("status %d: %s", status, stderr.String())
	}
	var tree map[string]any
	if err := json.Unmarshal(stdout.Bytes(), &tree); err != nil || tree["type"] != "Template" {
		t.Fatalf("output %q", stdout.String())
	}
}

func TestRenderCommand(t *testing.T) {
	var stdout, stderr bytes.Buffer
	if status := run([]string{"render", filepath.Join(casesDir, "echo", "path", "input.tpl"), "--data", "data.json"}, &stdout, &stderr); status != 0 {
		t.Fatalf("status %d: %s", status, stderr.String())
	}
	stdout.Reset()
	stderr.Reset()
	if status := run([]string{"render", filepath.Join(casesDir, "errors", "unclosed-block", "input.tpl")}, &stdout, &stderr); status != 2 {
		t.Fatalf("status %d", status)
	}
	var errorObject map[string]any
	if err := json.Unmarshal(stderr.Bytes(), &errorObject); err != nil || errorObject["code"] != "E_PARSE_UNCLOSED_BLOCK" {
		t.Fatalf("stderr %q", stderr.String())
	}
}

func TestUsageErrors(t *testing.T) {
	var stdout, stderr bytes.Buffer
	if status := run([]string{"parse"}, &stdout, &stderr); status != 1 {
		t.Errorf("status %d", status)
	}
	if status := run([]string{"render", "x.tpl", "--unknown", "1"}, &stdout, &stderr); status != 1 {
		t.Errorf("status %d", status)
	}
	// CNF-4: a data file that cannot be read is a usage error.
	if status := run([]string{"render", filepath.Join(casesDir, "echo", "path", "input.tpl"), "--data", "missing.json"}, &stdout, &stderr); status != 1 {
		t.Errorf("missing data file status %d", status)
	}
}

func TestTokensCommand(t *testing.T) {
	var stdout, stderr bytes.Buffer
	dir := t.TempDir()
	file := filepath.Join(dir, "t.tpl")
	if err := os.WriteFile(file, []byte("\xef\xbb\xbfé[= a | f]"), 0o600); err != nil {
		t.Fatal(err)
	}
	if status := run([]string{"tokens", file, "--delimiters", "[]"}, &stdout, &stderr); status != 0 {
		t.Fatalf("status %d: %s", status, stderr.String())
	}
	want := `[[2,3,"delimiter"],[3,4,"keyword"],[5,6,"variable"],[7,8,"operator"],[9,10,"function"],[10,11,"delimiter"]]`
	if stdout.String() != want {
		t.Errorf("stdout %s, want %s", stdout.String(), want)
	}
	stdout.Reset()
	stderr.Reset()
	if status := run([]string{"tokens", filepath.Join(casesDir, "errors", "unclosed-block", "input.tpl")}, &stdout, &stderr); status != 2 {
		t.Fatalf("status %d", status)
	}
	var errorObject map[string]any
	if err := json.Unmarshal(stderr.Bytes(), &errorObject); err != nil || errorObject["code"] != "E_PARSE_UNCLOSED_BLOCK" {
		t.Fatalf("stderr %q", stderr.String())
	}
}

func TestFormatCommand(t *testing.T) {
	dir := t.TempDir()
	write := func(text string) string {
		file := filepath.Join(dir, "t.tpl")
		if err := os.WriteFile(file, []byte(text), 0o600); err != nil {
			t.Fatal(err)
		}
		return file
	}
	cases := []struct {
		source string
		args   []string
		want   string
	}{
		{"<ul>\n<li>{=a}</li>\n</ul>", nil, "<ul>\n  <li>{= a}</li>\n</ul>"},
		{"<ul>\n<li>{=a}</li>\n</ul>", []string{"--indent", "tab"}, "<ul>\n\t<li>{= a}</li>\n</ul>"},
		{"<ul>\n<li>{=a}</li>\n</ul>", []string{"--indent", "4"}, "<ul>\n    <li>{= a}</li>\n</ul>"},
		{"<ul>\n<li>{=a}</li>\n</ul>", []string{"--indent", "none"}, "<ul>\n<li>{= a}</li>\n</ul>"},
		{"<p>[=a]</p>", []string{"--delimiters", "[]"}, "<p>[= a]</p>"},
		{"<p>{= a}</p>\n", nil, "<p>{= a}</p>\n"},
	}
	for _, c := range cases {
		var stdout, stderr bytes.Buffer
		if status := run(append([]string{"format", write(c.source)}, c.args...), &stdout, &stderr); status != 0 {
			t.Fatalf("%q %v: status %d: %s", c.source, c.args, status, stderr.String())
		}
		if stdout.String() != c.want {
			t.Errorf("%q %v: %q, want %q", c.source, c.args, stdout.String(), c.want)
		}
	}
	var stdout, stderr bytes.Buffer
	if status := run([]string{"format", write("<div>\n<p>a</div>")}, &stdout, &stderr); status != 2 {
		t.Fatalf("html error status %d", status)
	}
	var failure map[string]any
	if err := json.Unmarshal(stderr.Bytes(), &failure); err != nil || failure["reason"] != "html" || failure["code"] != nil || failure["line"] != 2.0 || failure["col"] != 5.0 || failure["message"] == "" {
		t.Errorf("stderr %q", stderr.String())
	}
	stderr.Reset()
	if status := run([]string{"format", write("{? a}")}, &stdout, &stderr); status != 2 {
		t.Fatalf("parse error status %d", status)
	}
	if err := json.Unmarshal(stderr.Bytes(), &failure); err != nil || failure["reason"] != "parse" || failure["code"] != "E_PARSE_UNCLOSED_BLOCK" {
		t.Errorf("stderr %q", stderr.String())
	}
	for _, indent := range []string{"0", "9", "x"} {
		if status := run([]string{"format", write("<p></p>"), "--indent", indent}, &stdout, &stderr); status != 1 {
			t.Errorf("--indent %s status %d", indent, status)
		}
	}
}
