package casetest_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/polyspec/template/packages/go/internal/casetest"
	"github.com/polyspec/template/packages/go/parser"
)

func TestDelimiterOptions(t *testing.T) {
	directory := t.TempDir()
	if got := casetest.Delimiters(t, directory); got != parser.DefaultDelimiters {
		t.Fatalf("missing options: got %v, want %v", got, parser.DefaultDelimiters)
	}
	if err := os.WriteFile(filepath.Join(directory, "options.json"), []byte(`{"delimiters":"[]"}`), 0600); err != nil {
		t.Fatal(err)
	}
	if got := casetest.DelimiterOption(t, directory); got != "[]" {
		t.Fatalf("delimiter option: got %q, want []", got)
	}
	want, ok := parser.ParseDelimiters("[]")
	if !ok {
		t.Fatal("[] must be valid delimiters")
	}
	if got := casetest.Delimiters(t, directory); got != want {
		t.Fatalf("explicit options: got %v, want %v", got, want)
	}
}
