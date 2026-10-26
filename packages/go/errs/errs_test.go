package errs_test

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	template "github.com/polyspec/template/packages/go"
	"github.com/polyspec/template/packages/go/errs"
)

// TestAParseErrorIsTheErrorObject: a parse error is an *errs.Error with the fields of ERR-1, code, template, line, col,
// offset, end and message, which its JSON writes in that order.
func TestAParseErrorIsTheErrorObject(t *testing.T) {
	_, err := template.Parse([]byte("a\n{? x}"), "x.tpl", template.ParseOptions{})
	var got *errs.Error
	if !errors.As(err, &got) {
		t.Fatalf("Parse = %v, want an *errs.Error", err)
	}
	if got.Code != errs.ParseUnclosedBlock || got.Template != "x.tpl" || got.Line != 2 || got.Col != 1 || got.Offset != 2 || got.End != 3 || got.Message == "" {
		t.Fatalf("error = %#v", got)
	}
	data, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	if want := `{"code":"E_PARSE_UNCLOSED_BLOCK","template":"x.tpl","line":2,"col":1,"offset":2,"end":3,"message":`; !strings.HasPrefix(string(data), want) {
		t.Fatalf("JSON = %s, want the prefix %s", data, want)
	}
}
