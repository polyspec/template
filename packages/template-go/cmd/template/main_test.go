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
