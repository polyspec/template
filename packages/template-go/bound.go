package template

import "github.com/polyspec/template/packages/template-go/value"

// BoundMap is a map that host binding checked once (VAL-22); its zero value is the empty bound map.
type BoundMap = value.BoundMap

// Bind applies host binding to a value once and returns a bound map that Render and Prepare use as
// assign or as definition data without binding it again (VAL-22). Its errors have no template and
// no position (ERR-14).
var Bind = value.Bind

// Merge returns a bound map with the entries of first and second by the precedence of RT-26 (VAL-22).
var Merge = value.Merge
