package value

import (
	"reflect"
	"sort"

	"github.com/polyspec/template/packages/template-go/errs"
)

// Source is a typed value that generated code declares with its template value: a record becomes
// a map of its declared fields in declaration order, and a typed map becomes a map in entry order
// (VAL-21).
type Source interface {
	TemplateValue() Value
}

// Convert turns a typed Go value that generated code built from template values back into a
// template value. It is not host binding: the value has already passed binding or comes from
// template operations, so the number range, UTF-8 and depth checks of VAL-2, VAL-15 and VAL-20 do
// not apply. A Source returns its own template value; any other struct or pointer to a struct stays
// a native object.
func Convert(input any) (Value, error) {
	switch x := input.(type) {
	case nil, bool, float64, string, SafeString, List, *OrderedMap:
		return x, nil
	}
	rv := reflect.ValueOf(input)
	if rv.Kind() == reflect.Pointer && rv.IsNil() {
		return nil, nil
	}
	if source, ok := input.(Source); ok {
		return source.TemplateValue(), nil
	}
	switch rv.Kind() {
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return float64(rv.Int()), nil
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return float64(rv.Uint()), nil
	case reflect.Float32, reflect.Float64:
		return rv.Float(), nil
	case reflect.String:
		return rv.String(), nil
	case reflect.Bool:
		return rv.Bool(), nil
	case reflect.Slice, reflect.Array:
		out := make(List, rv.Len())
		for i := 0; i < rv.Len(); i++ {
			item, err := Convert(rv.Index(i).Interface())
			if err != nil {
				return nil, err
			}
			out[i] = item
		}
		return out, nil
	case reflect.Map:
		if rv.Type().Key().Kind() != reflect.String {
			return nil, bindError(errs.DataUnsupportedType, "map key is not a string")
		}
		keys := rv.MapKeys()
		names := make([]string, len(keys))
		for i, key := range keys {
			names[i] = key.String()
		}
		sort.Strings(names)
		out := NewOrderedMap()
		for _, name := range names {
			item, err := Convert(rv.MapIndex(reflect.ValueOf(name).Convert(rv.Type().Key())).Interface())
			if err != nil {
				return nil, err
			}
			out.Set(name, item)
		}
		return out, nil
	case reflect.Struct:
		return input, nil
	case reflect.Pointer:
		if rv.IsNil() {
			return nil, nil
		}
		if rv.Elem().Kind() == reflect.Struct {
			return input, nil
		}
		return Convert(rv.Elem().Interface())
	case reflect.Interface:
		if rv.IsNil() {
			return nil, nil
		}
		return Convert(rv.Elem().Interface())
	}
	return nil, bindError(errs.DataUnsupportedType, "a %s value has no template value", rv.Kind())
}
