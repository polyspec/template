package functions

import (
	"math"

	"github.com/polyspec/template/packages/go/value"
)

func finite(v float64) (value.Value, error) {
	if math.IsInf(v, 0) || math.IsNaN(v) {
		return nil, typeError("arithmetic result is not finite")
	}
	return v, nil
}

func requireNumber(v value.Value, name string) (float64, error) {
	f, ok := v.(float64)
	if !ok {
		return 0, typeError("%s accepts only numbers", name)
	}
	return f, nil
}

// decimalCount reads the optional decimal count (the second argument) of number and round: zero when absent, never negative.
func decimalCount(args []value.Value, name string) (int, error) {
	if len(args) < 2 {
		return 0, nil
	}
	decimals, err := argInteger(args[1])
	if err != nil {
		return 0, err
	}
	if decimals < 0 {
		return 0, typeError("%s requires a non-negative decimal count", name)
	}
	return decimals, nil
}

var numberFunctions = map[string]BuiltIn{
	"number": {1, 4, func(args []value.Value, _ Context) (value.Value, error) {
		x, err := argNumber(args[0])
		if err != nil {
			return nil, err
		}
		decimals, err := decimalCount(args, "number")
		if err != nil {
			return nil, err
		}
		dec, err := optString(args, 2, ".", "number")
		if err != nil {
			return nil, err
		}
		thousands, err := optString(args, 3, ",", "number")
		if err != nil {
			return nil, err
		}
		return value.FormatNumber(x, decimals, dec, thousands), nil
	}},
	"round": {1, 2, func(args []value.Value, _ Context) (value.Value, error) {
		x, err := argNumber(args[0])
		if err != nil {
			return nil, err
		}
		decimals, err := decimalCount(args, "round")
		if err != nil {
			return nil, err
		}
		return value.RoundNumber(x, decimals), nil
	}},
	"floor": {1, 1, func(args []value.Value, _ Context) (value.Value, error) {
		x, err := argNumber(args[0])
		if err != nil {
			return nil, err
		}
		return finite(math.Floor(x))
	}},
	"ceil": {1, 1, func(args []value.Value, _ Context) (value.Value, error) {
		x, err := argNumber(args[0])
		if err != nil {
			return nil, err
		}
		return finite(math.Ceil(x))
	}},
	"abs": {1, 1, func(args []value.Value, _ Context) (value.Value, error) {
		x, err := argNumber(args[0])
		if err != nil {
			return nil, err
		}
		return math.Abs(x), nil
	}},
	"min": {1, -1, func(args []value.Value, _ Context) (value.Value, error) {
		result := math.Inf(1)
		for _, arg := range args {
			n, err := requireNumber(arg, "min")
			if err != nil {
				return nil, err
			}
			result = math.Min(result, n)
		}
		return result, nil
	}},
	"max": {1, -1, func(args []value.Value, _ Context) (value.Value, error) {
		result := math.Inf(-1)
		for _, arg := range args {
			n, err := requireNumber(arg, "max")
			if err != nil {
				return nil, err
			}
			result = math.Max(result, n)
		}
		return result, nil
	}},
	"num": {1, 1, func(args []value.Value, _ Context) (value.Value, error) {
		return argNumber(args[0])
	}},
}
