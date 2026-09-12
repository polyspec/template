package functions

import (
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/polyspec/template/errs"
	"github.com/polyspec/template/value"
)

// RangeLimit is the element limit of range (FUN-14).
const RangeLimit = 1_000_000

var indexPattern = regexp.MustCompile(`^(0|[1-9][0-9]*)$`)

func lookupPath(v value.Value, path string) value.Value {
	current := v
	for _, segment := range strings.Split(path, ".") {
		switch x := current.(type) {
		case *value.OrderedMap:
			current = x.MustGet(segment)
		case value.List:
			if !indexPattern.MatchString(segment) {
				return nil
			}
			i, _ := strconv.Atoi(segment)
			if i >= len(x) {
				return nil
			}
			current = x[i]
		default:
			return nil
		}
	}
	return current
}

func sortList(list value.List, key *string) (value.List, error) {
	type keyed struct {
		item, sortKey value.Value
		index         int
	}
	entries := make([]keyed, len(list))
	allNumbers, allStrings := true, true
	for i, item := range list {
		k := item
		if key != nil {
			k = lookupPath(item, *key)
		}
		if _, ok := k.(float64); !ok {
			allNumbers = false
		}
		if !value.IsString(k) {
			allStrings = false
		}
		entries[i] = keyed{item: item, sortKey: k, index: i}
	}
	if !allNumbers && !allStrings {
		return nil, typeError("sort requires all numbers or all strings")
	}
	sort.SliceStable(entries, func(i, j int) bool {
		order, _ := value.Compare(entries[i].sortKey, entries[j].sortKey)
		return order < 0
	})
	result := make(value.List, len(entries))
	for i, entry := range entries {
		result[i] = entry.item
	}
	return result, nil
}

var collectionFunctions = map[string]BuiltIn{
	"keys": {1, 1, func(args []value.Value, _ Context) (value.Value, error) {
		switch x := args[0].(type) {
		case *value.OrderedMap:
			list := make(value.List, 0, x.Len())
			for _, k := range x.Keys() {
				list = append(list, k)
			}
			return list, nil
		case value.List:
			list := make(value.List, len(x))
			for i := range x {
				list[i] = float64(i)
			}
			return list, nil
		}
		return nil, typeError("keys requires a map or a list")
	}},
	"values": {1, 1, func(args []value.Value, _ Context) (value.Value, error) {
		switch x := args[0].(type) {
		case *value.OrderedMap:
			list := make(value.List, 0, x.Len())
			for _, k := range x.Keys() {
				list = append(list, x.MustGet(k))
			}
			return list, nil
		case value.List:
			return x, nil
		}
		return nil, typeError("values requires a map or a list")
	}},
	"first": {1, 1, func(args []value.Value, _ Context) (value.Value, error) {
		if list, ok := args[0].(value.List); ok {
			if len(list) == 0 {
				return nil, nil
			}
			return list[0], nil
		}
		if text, ok := value.TextOf(args[0]); ok {
			runes := []rune(text)
			if len(runes) == 0 {
				return nil, nil
			}
			return string(runes[0]), nil
		}
		return nil, typeError("first requires a list or a string")
	}},
	"last": {1, 1, func(args []value.Value, _ Context) (value.Value, error) {
		if list, ok := args[0].(value.List); ok {
			if len(list) == 0 {
				return nil, nil
			}
			return list[len(list)-1], nil
		}
		if text, ok := value.TextOf(args[0]); ok {
			runes := []rune(text)
			if len(runes) == 0 {
				return nil, nil
			}
			return string(runes[len(runes)-1]), nil
		}
		return nil, typeError("last requires a list or a string")
	}},
	"reverse": {1, 1, func(args []value.Value, _ Context) (value.Value, error) {
		if list, ok := args[0].(value.List); ok {
			out := make(value.List, len(list))
			for i, item := range list {
				out[len(list)-1-i] = item
			}
			return out, nil
		}
		if text, ok := value.TextOf(args[0]); ok {
			runes := []rune(text)
			for i, j := 0, len(runes)-1; i < j; i, j = i+1, j-1 {
				runes[i], runes[j] = runes[j], runes[i]
			}
			return string(runes), nil
		}
		return nil, typeError("reverse requires a list or a string")
	}},
	"slice": {2, 3, func(args []value.Value, _ Context) (value.Value, error) {
		list, isList := args[0].(value.List)
		text, isText := value.TextOf(args[0])
		if !isList && !isText {
			return nil, typeError("slice requires a list or a string")
		}
		var runes []rune
		length := len(list)
		if isText {
			runes = []rune(text)
			length = len(runes)
		}
		from, err := argInteger(args[1])
		if err != nil {
			return nil, err
		}
		if from < 0 {
			from = max(0, from+length)
		}
		if from >= length {
			if isList {
				return value.List{}, nil
			}
			return "", nil
		}
		count := length - from
		if len(args) > 2 {
			if count, err = argInteger(args[2]); err != nil {
				return nil, err
			}
			if count < 0 {
				count = 0
			}
		}
		end := min(from+count, length)
		if isList {
			return append(value.List{}, list[from:end]...), nil
		}
		return string(runes[from:end]), nil
	}},
	"sort": {1, 2, func(args []value.Value, _ Context) (value.Value, error) {
		list, err := argList(args[0], "sort")
		if err != nil {
			return nil, err
		}
		var key *string
		if len(args) > 1 {
			k, err := argString(args[1], "sort")
			if err != nil {
				return nil, err
			}
			key = &k
		}
		return sortList(list, key)
	}},
	"join": {1, 2, func(args []value.Value, _ Context) (value.Value, error) {
		list, err := argList(args[0], "join")
		if err != nil {
			return nil, err
		}
		sep, err := optString(args, 1, ",", "join")
		if err != nil {
			return nil, err
		}
		parts := make([]string, len(list))
		for i, item := range list {
			if parts[i], err = stringifyArg(item); err != nil {
				return nil, err
			}
		}
		return strings.Join(parts, sep), nil
	}},
	"range": {2, 3, func(args []value.Value, _ Context) (value.Value, error) {
		start, err := argNumber(args[0])
		if err != nil {
			return nil, err
		}
		end, err := argNumber(args[1])
		if err != nil {
			return nil, err
		}
		step := 1.0
		if len(args) > 2 {
			if step, err = argNumber(args[2]); err != nil {
				return nil, err
			}
		}
		if step == 0 {
			return nil, typeError("range requires a non-zero step")
		}
		count := math.Floor((end-start)/step) + 1
		if count > RangeLimit {
			return nil, &Error{Code: errs.RuntimeLimit, Message: "range would produce more than 1000000 elements"}
		}
		list := value.List{}
		for i := 0.0; i < count; i++ {
			list = append(list, start+i*step)
		}
		return list, nil
	}},
	"default": {2, 2, func(args []value.Value, _ Context) (value.Value, error) {
		if value.IsTruthy(args[0]) {
			return args[0], nil
		}
		return args[1], nil
	}},
}
