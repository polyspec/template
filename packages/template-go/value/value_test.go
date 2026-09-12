package value_test

import (
	"errors"
	"testing"

	"github.com/polyspec/template/value"
)

func TestNumberToString(t *testing.T) {
	tenth, fifth := 0.1, 0.2
	cases := map[float64]string{1: "1", 0.5: "0.5", 1234.5: "1234.5", tenth + fifth: "0.30000000000000004", 1e21: "1e+21", 1e-7: "1e-7", 1.5e-7: "1.5e-7", 0.000001: "0.000001", 123456789012345680000: "123456789012345680000", 9007199254740991: "9007199254740991"}
	for input, want := range cases {
		if got := value.NumberToString(input); got != want {
			t.Errorf("NumberToString(%v) = %q, want %q", input, got, want)
		}
	}
	if got := value.NumberToString(-0.0 * 1); got != "0" {
		t.Errorf("negative zero = %q", got)
	}
}

func TestFormatNumber(t *testing.T) {
	cases := []struct {
		x         float64
		decimals  int
		dec, thou string
		want      string
	}{
		{2.675, 2, ".", ",", "2.68"}, {1.005, 2, ".", ",", "1.01"}, {-2.5, 0, ".", ",", "-3"}, {-0.001, 2, ".", ",", "0.00"},
		{12345.5, 0, ".", ",", "12,346"}, {1234567.891, 2, ",", ".", "1.234.567,89"}, {999.999, 2, ".", ",", "1,000.00"},
	}
	for _, c := range cases {
		if got := value.FormatNumber(c.x, c.decimals, c.dec, c.thou); got != c.want {
			t.Errorf("FormatNumber(%v, %d) = %q, want %q", c.x, c.decimals, got, c.want)
		}
	}
	if got := value.RoundNumber(2.675, 2); got != 2.68 {
		t.Errorf("RoundNumber = %v", got)
	}
}

func TestTruthinessAndEquality(t *testing.T) {
	for _, falsy := range []value.Value{nil, false, 0.0, "", value.List{}, value.NewOrderedMap()} {
		if value.IsTruthy(falsy) {
			t.Errorf("%v is truthy", falsy)
		}
	}
	for _, truthy := range []value.Value{"0", " ", 1.0, value.List{nil}} {
		if !value.IsTruthy(truthy) {
			t.Errorf("%v is falsy", truthy)
		}
	}
	if !value.LooseEquals("3", 3.0) || value.StrictEquals("3", 3.0) || value.LooseEquals(nil, "") {
		t.Error("equality rules")
	}
	if order, ok := value.Compare("10", "9"); !ok || order >= 0 {
		t.Error("string order")
	}
	if _, ok := value.Compare(1.0, "2"); ok {
		t.Error("mixed order must have no order")
	}
}

func TestParseJSON(t *testing.T) {
	v, err := value.ParseJSON([]byte(`{"2": 1, "1": 2, "x": 1e21}`))
	if err != nil {
		t.Fatal(err)
	}
	m := v.(*value.OrderedMap)
	if keys := m.Keys(); len(keys) != 3 || keys[0] != "2" || keys[1] != "1" || keys[2] != "x" {
		t.Errorf("order %v", keys)
	}
	var be *value.BindError
	if _, err := value.ParseJSON([]byte("9007199254740992")); !errors.As(err, &be) || be.Code != "E_DATA_NUMBER_RANGE" {
		t.Errorf("range check: %v", err)
	}
	if _, err := value.ParseJSON([]byte{'"', 0xff, '"'}); !errors.As(err, &be) || be.Code != "E_DATA_INVALID_UTF8" {
		t.Errorf("utf8 check: %v", err)
	}
}

func TestBind(t *testing.T) {
	type item struct {
		Name  string `json:"name"`
		Price int
		skip  bool
	}
	v, err := value.Bind(map[string]any{"b": []int{1}, "a": item{Name: "x", Price: 2}})
	if err != nil {
		t.Fatal(err)
	}
	m := v.(*value.OrderedMap)
	if keys := m.Keys(); keys[0] != "a" || keys[1] != "b" {
		t.Errorf("map keys sorted by byte order: %v", keys)
	}
	inner := m.MustGet("a").(*value.OrderedMap)
	if keys := inner.Keys(); len(keys) != 2 || keys[0] != "name" || keys[1] != "Price" {
		t.Errorf("struct fields: %v", keys)
	}
	if _, err := value.Bind(int64(1) << 60); err == nil {
		t.Error("large integer accepted")
	}
	number := 3
	if bound, err := value.Bind(&number); err != nil || bound != float64(3) {
		t.Fatalf("scalar pointer binding: value=%v error=%v", bound, err)
	}
	var absent *string
	if bound, err := value.Bind(absent); err != nil || bound != nil {
		t.Fatalf("nil pointer binding: value=%v error=%v", bound, err)
	}
	_ = item{}.skip
}
