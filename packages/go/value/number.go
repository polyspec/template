package value

import (
	"math"
	"strconv"
	"strings"
)

// MaxSafe is the largest integer that a number represents exactly (VAL-2).
const MaxSafe = 9007199254740991

// NumberToString implements VAL-9 (ECMAScript Number::toString).
func NumberToString(x float64) string {
	if x == 0 {
		return "0"
	}
	negative := x < 0
	if negative {
		x = -x
	}
	digits, n := ShortestDigits(x)
	k := len(digits)
	var out string
	switch {
	case k <= n && n <= 21:
		out = digits + strings.Repeat("0", n-k)
	case 0 < n && n <= 21:
		out = digits[:n] + "." + digits[n:]
	case -6 < n && n <= 0:
		out = "0." + strings.Repeat("0", -n) + digits
	default:
		e := n - 1
		sign := "+"
		if e < 0 {
			sign = "-"
			e = -e
		}
		if k == 1 {
			out = digits + "e" + sign + strconv.Itoa(e)
		} else {
			out = digits[:1] + "." + digits[1:] + "e" + sign + strconv.Itoa(e)
		}
	}
	if negative {
		return "-" + out
	}
	return out
}

// ShortestDigits returns the shortest round-trip digits of a positive number and the exponent n
// such that x = 0.digits × 10^n (VAL-9 step 3).
func ShortestDigits(x float64) (digits string, n int) {
	text := strconv.FormatFloat(x, 'e', -1, 64)
	mantissa, exp, _ := strings.Cut(text, "e")
	e, _ := strconv.Atoi(exp)
	digits = strings.Replace(mantissa, ".", "", 1)
	digits = strings.TrimRight(digits, "0")
	if digits == "" {
		digits = "0"
	}
	return digits, e + 1
}

// Positional returns the decimal expansion of a number without exponent.
func Positional(x float64) (negative bool, integer, fraction string) {
	if x == 0 {
		return false, "0", ""
	}
	negative = x < 0 || math.Signbit(x)
	digits, n := ShortestDigits(math.Abs(x))
	switch {
	case n <= 0:
		return negative, "0", strings.Repeat("0", -n) + digits
	case n >= len(digits):
		return negative, digits + strings.Repeat("0", n-len(digits)), ""
	default:
		return negative, digits[:n], digits[n:]
	}
}

// RoundDecimal rounds the positional digits half away from zero (FUN-22).
func RoundDecimal(x float64, decimals int) (negative bool, integer, fraction string) {
	negative, integer, fraction = Positional(x)
	if len(fraction) <= decimals {
		return negative, integer, fraction + strings.Repeat("0", decimals-len(fraction))
	}
	roundUp := fraction[decimals] >= '5'
	kept := integer + fraction[:decimals]
	if roundUp {
		kept = incrementDigits(kept)
	}
	split := len(kept) - decimals
	integer = kept[:split]
	if integer == "" {
		integer = "0"
	}
	return negative, integer, kept[split:]
}

func incrementDigits(digits string) string {
	b := []byte(digits)
	for i := len(b) - 1; i >= 0; i-- {
		if b[i] == '9' {
			b[i] = '0'
			continue
		}
		b[i]++
		return string(b)
	}
	return "1" + string(b)
}

// FormatNumber implements FUN-20 to FUN-24.
func FormatNumber(x float64, decimals int, dec, thousands string) string {
	negative, integer, fraction := RoundDecimal(x, decimals)
	var groups []string
	for len(integer) > 3 {
		groups = append([]string{integer[len(integer)-3:]}, groups...)
		integer = integer[:len(integer)-3]
	}
	groups = append([]string{integer}, groups...)
	text := strings.Join(groups, thousands)
	if decimals > 0 {
		text += dec + fraction
	}
	allZero := strings.Trim(integer+fraction, "0") == ""
	if negative && !allZero {
		return "-" + text
	}
	return text
}

// RoundNumber implements FUN-25.
func RoundNumber(x float64, decimals int) float64 {
	negative, integer, fraction := RoundDecimal(x, decimals)
	text := integer
	if fraction != "" {
		text += "." + fraction
	}
	result, _ := strconv.ParseFloat(text, 64)
	if negative && result != 0 {
		return -result
	}
	return result
}
