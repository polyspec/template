package value

import (
	"fmt"
	"math"
	"reflect"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/polyspec/template/errs"
)

// BindError reports a value that has no binding (VAL-15).
type BindError struct {
	Code    errs.Code
	Message string
}

func (e *BindError) Error() string { return e.Message }

func bindError(code errs.Code, format string, args ...any) *BindError {
	return &BindError{Code: code, Message: fmt.Sprintf(format, args...)}
}

// CheckInteger rejects an integer outside the safe range (VAL-2).
func CheckInteger(i int64) (float64, error) {
	if i > MaxSafe || i < -MaxSafe {
		return 0, bindError(errs.DataNumberRange, "integer %d is outside the safe range", i)
	}
	return float64(i), nil
}

// CheckFloat rejects a number that is not finite (VAL-3).
func CheckFloat(f float64) (float64, error) {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return 0, bindError(errs.DataNumberNotFinite, "number is not finite")
	}
	return f, nil
}

// Bind converts a Go value into a template value (VAL-15).
func Bind(input any) (Value, error) {
	switch x := input.(type) {
	case nil:
		return nil, nil
	case bool:
		return x, nil
	case int:
		return CheckInteger(int64(x))
	case int8:
		return CheckInteger(int64(x))
	case int16:
		return CheckInteger(int64(x))
	case int32:
		return CheckInteger(int64(x))
	case int64:
		return CheckInteger(x)
	case uint:
		if uint64(x) > MaxSafe {
			return nil, bindError(errs.DataNumberRange, "integer %d is outside the safe range", x)
		}
		return float64(x), nil
	case uint8:
		return float64(x), nil
	case uint16:
		return float64(x), nil
	case uint32:
		return float64(x), nil
	case uint64:
		if x > MaxSafe {
			return nil, bindError(errs.DataNumberRange, "integer %d is outside the safe range", x)
		}
		return float64(x), nil
	case float32:
		return CheckFloat(float64(x))
	case float64:
		return CheckFloat(x)
	case string:
		if !utf8.ValidString(x) {
			return nil, bindError(errs.DataInvalidUTF8, "string is not valid UTF-8")
		}
		return x, nil
	case SafeString:
		return x.Text, nil
	case *OrderedMap:
		out := NewOrderedMap()
		for _, k := range x.Keys() {
			v, err := Bind(x.MustGet(k))
			if err != nil {
				return nil, err
			}
			out.Set(k, v)
		}
		return out, nil
	case []Value:
		return bindSlice(reflect.ValueOf(x))
	}
	rv := reflect.ValueOf(input)
	switch rv.Kind() {
	case reflect.Slice, reflect.Array:
		return bindSlice(rv)
	case reflect.Map:
		if rv.Type().Key().Kind() != reflect.String {
			return nil, bindError(errs.DataUnsupportedType, "map key is not a string")
		}
		keys := rv.MapKeys()
		names := make([]string, len(keys))
		for i, k := range keys {
			names[i] = k.String()
		}
		sort.Strings(names)
		out := NewOrderedMap()
		for _, name := range names {
			v, err := Bind(rv.MapIndex(reflect.ValueOf(name).Convert(rv.Type().Key())).Interface())
			if err != nil {
				return nil, err
			}
			out.Set(name, v)
		}
		return out, nil
	case reflect.Struct:
		// Keep application structs as native objects so their methods and identity remain available.
		return input, nil
	case reflect.Pointer:
		if rv.IsNil() {
			return nil, nil
		}
		if rv.Elem().Kind() == reflect.Struct {
			return input, nil
		}
		return Bind(rv.Elem().Interface())
	}
	return nil, bindError(errs.DataUnsupportedType, "a %s value has no binding", rv.Kind())
}

func bindSlice(rv reflect.Value) (Value, error) {
	out := make(List, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		v, err := Bind(rv.Index(i).Interface())
		if err != nil {
			return nil, err
		}
		out[i] = v
	}
	return out, nil
}

func bindStruct(rv reflect.Value) (Value, error) {
	out := NewOrderedMap()
	t := rv.Type()
	for i := 0; i < t.NumField(); i++ {
		field := t.Field(i)
		if !field.IsExported() {
			continue
		}
		name := field.Name
		if tag, ok := field.Tag.Lookup("json"); ok {
			tagName, _, _ := strings.Cut(tag, ",")
			if tagName == "-" {
				continue
			}
			if tagName != "" {
				name = tagName
			}
		}
		v, err := Bind(rv.Field(i).Interface())
		if err != nil {
			return nil, err
		}
		out.Set(name, v)
	}
	return out, nil
}

// BindMap binds a value that must be a map.
func BindMap(input any) (*OrderedMap, error) {
	if input == nil {
		return NewOrderedMap(), nil
	}
	v, err := Bind(input)
	if err != nil {
		return nil, err
	}
	m, ok := v.(*OrderedMap)
	if !ok {
		return nil, bindError(errs.DataUnsupportedType, "assign is not a map")
	}
	return m, nil
}
