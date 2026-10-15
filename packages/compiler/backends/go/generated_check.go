package generated

import (
	"fmt"

	"github.com/polyspec/template/packages/go/value"
)

type generatedType struct {
	Kind     string
	Optional bool
	Name     string
	Item     *generatedType
	Key      *generatedType
	Value    *generatedType
}

type generatedField struct {
	Name string
	Type generatedType
}

func generatedCheck(input value.Value, kind generatedType, records map[string][]generatedField, path string) error {
	if input == nil {
		if kind.Optional || kind.Kind == "any" {
			return nil
		}
		return fmt.Errorf("%s is required", path)
	}
	actual := value.TypeOf(input)
	switch kind.Kind {
	case "any":
		return nil
	case "string":
		if actual != value.TypeString {
			return fmt.Errorf("%s is not a string", path)
		}
	case "number":
		if actual != value.TypeNumber {
			return fmt.Errorf("%s is not a number", path)
		}
	case "boolean":
		if actual != value.TypeBool {
			return fmt.Errorf("%s is not a boolean", path)
		}
	case "list":
		items, ok := input.(value.List)
		if !ok {
			return fmt.Errorf("%s is not a list", path)
		}
		for index, item := range items {
			if err := generatedCheck(item, *kind.Item, records, fmt.Sprintf("%s[%d]", path, index)); err != nil {
				return err
			}
		}
	case "map":
		entries, ok := input.(*value.OrderedMap)
		if !ok {
			return fmt.Errorf("%s is not an object", path)
		}
		for _, key := range entries.Keys() {
			item, _ := entries.Get(key)
			if err := generatedCheck(item, *kind.Value, records, path+"."+key); err != nil {
				return err
			}
		}
	default:
		entries, ok := input.(*value.OrderedMap)
		if !ok {
			return fmt.Errorf("%s is not an object", path)
		}
		return generatedCheckFields(entries, records[kind.Name], records, path)
	}
	return nil
}

func generatedCheckFields(input *value.OrderedMap, fields []generatedField, records map[string][]generatedField, path string) error {
	for _, field := range fields {
		item, _ := input.Get(field.Name)
		if err := generatedCheck(item, field.Type, records, path+"."+field.Name); err != nil {
			return err
		}
	}
	return nil
}
