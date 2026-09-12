package main

import (
	"bytes"
	"encoding/json"
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
}
