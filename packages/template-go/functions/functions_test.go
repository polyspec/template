package functions_test

import (
	"fmt"
	"testing"

	"github.com/polyspec/template/functions"
	"github.com/polyspec/template/value"
)

func TestDate(t *testing.T) {
	if offset, ok := functions.ParseOffset("+09:00"); !ok || offset != 32400 {
		t.Error("offset +09:00")
	}
	if _, ok := functions.ParseOffset("+24:00"); ok {
		t.Error("offset +24:00 accepted")
	}
	if got := functions.FormatDate(1789084800, "Y-m-d H:i:s D P", 32400); got != "2026-09-11 09:00:00 Fri +09:00" {
		t.Errorf("format: %q", got)
	}
	if got := functions.FormatDate(0, "Y-m-d l N w", 0); got != "1970-01-01 Thursday 4 4" {
		t.Errorf("epoch: %q", got)
	}
	if got := functions.FormatDate(-86400, "Y-m-d", 0); got != "1969-12-31" {
		t.Errorf("before epoch: %q", got)
	}
	if seconds, err := functions.ToUnixSeconds("1970-01-01T00:00:00+01:00", 0); err != nil || seconds != -3600 {
		t.Errorf("string with offset: %v %v", seconds, err)
	}
	if _, err := functions.ToUnixSeconds("1970-13-01", 0); err == nil {
		t.Error("invalid month accepted")
	}
}

func TestJSONAndURL(t *testing.T) {
	m := value.NewOrderedMap()
	m.Set("a", "<&> ")
	if got, want := functions.ToJSON(m), fmt.Sprintf("{\"a\":\""+`\u%04x\u%04x\u%04x\u%04x`+"\"}", '<', '&', '>', 0x2028); got != want {
		t.Errorf("json: %s", got)
	}
	if got := functions.ToJSON(value.List{1e21, 0.1, nil, true, value.SafeString{Text: "x"}}); got != `[1e+21,0.1,null,true,"x"]` {
		t.Errorf("json list: %s", got)
	}
	if got := functions.PercentEncode("a b/é~!*'()"); got != "a%20b%2F%C3%A9~%21%2A%27%28%29" {
		t.Errorf("url: %s", got)
	}
}

func TestArityTable(t *testing.T) {
	for name, fn := range functions.Builtins {
		if fn.Max >= 0 && fn.Min > fn.Max {
			t.Errorf("%s: min %d > max %d", name, fn.Min, fn.Max)
		}
	}
	now, err := functions.Builtins["now"].Call(nil, functions.Context{Env: functions.Env{Timezone: "Z", Now: 5}})
	if err != nil || now != 5.0 {
		t.Errorf("now: %v %v", now, err)
	}
}
