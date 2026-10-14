package value

import "reflect"

// HostArgument converts a template value that a template passes to host code into a new host
// value (VAL-18, VAL-21). A safe string becomes its text, a list a new List and a map a new
// OrderedMap in entry order, at every depth, so a change that host code makes to an argument
// changes no template value. A native object stays the original Go value.
func HostArgument(input Value) Value {
	switch current := input.(type) {
	case SafeString:
		return current.Text
	case List:
		list := make(List, len(current))
		for index, item := range current {
			list[index] = HostArgument(item)
		}
		return list
	case *OrderedMap:
		ordered := NewOrderedMap()
		for _, key := range current.Keys() {
			ordered.Set(key, HostArgument(current.MustGet(key)))
		}
		return ordered
	}
	return input
}

// HostArguments converts an argument list with HostArgument.
func HostArguments(args []Value) []Value {
	converted := make([]Value, len(args))
	for index, item := range args {
		converted[index] = HostArgument(item)
	}
	return converted
}

// sameObject reports whether two native objects are the same host object (EXP-39): the retained
// values have one type and are equal under Go ==. A pointer is equal to a pointer to the same
// address; a struct value has no identity and is equal to a struct value with equal fields; a value
// whose contents are not comparable is equal to no value.
func sameObject(a, b Value) bool {
	left, right := reflect.ValueOf(a), reflect.ValueOf(b)
	if left.Type() != right.Type() || !left.Comparable() || !right.Comparable() {
		return false
	}
	return left.Equal(right)
}
