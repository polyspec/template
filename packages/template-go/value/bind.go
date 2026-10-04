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

// MaxDepth is the nesting depth limit of lists and maps (VAL-20).
const MaxDepth = 64

// BindError reports a value that has no binding (VAL-15).
type BindError struct {
	Code    errs.Code
	Message string
}

func (e *BindError) Error() string { return e.Message }

func bindError(code errs.Code, format string, args ...any) *BindError {
	return &BindError{Code: code, Message: fmt.Sprintf(format, args...)}
}

// CheckInteger rejects an integer whose magnitude is greater than 2^53 - 1 (VAL-2).
func CheckInteger(i int64) (float64, error) {
	if i > MaxSafe || i < -MaxSafe {
		return 0, bindError(errs.DataNumberRange, "integer %d is outside the safe range", i)
	}
	return float64(i), nil
}

// CheckFloat rejects a number that is not finite (VAL-3) or whose magnitude is greater than
// 2^53 - 1 (VAL-2).
func CheckFloat(f float64) (float64, error) {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return 0, bindError(errs.DataNumberNotFinite, "number is not finite")
	}
	if math.Abs(f) > MaxSafe {
		return 0, bindError(errs.DataNumberRange, "number %v is outside the safe range", f)
	}
	return f, nil
}

// CheckLevel rejects a list or map entered at a level greater than the limit (VAL-20). The level
// counts the enclosing lists and maps, including the one being entered.
func CheckLevel(level int) error {
	if level > MaxDepth {
		return bindError(errs.DataDepth, "lists and maps nest deeper than %d levels", MaxDepth)
	}
	return nil
}

func checkText(text string) (string, error) {
	if !utf8.ValidString(text) {
		return "", bindError(errs.DataInvalidUTF8, "string is not valid UTF-8")
	}
	return text, nil
}

func checkKey(key string) (string, error) {
	if !utf8.ValidString(key) {
		return "", bindError(errs.DataInvalidUTF8, "a map key is not valid UTF-8")
	}
	return key, nil
}

// BindValue converts a Go value into a template value (VAL-15, VAL-20). A bound map fails at every
// position, because render takes one only as assign and as definition data (VAL-22).
func BindValue(input any) (Value, error) {
	return bindAt(input, 0)
}

func bindAt(input any, level int) (Value, error) {
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
		return checkText(x)
	case SafeString:
		return checkText(x.Text)
	case *OrderedMap:
		if err := CheckLevel(level + 1); err != nil {
			return nil, err
		}
		out := NewOrderedMap()
		for _, k := range x.Keys() {
			key, err := checkKey(k)
			if err != nil {
				return nil, err
			}
			v, err := bindAt(x.MustGet(k), level+1)
			if err != nil {
				return nil, err
			}
			out.Set(key, v)
		}
		return out, nil
	case []Value:
		return bindSlice(reflect.ValueOf(x), level)
	case BoundMap:
		return nil, bindError(errs.DataUnsupportedType, "a bound map is accepted only as assign and as definition data")
	case *BoundMap:
		if x == nil {
			return nil, nil
		}
		return nil, bindError(errs.DataUnsupportedType, "a pointer to a bound map has no binding")
	}
	rv := reflect.ValueOf(input)
	switch rv.Kind() {
	case reflect.Slice, reflect.Array:
		return bindSlice(rv, level)
	case reflect.Map:
		if rv.Type().Key().Kind() != reflect.String {
			return nil, bindError(errs.DataUnsupportedType, "map key is not a string")
		}
		if err := CheckLevel(level + 1); err != nil {
			return nil, err
		}
		keys := rv.MapKeys()
		names := make([]string, len(keys))
		for i, k := range keys {
			names[i] = k.String()
		}
		sort.Strings(names)
		out := NewOrderedMap()
		for _, name := range names {
			key, err := checkKey(name)
			if err != nil {
				return nil, err
			}
			v, err := bindAt(rv.MapIndex(reflect.ValueOf(name).Convert(rv.Type().Key())).Interface(), level+1)
			if err != nil {
				return nil, err
			}
			out.Set(key, v)
		}
		return out, nil
	case reflect.Struct:
		// Keep structs as native objects so their methods and identity remain available.
		return input, nil
	case reflect.Pointer:
		if rv.IsNil() {
			return nil, nil
		}
		if rv.Elem().Kind() == reflect.Struct {
			return input, nil
		}
		// A pointer to another kind binds the value it points to; the dereference counts as one
		// level, so a pointer that leads back to itself stops at the depth limit (VAL-15, VAL-20).
		if err := CheckLevel(level + 1); err != nil {
			return nil, err
		}
		return bindAt(rv.Elem().Interface(), level+1)
	}
	return nil, bindError(errs.DataUnsupportedType, "a %s value has no binding", rv.Kind())
}

func bindSlice(rv reflect.Value, level int) (Value, error) {
	if err := CheckLevel(level + 1); err != nil {
		return nil, err
	}
	out := make(List, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		v, err := bindAt(rv.Index(i).Interface(), level+1)
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
		v, err := BindValue(rv.Field(i).Interface())
		if err != nil {
			return nil, err
		}
		out.Set(name, v)
	}
	return out, nil
}

// BindMap binds assign data (RT-4): null is the empty map, a bound map gives its entries without
// binding them again (VAL-22), and every other value must bind to a map.
func BindMap(input any) (*OrderedMap, error) {
	if bound, ok := input.(BoundMap); ok {
		return bound.boundEntries(), nil
	}
	v, err := BindValue(input)
	if err != nil {
		return nil, err
	}
	if v == nil {
		return NewOrderedMap(), nil
	}
	m, ok := v.(*OrderedMap)
	if !ok {
		return nil, bindError(errs.DataUnsupportedType, "assign is not a map")
	}
	return m, nil
}

// BindData binds the data of a template definition (RT-24): a bound map gives its entries without
// binding them again (VAL-22); every other value is bound like any host value.
func BindData(input any) (Value, error) {
	if bound, ok := input.(BoundMap); ok {
		return bound.boundEntries(), nil
	}
	return BindValue(input)
}

// DepthWithin reports whether the depth of a template value is at most limit (VAL-20). The walk
// stops below the limit, so it never recurses deeper than limit + 1 calls.
func DepthWithin(input Value, limit int) bool {
	switch current := input.(type) {
	case List:
		if limit == 0 {
			return false
		}
		for _, item := range current {
			if !DepthWithin(item, limit-1) {
				return false
			}
		}
	case *OrderedMap:
		if limit == 0 {
			return false
		}
		for _, key := range current.Keys() {
			if !DepthWithin(current.MustGet(key), limit-1) {
				return false
			}
		}
	}
	return true
}
