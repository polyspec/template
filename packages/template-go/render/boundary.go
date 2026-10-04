package render

import (
	"github.com/polyspec/template/errs"
)

// Guard runs one public parse, prepare or render operation and reports a panic as E_INTERNAL for
// template (ERR-12, ERR-13). A template error that generated code propagates as a panic is
// returned unchanged; every other panic, of the engine or of a host callback, is internal.
func Guard[T any](template string, operation func() (T, error)) (result T, err error) {
	defer func() {
		if failure := recover(); failure != nil {
			var zero T
			result = zero
			err = Internal(template, failure)
		}
	}()
	return operation()
}

// Internal converts a recovered panic value into the error that a public operation returns.
func Internal(template string, failure any) error {
	return errs.FromPanic(template, failure)
}
