// Package lexer uses the public validated source context (LEX-24).
package lexer

import (
	"fmt"
	"github.com/polyspec/template/packages/go/source"
)

// Source is the same context that the public source package constructs.
type Source = source.Source

// FromBytes validates UTF-8 and removes a leading BOM.
func FromBytes(name string, input []byte) (*Source, error) { return source.FromBytes(name, input) }

// FromString is the native parser harness constructor for valid UTF-8 text.
func FromString(name, text string) *Source {
	value, err := source.FromText(name, text)
	if err != nil {
		panic(fmt.Sprintf("lexer.FromString: %v", err))
	}
	return value
}
