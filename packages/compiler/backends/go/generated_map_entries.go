package generated

func generatedMapEntries[K comparable, V any](items OrderedMap[K, V]) []generatedEntry[V] {
	result := make([]generatedEntry[V], 0, len(items.Entries()))
	for _, entry := range items.Entries() {
		result = append(result, generatedEntry[V]{generatedValue(entry.Key), entry.Value})
	}
	return result
}
