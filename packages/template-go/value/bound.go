package value

import (
	"errors"

	"github.com/polyspec/template/packages/template-go/errs"
)

// BoundMap is a map that host binding checked once (VAL-22). Its entries are unexported, so host
// code creates a non-empty bound map only with Bind and Merge. The zero value is the empty bound
// map. Renders may read one bound map concurrently, because nothing changes its entries.
type BoundMap struct {
	entries *OrderedMap
}

// Bind applies host binding to a value and returns a bound map that Render and Prepare use as
// assign or as definition data without binding it again (VAL-22). A nil value and a nil pointer to a
// bound map give the empty bound map (RT-4), and a bound map is returned unchanged. Its errors have
// no template and no position (ERR-14); a panic is E_INTERNAL (ERR-13).
func Bind(input any) (bound BoundMap, err error) {
	defer func() {
		if failure := recover(); failure != nil {
			bound, err = BoundMap{}, errs.FromPanic("", failure)
		}
	}()
	switch current := input.(type) {
	case nil:
		return BoundMap{entries: NewOrderedMap()}, nil
	case BoundMap:
		return current, nil
	case *BoundMap:
		if current == nil {
			return BoundMap{entries: NewOrderedMap()}, nil
		}
	}
	value, err := BindValue(input)
	var failure *BindError
	if errors.As(err, &failure) {
		return BoundMap{}, errs.WithoutPosition(failure.Code, "", failure.Message)
	}
	if err != nil {
		return BoundMap{}, err
	}
	entries, ok := value.(*OrderedMap)
	if !ok {
		return BoundMap{}, errs.WithoutPosition(errs.DataUnsupportedType, "", "bind takes a value that binds to a map")
	}
	return BoundMap{entries: entries}, nil
}

// Merge returns a bound map with the entries of first and second: an entry of second replaces the
// entry of first with the same key in its position, and the other entries of second follow
// (RT-26). It reads no value again.
func Merge(first, second BoundMap) BoundMap {
	entries := NewOrderedMap()
	for _, source := range []BoundMap{first, second} {
		if source.entries == nil {
			continue
		}
		for _, key := range source.entries.Keys() {
			entries.Set(key, source.entries.MustGet(key))
		}
	}
	return BoundMap{entries: entries}
}

// boundEntries returns the entries of a bound map given as assign or as definition data; the zero
// value has no entries and gives an empty map.
func (b BoundMap) boundEntries() *OrderedMap {
	if b.entries == nil {
		return NewOrderedMap()
	}
	return b.entries
}
