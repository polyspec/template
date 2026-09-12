package value

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/polyspec/template/errs"
)

// ParseJSON decodes JSON text into a value, preserving document order and applying VAL-12.
func ParseJSON(text []byte) (Value, error) {
	if !utf8.Valid(text) {
		return nil, bindError(errs.DataInvalidUTF8, "invalid UTF-8 in JSON text")
	}
	dec := json.NewDecoder(bytes.NewReader(text))
	dec.UseNumber()
	v, err := decodeValue(dec)
	if err != nil {
		return nil, err
	}
	if _, err := dec.Token(); err != io.EOF {
		return nil, fmt.Errorf("unexpected content after the JSON value")
	}
	return v, nil
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
					return nil, fmt.Errorf("object key is not a string")
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
	return nil, fmt.Errorf("unexpected JSON token %v", tok)
}

func decodeNumber(n json.Number) (Value, error) {
	literal := n.String()
	isInteger := !strings.ContainsAny(literal, ".eE")
	f, err := strconv.ParseFloat(literal, 64)
	if err != nil || math.IsInf(f, 0) || math.IsNaN(f) {
		return nil, bindError(errs.DataNumberNotFinite, "number %s is not finite", literal)
	}
	if isInteger && math.Abs(f) > MaxSafe {
		return nil, bindError(errs.DataNumberRange, "integer %s is outside the safe range", literal)
	}
	return f, nil
}
