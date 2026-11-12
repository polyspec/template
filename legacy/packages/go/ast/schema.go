package ast

import (
	"bytes"
	_ "embed"
	"errors"
	"fmt"
	"strings"
	"sync"

	"github.com/santhosh-tekuri/jsonschema/v6"
	"golang.org/x/text/language"
	"golang.org/x/text/message"
)

// schemaJSON is the JSON Schema of the template AST, a copy of contracts/schema/ast.schema.json that json_test.go
// compares with it (AST-10).
//
//go:embed ast.schema.json
var schemaJSON []byte

// DecodeError is the failure of DecodeTemplate on JSON that is not a template AST of contracts/schema/ast.schema.json.
type DecodeError struct {
	// Path is the JSON Pointer (RFC 6901) of the invalid node, empty for the root (AST-10).
	Path string
	// Reason is the rule of the schema that the node breaks.
	Reason string
}

func (e *DecodeError) Error() string {
	if e.Path == "" {
		return "invalid template AST at the root: " + e.Reason
	}
	return fmt.Sprintf("invalid template AST at %s: %s", e.Path, e.Reason)
}

// The schema compiles on the first decode, so a program that never decodes an AST does not compile it.
var compiledSchema = sync.OnceValues(func() (*jsonschema.Schema, error) {
	document, err := jsonschema.UnmarshalJSON(bytes.NewReader(schemaJSON))
	if err != nil {
		return nil, err
	}
	compiler := jsonschema.NewCompiler()
	if err := compiler.AddResource("ast.schema.json", document); err != nil {
		return nil, err
	}
	return compiler.Compile("ast.schema.json")
})

var english = message.NewPrinter(language.English)

// validate checks the JSON text data against the schema: it returns the error of reading JSON for text that is not
// JSON and a *DecodeError for JSON that the schema rejects.
func validate(data []byte) error {
	schema, err := compiledSchema()
	if err != nil {
		return fmt.Errorf("the embedded AST schema does not compile: %w", err)
	}
	instance, err := jsonschema.UnmarshalJSON(bytes.NewReader(data))
	if err != nil {
		return err
	}
	var invalid *jsonschema.ValidationError
	if err := schema.Validate(instance); !errors.As(err, &invalid) {
		return err
	}
	node := invalidNode(invalid)
	return &DecodeError{Path: pointer(node.InstanceLocation), Reason: node.ErrorKind.LocalizedString(english)}
}

// invalidNode is the invalid node (AST-10): of the errors of the tree, the deepest instance location, and of several
// at that depth the least in code point order. The schema selects the schema of a node by its type with if/then, so
// an error names a value of the node itself, and the errors of an enclosing if lie above it. Of the errors at that
// location, it is the first one without causes.
func invalidNode(root *jsonschema.ValidationError) *jsonschema.ValidationError {
	var found *jsonschema.ValidationError
	var walk func(*jsonschema.ValidationError)
	walk = func(e *jsonschema.ValidationError) {
		if found == nil || deeper(e, found) {
			found = e
		}
		for _, cause := range e.Causes {
			walk(cause)
		}
	}
	walk(root)
	return found
}

// deeper reports whether a is chosen over b: a deeper location, a smaller pointer at the same depth, or a leaf at the
// same location as an error with causes.
func deeper(a, b *jsonschema.ValidationError) bool {
	if len(a.InstanceLocation) != len(b.InstanceLocation) {
		return len(a.InstanceLocation) > len(b.InstanceLocation)
	}
	if left, right := pointer(a.InstanceLocation), pointer(b.InstanceLocation); left != right {
		return left < right
	}
	return len(a.Causes) == 0 && len(b.Causes) > 0
}

// pointer is the JSON Pointer of the reference tokens of a location.
func pointer(tokens []string) string {
	var builder strings.Builder
	for _, token := range tokens {
		builder.WriteByte('/')
		builder.WriteString(strings.NewReplacer("~", "~0", "/", "~1").Replace(token))
	}
	return builder.String()
}
