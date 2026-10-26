// Package casetest lists the conformance cases of tests/cases and reads their options.json for the tests of the Go
// packages, so every test finds and reads the cases the same way (CNF-2).
package casetest

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"testing"

	"github.com/polyspec/template/packages/go/internal/parser"
)

// Case is one conformance case: its id <group>/<name> and its directory.
type Case struct {
	ID  string
	Dir string
}

// Dir is the directory tests/cases of the repository: the module of this package lies at packages/go, and go
// test runs a test in the directory of its package, below the directory of go.mod.
func Dir(t testing.TB) string {
	t.Helper()
	directory, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		if _, err := os.Stat(filepath.Join(directory, "go.mod")); err == nil {
			return filepath.Join(directory, "..", "..", "tests", "cases")
		}
		parent := filepath.Dir(directory)
		if parent == directory {
			t.Fatal("no go.mod above the directory of the test")
		}
		directory = parent
	}
}

// List is every case directory <group>/<name> of tests/cases in the order of their ids; a tests/cases without a case
// fails the test.
func List(t testing.TB) []Case {
	t.Helper()
	root := Dir(t)
	groups, err := os.ReadDir(root)
	if err != nil {
		t.Fatal(err)
	}
	var cases []Case
	for _, group := range groups {
		if !group.IsDir() {
			continue
		}
		entries, err := os.ReadDir(filepath.Join(root, group.Name()))
		if err != nil {
			t.Fatal(err)
		}
		for _, entry := range entries {
			if entry.IsDir() {
				cases = append(cases, Case{ID: group.Name() + "/" + entry.Name(), Dir: filepath.Join(root, group.Name(), entry.Name())})
			}
		}
	}
	if len(cases) == 0 {
		t.Fatalf("%s holds no case", root)
	}
	return cases
}

// DelimiterOption is the delimiters of the options.json of a case directory, or "" when the case has no options.json;
// an options.json that cannot be read or decoded fails the test.
func DelimiterOption(t testing.TB, dir string) string {
	t.Helper()
	path := filepath.Join(dir, "options.json")
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return ""
	}
	if err != nil {
		t.Fatal(err)
	}
	var options struct {
		Delimiters string `json:"delimiters"`
	}
	if err := json.Unmarshal(data, &options); err != nil {
		t.Fatalf("%s: %v", path, err)
	}
	return options.Delimiters
}

// Delimiters is the parser delimiters of a case directory: those of its options.json, or the default ones.
func Delimiters(t testing.TB, dir string) parser.Delimiters {
	t.Helper()
	option := DelimiterOption(t, dir)
	if option == "" {
		return parser.DefaultDelimiters
	}
	delimiters, ok := parser.ParseDelimiters(option)
	if !ok {
		t.Fatalf("%s: invalid delimiters %q", filepath.Join(dir, "options.json"), option)
	}
	return delimiters
}
