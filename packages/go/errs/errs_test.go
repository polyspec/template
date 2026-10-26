package errs_test

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	template "github.com/polyspec/template/packages/go"
	"github.com/polyspec/template/packages/go/errs"
	"github.com/polyspec/template/packages/go/internal/casetest"
)

// TestAParseErrorIsTheErrorObject: a parse error is an *errs.Error with the fields of ERR-1, code, template, line, col,
// offset, end and message, which its JSON writes in that order.
func TestAParseErrorIsTheErrorObject(t *testing.T) {
	// Compare declaration identifiers with the actual exported fields and JSON keys.
	dataPath := filepath.Join(casetest.Dir(t), "..", "..", "config", "parity.json")
	declarations, readErr := os.ReadFile(dataPath)
	if readErr != nil {
		t.Fatal(readErr)
	}
	var config struct {
		Units []struct {
			ID      string `json:"id"`
			Symbols []struct {
				Implementation string `json:"implementation"`
				Symbol         string `json:"symbol"`
			} `json:"symbols"`
		} `json:"units"`
	}
	if decodeErr := json.Unmarshal(declarations, &config); decodeErr != nil {
		t.Fatal(decodeErr)
	}
	typ := reflect.TypeFor[errs.Error]()
	for index := range typ.NumField() {
		field := typ.Field(index)
		key := field.Tag.Get("json")
		found := false
		for _, unit := range config.Units {
			if unit.ID != "api-error-field-"+key {
				continue
			}
			for _, symbol := range unit.Symbols {
				if symbol.Implementation == "go" {
					found = symbol.Symbol == "github.com/polyspec/template/packages/go/errs.Error."+field.Name
				}
			}
		}
		if !found {
			t.Errorf("error field %s (%s) has no correct public declaration", field.Name, key)
		}
	}
	_, err := template.Parse([]byte("a\n{? x}"), "x.tpl", template.ParseOptions{})
	var got *errs.Error
	if !errors.As(err, &got) {
		t.Fatalf("Parse = %v, want an *errs.Error", err)
	}
	if got.Code != errs.ParseUnclosedBlock || got.Template != "x.tpl" || got.Line != 2 || got.Col != 1 || got.Offset != 2 || got.End != 3 || got.Message == "" {
		t.Fatalf("error = %#v", got)
	}
	unpositioned := errs.WithoutPosition(errs.LoadNotFound, "missing.tpl", "missing")
	if want := `{"code":"E_LOAD_NOT_FOUND","template":"missing.tpl","line":0,"col":0,"offset":0,"end":0,"message":"missing"}`; string(unpositioned.JSON()) != want {
		t.Fatalf("unpositioned JSON = %s, want %s", unpositioned.JSON(), want)
	}
	data, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	if want := `{"code":"E_PARSE_UNCLOSED_BLOCK","template":"x.tpl","line":2,"col":1,"offset":2,"end":3,"message":`; !strings.HasPrefix(string(data), want) {
		t.Fatalf("JSON = %s, want the prefix %s", data, want)
	}
}
