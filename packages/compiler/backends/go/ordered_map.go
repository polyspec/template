package generated

import (
	"bytes"
	"encoding/json"
	"fmt"

	"github.com/polyspec/template/packages/go/value"
)

type OrderedEntry[K comparable, V any] struct {
	Key   K
	Value V
}

type OrderedMap[K comparable, V any] struct {
	entries []OrderedEntry[K, V]
}

func NewOrderedMap[K comparable, V any]() OrderedMap[K, V] {
	return OrderedMap[K, V]{}
}

func (m *OrderedMap[K, V]) Set(key K, item V) {
	for index := range m.entries {
		if m.entries[index].Key == key {
			m.entries[index].Value = item
			return
		}
	}
	m.entries = append(m.entries, OrderedEntry[K, V]{key, item})
}

func (m OrderedMap[K, V]) Entries() []OrderedEntry[K, V] {
	return m.entries
}

func (m OrderedMap[K, V]) TemplateValue() value.Value {
	result := value.NewOrderedMap()
	for _, entry := range m.entries {
		result.Set(fmt.Sprint(entry.Key), generatedValue(entry.Value))
	}
	return result
}

func (m *OrderedMap[K, V]) UnmarshalJSON(data []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	if token != json.Delim('{') {
		return fmt.Errorf("generated ordered map must be an object")
	}
	m.entries = nil
	for decoder.More() {
		rawKey, err := decoder.Token()
		if err != nil {
			return err
		}
		keyText, ok := rawKey.(string)
		if !ok {
			return fmt.Errorf("generated ordered map key is not text")
		}
		keyJSON, err := json.Marshal(keyText)
		if err != nil {
			return err
		}
		var key K
		if err := json.Unmarshal(keyJSON, &key); err != nil {
			return err
		}
		var item V
		if err := decoder.Decode(&item); err != nil {
			return err
		}
		m.Set(key, item)
	}
	_, err = decoder.Token()
	return err
}
