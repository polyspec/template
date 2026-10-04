package value

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// The entries of bound maps (VAL-22) with the shared fixture of tests/fixtures/bound-data/cases.json.

func TestMergeKeepsThePositionOfTheFirstMap(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "tests", "fixtures", "bound-data", "cases.json"))
	if err != nil {
		t.Fatal(err)
	}
	var cases struct {
		Assign     json.RawMessage `json:"assign"`
		Second     json.RawMessage `json:"second"`
		MergedKeys []string        `json:"mergedKeys"`
	}
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	bind := func(raw json.RawMessage) BoundMap {
		parsed, err := ParseJSON(raw)
		if err != nil {
			t.Fatal(err)
		}
		bound, err := Bind(parsed)
		if err != nil {
			t.Fatal(err)
		}
		return bound
	}
	merged := Merge(bind(cases.Assign), bind(cases.Second))
	if keys := merged.entries.Keys(); !reflect.DeepEqual(keys, cases.MergedKeys) {
		t.Fatalf("keys %v", keys)
	}
	if value, _ := merged.entries.Get("b"); value != "y" {
		t.Fatalf("b is %v", value)
	}
}

func TestBindReturnsABoundMapUnchanged(t *testing.T) {
	bound, err := Bind(map[string]any{"a": 1})
	if err != nil {
		t.Fatal(err)
	}
	again, err := Bind(bound)
	if err != nil {
		t.Fatal(err)
	}
	if again.entries != bound.entries {
		t.Fatal("bind created another map")
	}
}

func TestZeroBoundMapIsEmpty(t *testing.T) {
	entries, err := BindMap(BoundMap{})
	if err != nil || entries.Len() != 0 {
		t.Fatalf("entries %v %v", entries, err)
	}
	merged := Merge(BoundMap{}, BoundMap{})
	if entries, err := BindMap(merged); err != nil || entries.Len() != 0 {
		t.Fatalf("merged %v %v", entries, err)
	}
}
