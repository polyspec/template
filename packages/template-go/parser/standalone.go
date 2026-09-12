package parser

import "sort"

// tagRange is the byte range of a tag including its wrapper.
type tagRange struct {
	start, end int
	echo       bool
}

// byteRange is a removed range of the source.
type byteRange struct {
	start, end int
}

// standaloneRanges implements LEX-14: the byte ranges that standalone line groups remove.
func standaloneRanges(text string, tags []tagRange) []byteRange {
	lineStarts := []int{0}
	for i := 0; i < len(text); i++ {
		if text[i] == '\n' {
			lineStarts = append(lineStarts, i+1)
		}
	}
	lineCount := len(lineStarts)
	lineOf := func(index int) int {
		return sort.Search(lineCount, func(i int) bool { return lineStarts[i] > index }) - 1
	}
	lineEnd := func(line int) int {
		if line+1 < lineCount {
			return lineStarts[line+1]
		}
		return len(text)
	}
	sorted := append([]tagRange(nil), tags...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].start < sorted[j].start })
	byLine := make([][]tagRange, lineCount)
	for _, tag := range sorted {
		line := lineOf(tag.start)
		byLine[line] = append(byLine[line], tag)
	}
	var ranges []byteRange
	for line := 0; line < lineCount; {
		groupEnd := line
		hasTag, hasEcho := false, false
		var groupTags []tagRange
		for cursor := line; cursor <= groupEnd; cursor++ {
			for _, tag := range byLine[cursor] {
				hasTag = true
				if tag.echo {
					hasEcho = true
				}
				groupTags = append(groupTags, tag)
				last := tag.end - 1
				if last < tag.start {
					last = tag.start
				}
				if endLine := lineOf(last); endLine > groupEnd {
					groupEnd = endLine
				}
			}
		}
		if hasTag && !hasEcho {
			start, end := lineStarts[line], lineEnd(groupEnd)
			if onlyWhitespaceOutside(text, start, end, groupTags) {
				ranges = append(ranges, byteRange{start, end})
			}
		}
		line = groupEnd + 1
	}
	return ranges
}

func onlyWhitespaceOutside(text string, start, end int, tags []tagRange) bool {
	index := start
	for _, tag := range tags {
		if !whitespaceOnly(text, index, tag.start) {
			return false
		}
		index = tag.end
	}
	return whitespaceOnly(text, index, end)
}

func whitespaceOnly(text string, start, end int) bool {
	for i := start; i < end; i++ {
		switch text[i] {
		case ' ', '\t', '\r', '\n':
		default:
			return false
		}
	}
	return true
}
