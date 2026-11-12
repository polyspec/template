package value

import "errors"

// ErrStringify is returned when a list or map is converted to text (VAL-8).
var ErrStringify = errors.New("a list or map cannot be converted to text")

// Stringify implements VAL-8.
func Stringify(v Value) (string, error) {
	switch x := v.(type) {
	case nil:
		return "", nil
	case bool:
		if x {
			return "true", nil
		}
		return "false", nil
	case float64:
		return NumberToString(x), nil
	case string:
		return x, nil
	case SafeString:
		return x.Text, nil
	}
	return "", ErrStringify
}
