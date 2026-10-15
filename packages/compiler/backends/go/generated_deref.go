package generated

func generatedDeref[T any](input *T) T {
	if input == nil {
		var zero T
		return zero
	}
	return *input
}
