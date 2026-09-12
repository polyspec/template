package functions

import (
	"strings"

	"github.com/polyspec/template/value"
)

func asciiUpper(text string) string {
	b := []byte(text)
	for i, c := range b {
		if c >= 'a' && c <= 'z' {
			b[i] = c - 32
		}
	}
	return string(b)
}

func asciiLower(text string) string {
	b := []byte(text)
	for i, c := range b {
		if c >= 'A' && c <= 'Z' {
			b[i] = c + 32
		}
	}
	return string(b)
}

var stringFunctions = map[string]BuiltIn{
	"upper": {1, 1, func(args []value.Value, _ Context) (value.Value, error) {
		text, err := argString(args[0], "upper")
		if err != nil {
			return nil, err
		}
		return asciiUpper(text), nil
	}},
	"lower": {1, 1, func(args []value.Value, _ Context) (value.Value, error) {
		text, err := argString(args[0], "lower")
		if err != nil {
			return nil, err
		}
		return asciiLower(text), nil
	}},
	"trim": {1, 2, func(args []value.Value, _ Context) (value.Value, error) {
		text, err := argString(args[0], "trim")
		if err != nil {
			return nil, err
		}
		chars, err := optString(args, 1, " \t\r\n", "trim")
		if err != nil {
			return nil, err
		}
		return strings.Trim(text, chars), nil
	}},
	"replace": {3, 3, func(args []value.Value, _ Context) (value.Value, error) {
		text, err := argString(args[0], "replace")
		if err != nil {
			return nil, err
		}
		from, err := argString(args[1], "replace")
		if err != nil {
			return nil, err
		}
		to, err := argString(args[2], "replace")
		if err != nil {
			return nil, err
		}
		if from == "" {
			return text, nil
		}
		return strings.ReplaceAll(text, from, to), nil
	}},
	"split": {2, 2, func(args []value.Value, _ Context) (value.Value, error) {
		text, err := argString(args[0], "split")
		if err != nil {
			return nil, err
		}
		sep, err := argString(args[1], "split")
		if err != nil {
			return nil, err
		}
		if sep == "" {
			return nil, typeError("split requires a non-empty separator")
		}
		parts := strings.Split(text, sep)
		list := make(value.List, len(parts))
		for i, part := range parts {
			list[i] = part
		}
		return list, nil
	}},
	"truncate": {2, 3, func(args []value.Value, _ Context) (value.Value, error) {
		text, err := argString(args[0], "truncate")
		if err != nil {
			return nil, err
		}
		limit, err := argInteger(args[1])
		if err != nil {
			return nil, err
		}
		suffix, err := optString(args, 2, "...", "truncate")
		if err != nil {
			return nil, err
		}
		runes := []rune(text)
		if len(runes) > limit {
			if limit < 0 {
				limit = 0
			}
			return string(runes[:limit]) + suffix, nil
		}
		return text, nil
	}},
	"contains": {2, 2, func(args []value.Value, _ Context) (value.Value, error) {
		if haystack, ok := value.TextOf(args[0]); ok {
			needle, ok := value.TextOf(args[1])
			if !ok {
				return nil, typeError("contains requires a string needle for a string haystack")
			}
			return strings.Contains(haystack, needle), nil
		}
		if list, ok := args[0].(value.List); ok {
			for _, item := range list {
				if value.LooseEquals(item, args[1]) {
					return true, nil
				}
			}
			return false, nil
		}
		return nil, typeError("contains requires a string or a list")
	}},
	"starts_with": {2, 2, func(args []value.Value, _ Context) (value.Value, error) {
		s, err := argString(args[0], "starts_with")
		if err != nil {
			return nil, err
		}
		p, err := argString(args[1], "starts_with")
		if err != nil {
			return nil, err
		}
		return strings.HasPrefix(s, p), nil
	}},
	"ends_with": {2, 2, func(args []value.Value, _ Context) (value.Value, error) {
		s, err := argString(args[0], "ends_with")
		if err != nil {
			return nil, err
		}
		p, err := argString(args[1], "ends_with")
		if err != nil {
			return nil, err
		}
		return strings.HasSuffix(s, p), nil
	}},
	"length": {1, 1, func(args []value.Value, _ Context) (value.Value, error) {
		switch x := args[0].(type) {
		case nil:
			return float64(0), nil
		case value.List:
			return float64(len(x)), nil
		case *value.OrderedMap:
			return float64(x.Len()), nil
		}
		if text, ok := value.TextOf(args[0]); ok {
			return float64(value.CodePointLength(text)), nil
		}
		return nil, typeError("length requires a string, list, map or null")
	}},
}
