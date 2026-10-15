package generated

func generatedListEntries[T any](items []T) []generatedEntry[T] {
	result := make([]generatedEntry[T], len(items))
	for index, item := range items {
		result[index] = generatedEntry[T]{float64(index), item}
	}
	return result
}
