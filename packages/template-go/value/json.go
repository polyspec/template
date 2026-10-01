package value

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/polyspec/template/errs"
)

// ParseJSON decodes JSON text into a value, preserving document order and applying VAL-2, VAL-12
// and VAL-20. Text that is not one JSON document is E_DATA_INVALID_JSON. Every error is the first
// violation in document order.
func ParseJSON(text []byte) (Value, error) {
	if !utf8.Valid(text) {
		return nil, bindError(errs.DataInvalidUTF8, "invalid UTF-8 in JSON text")
	}
	if offset, err := CheckJSON(text); err != nil {
		// The check stops at the start of the first violating token; a syntax error before that
		// token is the earlier violation.
		if syntax := syntaxError(text[:offset]); syntax != nil {
			return nil, syntax
		}
		return nil, err
	}
	dec := json.NewDecoder(bytes.NewReader(text))
	dec.UseNumber()
	v, err := decodeValue(dec)
	if err != nil {
		return nil, invalidJSON(err)
	}
	if _, err := dec.Token(); err != io.EOF {
		return nil, bindError(errs.DataInvalidJSON, "unexpected content after the JSON value")
	}
	return v, nil
}

// syntaxError decodes a prefix of a JSON text and returns the syntax error that the prefix
// contains, or nil when the prefix only ends early.
func syntaxError(prefix []byte) error {
	dec := json.NewDecoder(bytes.NewReader(prefix))
	dec.UseNumber()
	for {
		_, err := dec.Token()
		if err == nil {
			continue
		}
		if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
			return nil
		}
		return invalidJSON(err)
	}
}

// invalidJSON reports a decoder failure as E_DATA_INVALID_JSON (VAL-12).
func invalidJSON(err error) error {
	var bindErr *BindError
	if errors.As(err, &bindErr) {
		return err
	}
	if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
		return bindError(errs.DataInvalidJSON, "the JSON text ends before the value is complete")
	}
	return bindError(errs.DataInvalidJSON, "invalid JSON: %s", err.Error())
}

func decodeValue(dec *json.Decoder) (Value, error) {
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	return decodeFromToken(dec, tok)
}

func decodeFromToken(dec *json.Decoder, tok json.Token) (Value, error) {
	switch t := tok.(type) {
	case nil:
		return nil, nil
	case bool:
		return t, nil
	case string:
		return t, nil
	case json.Number:
		return decodeNumber(t)
	case json.Delim:
		switch t {
		case '{':
			m := NewOrderedMap()
			for dec.More() {
				keyTok, err := dec.Token()
				if err != nil {
					return nil, err
				}
				key, ok := keyTok.(string)
				if !ok {
					return nil, bindError(errs.DataInvalidJSON, "object key is not a string")
				}
				v, err := decodeValue(dec)
				if err != nil {
					return nil, err
				}
				m.Set(key, v)
			}
			if _, err := dec.Token(); err != nil {
				return nil, err
			}
			return m, nil
		case '[':
			list := List{}
			for dec.More() {
				v, err := decodeValue(dec)
				if err != nil {
					return nil, err
				}
				list = append(list, v)
			}
			if _, err := dec.Token(); err != nil {
				return nil, err
			}
			return list, nil
		}
	}
	return nil, bindError(errs.DataInvalidJSON, "unexpected JSON token %v", tok)
}

// decodeNumber converts a number literal to the nearest double and applies VAL-2.
func decodeNumber(n json.Number) (Value, error) {
	return numberOf(n.String())
}

func numberOf(literal string) (Value, error) {
	f, err := strconv.ParseFloat(literal, 64)
	if err != nil && !errors.Is(err, strconv.ErrRange) {
		return nil, bindError(errs.DataUnsupportedType, "number %s is not valid", literal)
	}
	return CheckFloat(f)
}

// CheckJSON applies the checks of VAL-2, VAL-12 and VAL-20 that encoding/json does not make, in
// document order: a number outside the binding range, a \u escape that leaves a surrogate unpaired
// and arrays or objects nested deeper than the limit fail at the first occurrence. It returns the
// byte offset of the token that fails with the error. The checks run before the decoder reads the
// text, so the decoder never sees a document deeper than the limit, and an unpaired surrogate is
// reported instead of being replaced with U+FFFD.
func CheckJSON(text []byte) (int, error) {
	level := 0
	for index := 0; index < len(text); index++ {
		switch text[index] {
		case '[', '{':
			level++
			if err := CheckLevel(level); err != nil {
				return index, err
			}
		case ']', '}':
			if level > 0 {
				level--
			}
		case '"':
			end, err := checkString(text, index+1)
			if err != nil {
				return index, err
			}
			index = end
		case '-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9':
			start := index
			for index+1 < len(text) && strings.IndexByte("-+.eE0123456789", text[index+1]) >= 0 {
				index++
			}
			// A malformed token is left to the decoder, which reports the syntax error.
			if f, err := strconv.ParseFloat(string(text[start:index+1]), 64); err == nil || errors.Is(err, strconv.ErrRange) {
				if _, err := CheckFloat(f); err != nil {
					return start, err
				}
			}
		}
	}
	return len(text), nil
}

// checkString checks the escapes of one string that starts after its opening quote and returns
// the index of its closing quote, or the end of the text.
func checkString(text []byte, start int) (int, error) {
	pendingHigh := false
	index := start
	for index < len(text) {
		switch {
		case text[index] == '"':
			if pendingHigh {
				return 0, unpairedSurrogate()
			}
			return index, nil
		case text[index] == '\\' && index+1 < len(text) && text[index+1] == 'u':
			unit, err := strconv.ParseUint(string(text[min(index+2, len(text)):min(index+6, len(text))]), 16, 16)
			isHigh := err == nil && unit >= 0xd800 && unit <= 0xdbff
			isLow := err == nil && unit >= 0xdc00 && unit <= 0xdfff
			switch {
			case isHigh && pendingHigh, isLow && !pendingHigh, !isHigh && !isLow && pendingHigh:
				return 0, unpairedSurrogate()
			}
			pendingHigh = isHigh
			index += 6
			continue
		case text[index] == '\\':
			if pendingHigh {
				return 0, unpairedSurrogate()
			}
			index += 2
			continue
		default:
			if pendingHigh {
				return 0, unpairedSurrogate()
			}
		}
		index++
	}
	if pendingHigh {
		return 0, unpairedSurrogate()
	}
	return index, nil
}

func unpairedSurrogate() error {
	return bindError(errs.DataInvalidUTF8, "a \\u escape leaves a surrogate unpaired")
}
