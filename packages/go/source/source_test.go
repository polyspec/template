package source_test

import (
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/polyspec/template/packages/go/errs"
	"github.com/polyspec/template/packages/go/internal/casetest"
	"github.com/polyspec/template/packages/go/source"
)

type sourceCase struct {
	ID, Name, Input, RawHex, Text, Hex string
	Lines                              []int
	Offsets                            struct{ Byte []int }
	Probe                              struct{ Offset, End, Line, Col int }
}
type invalidCase struct {
	ID, Hex           string
	Offset, Line, Col int
}

func fixtures(t *testing.T) ([]sourceCase, []invalidCase) {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(casetest.Dir(t), "..", "fixtures", "source-context.json"))
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Valid   []sourceCase
		Invalid []invalidCase
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	if len(fixture.Valid) == 0 || len(fixture.Invalid) == 0 {
		t.Fatal("empty source fixture")
	}
	return fixture.Valid, fixture.Invalid
}
func rejects(t *testing.T, operation func()) {
	t.Helper()
	defer func() {
		if recover() == nil {
			t.Error("invalid native range accepted")
		}
	}()
	operation()
}

// LEX-24: public source contexts preserve metadata and native byte projections.
func TestPublicSourceContexts(t *testing.T) {
	valid, _ := fixtures(t)
	for _, item := range valid {
		t.Run(item.ID, func(t *testing.T) {
			data, err := hex.DecodeString(item.RawHex)
			if err != nil {
				t.Fatal(err)
			}
			fromBytes, err := source.FromBytes(item.Name, data)
			if err != nil {
				t.Fatal(err)
			}
			fromText, err := source.FromText(item.Name, item.Input)
			if err != nil {
				t.Fatal(err)
			}
			clear(data)
			for _, context := range []*source.Source{fromBytes, fromText} {
				if context.Name != item.Name || context.Text != item.Text || hex.EncodeToString(context.Bytes()) != item.Hex || !reflect.DeepEqual([]int(context.Lines), item.Lines) {
					t.Fatalf("source metadata differs: %#v", context)
				}
				if context.Length() != len(item.Offsets.Byte)-1 {
					t.Fatal("native length differs")
				}
				for start, offset := range item.Offsets.Byte {
					if context.ByteAt(start) != offset {
						t.Fatal("native projection differs")
					}
					for end := start; end < len(item.Offsets.Byte); end++ {
						if context.Span(start, end) != (errs.Span{offset, item.Offsets.Byte[end]}) {
							t.Fatal("native span differs")
						}
					}
				}
				if !reflect.DeepEqual([]int(errs.NewLineIndex(context.Bytes())), item.Lines) {
					t.Fatal("line index differs")
				}
				line, col := context.Lines.Position(item.Probe.Offset)
				if line != item.Probe.Line || col != item.Probe.Col {
					t.Fatal("position differs")
				}
				err := context.Error(errs.ParseUnexpectedToken, item.Probe.Offset, item.Probe.End, "message")
				if err.Code != errs.ParseUnexpectedToken || err.Template != item.Name || err.Line != line || err.Col != col || err.Offset != item.Probe.Offset || err.End != item.Probe.End || err.Message != "message" {
					t.Fatalf("error differs: %#v", err)
				}
				rejects(t, func() { context.ByteAt(context.Length() + 1) })
				rejects(t, func() { context.Span(1, 0) })
			}
		})
	}
}

// LEX-1, LEX-24: malformed byte input fails at its first invalid byte.
func TestPublicSourceRejectsInvalidUTF8(t *testing.T) {
	_, invalid := fixtures(t)
	for _, item := range invalid {
		t.Run(item.ID, func(t *testing.T) {
			data, err := hex.DecodeString(item.Hex)
			if err != nil {
				t.Fatal(err)
			}
			_, err = source.FromBytes("invalid.tpl", data)
			var failure *errs.Error
			if !errors.As(err, &failure) {
				t.Fatalf("invalid input accepted: %v", err)
			}
			if failure.Code != errs.LexInvalidUTF8 || failure.Offset != item.Offset || failure.End != item.Offset+1 || failure.Line != item.Line || failure.Col != item.Col {
				t.Fatalf("error differs: %#v", failure)
			}
			if _, err := source.FromText("invalid.tpl", string(data)); err == nil {
				t.Fatal("invalid native text accepted")
			}
		})
	}
}
