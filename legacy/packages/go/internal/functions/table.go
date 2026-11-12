package functions

import "maps"

// Builtins is the table of built-in functions (docs/spec/functions.md).
var Builtins = func() map[string]BuiltIn {
	table := map[string]BuiltIn{}
	for _, group := range []map[string]BuiltIn{encodingFunctions, stringFunctions, collectionFunctions, numberFunctions, dateFunctions} {
		maps.Copy(table, group)
	}
	return table
}()
