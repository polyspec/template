// Package value defines the value types, safe strings, truthiness, equality and ordering
// of docs/spec/data-model.md and docs/spec/expressions.md.
package value

import (
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

// Value is one of nil, bool, float64, string, SafeString, List or *OrderedMap.
type Value = any

// List is an ordered sequence of values.
type List = []Value

// SafeString is a string that the echo tag writes without escaping (VAL-6).
type SafeString struct {
	Text string
}

// Type is a value type name (FUN-19).
type Type string

// Value types.
const (
	TypeNull   Type = "null"
	TypeBool   Type = "bool"
	TypeNumber Type = "number"
	TypeString Type = "string"
	TypeList   Type = "list"
	TypeMap    Type = "map"
)

// TypeOf returns the type name of a value.
func TypeOf(v Value) Type {
	switch v.(type) {
	case nil:
		return TypeNull
	case bool:
		return TypeBool
	case float64:
		return TypeNumber
	case string, SafeString:
		return TypeString
	case List:
		return TypeList
	case *OrderedMap:
		return TypeMap
	}
	return TypeNull
}

// IsString reports whether a value is a string or a safe string.
func IsString(v Value) bool {
	switch v.(type) {
	case string, SafeString:
		return true
	}
	return false
}

// TextOf returns the text of a string or safe string; ok is false for other values.
func TextOf(v Value) (text string, ok bool) {
	switch s := v.(type) {
	case string:
		return s, true
	case SafeString:
		return s.Text, true
	}
	return "", false
}

// CodePointLength returns the number of Unicode code points (VAL-5).
func CodePointLength(s string) int {
	return utf8.RuneCountInString(s)
}

// CompareCodePoints compares two strings by code point sequence (VAL-5).
func CompareCodePoints(a, b string) int {
	return strings.Compare(a, b)
}

// IsTruthy implements EXP-33.
func IsTruthy(v Value) bool {
	switch x := v.(type) {
	case nil:
		return false
	case bool:
		return x
	case float64:
		return x != 0
	case string:
		return x != ""
	case SafeString:
		return x.Text != ""
	case List:
		return len(x) > 0
	case *OrderedMap:
		return x.Len() > 0
	}
	return false
}

var numberGrammar = regexp.MustCompile(`^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$`)

func trimASCII(s string) string {
	return strings.Trim(s, " \t\r\n")
}

// ParseNumericString returns the numeric value of a string under EXP-23, or false.
func ParseNumericString(s string) (float64, bool) {
	t := trimASCII(s)
	if !numberGrammar.MatchString(t) {
		return 0, false
	}
	f, err := strconv.ParseFloat(t, 64)
	if err != nil {
		if numErr, ok := err.(*strconv.NumError); ok && numErr.Err == strconv.ErrRange {
			return 0, false
		}
		return 0, false
	}
	return f, true
}

// LooseEquals implements EXP-34 and EXP-35.
func LooseEquals(a, b Value) bool {
	ta, tb := TypeOf(a), TypeOf(b)
	if ta == tb {
		return sameTypeEquals(a, b, ta)
	}
	if ta == TypeNumber && tb == TypeString {
		text, _ := TextOf(b)
		n, ok := ParseNumericString(text)
		return ok && n == a.(float64)
	}
	if ta == TypeString && tb == TypeNumber {
		text, _ := TextOf(a)
		n, ok := ParseNumericString(text)
		return ok && n == b.(float64)
	}
	return false
}

// StrictEquals implements EXP-37.
func StrictEquals(a, b Value) bool {
	ta := TypeOf(a)
	return ta == TypeOf(b) && sameTypeEquals(a, b, ta)
}

func sameTypeEquals(a, b Value, t Type) bool {
	switch t {
	case TypeNull:
		return true
	case TypeBool:
		return a.(bool) == b.(bool)
	case TypeNumber:
		return a.(float64) == b.(float64)
	case TypeString:
		x, _ := TextOf(a)
		y, _ := TextOf(b)
		return x == y
	case TypeList:
		la, lb := a.(List), b.(List)
		if len(la) != len(lb) {
			return false
		}
		for i := range la {
			if !LooseEquals(la[i], lb[i]) {
				return false
			}
		}
		return true
	case TypeMap:
		ma, mb := a.(*OrderedMap), b.(*OrderedMap)
		if ma.Len() != mb.Len() {
			return false
		}
		for _, key := range ma.Keys() {
			other, ok := mb.Get(key)
			if !ok || !LooseEquals(ma.MustGet(key), other) {
				return false
			}
		}
		return true
	}
	return false
}

// Compare implements EXP-38; ok is false when the pair has no order.
func Compare(a, b Value) (order int, ok bool) {
	if x, isNum := a.(float64); isNum {
		if y, isNum2 := b.(float64); isNum2 {
			switch {
			case x < y:
				return -1, true
			case x > y:
				return 1, true
			}
			return 0, true
		}
		return 0, false
	}
	if x, isStr := TextOf(a); isStr {
		if y, isStr2 := TextOf(b); isStr2 {
			return CompareCodePoints(x, y), true
		}
	}
	return 0, false
}
