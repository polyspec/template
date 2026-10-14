package value

// OrderedMap is a map with string keys that preserves insertion order (VAL-4).
type OrderedMap struct {
	keys   []string
	values map[string]Value
}

// NewOrderedMap creates an empty map.
func NewOrderedMap() *OrderedMap {
	return &OrderedMap{values: map[string]Value{}}
}

// Set stores a value; a new key is appended, an existing key keeps its position (VAL-12).
func (m *OrderedMap) Set(key string, v Value) {
	if _, ok := m.values[key]; !ok {
		m.keys = append(m.keys, key)
	}
	m.values[key] = v
}

// Get returns the value under a key.
func (m *OrderedMap) Get(key string) (Value, bool) {
	v, ok := m.values[key]
	return v, ok
}

// MustGet returns the value under a key or nil.
func (m *OrderedMap) MustGet(key string) Value {
	return m.values[key]
}

// Has reports whether a key exists.
func (m *OrderedMap) Has(key string) bool {
	_, ok := m.values[key]
	return ok
}

// Keys returns the keys in insertion order.
func (m *OrderedMap) Keys() []string {
	return m.keys
}

// Len returns the number of entries.
func (m *OrderedMap) Len() int {
	return len(m.keys)
}

// Clone returns a shallow copy.
func (m *OrderedMap) Clone() *OrderedMap {
	c := NewOrderedMap()
	for _, k := range m.keys {
		c.Set(k, m.values[k])
	}
	return c
}
