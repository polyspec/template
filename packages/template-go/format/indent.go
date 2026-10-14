package format

import (
	"fmt"
	"sort"
	"strings"

	"github.com/polyspec/template/packages/template-go/parser"
)

// Indentation: the spaces and tabs at the start of each line, set by the nesting of HTML elements and template blocks.

type indentOptions struct {
	// unit is the indent unit: a run of spaces or one tab.
	unit string
	// templateBlocks is "indent", where template blocks add a level like HTML elements, or "flat", where they add none.
	templateBlocks string
	// limits, when set, is the byte range in which line starts are indented.
	limits *Range
}

// indentError tells why the HTML structure cannot be indented; index is the byte offset where the structure fails.
type indentError struct {
	index   int
	message string
}

var voidElements = setOf("area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr")

// rawElements hold content that is not HTML markup: the indentation does not read tags inside them.
var rawElements = setOf("script", "style", "textarea")

// keptElements keep the indentation of their lines.
var keptElements = setOf("pre", "script", "style", "textarea")

func setOf(names ...string) map[string]bool {
	set := map[string]bool{}
	for _, name := range names {
		set[name] = true
	}
	return set
}

// step is a change of depth at a byte offset. dedent marks a tag that takes one level from its own line.
type step struct {
	index  int
	delta  int
	dedent bool
}

type span struct{ start, end int }

type element struct {
	name  string
	start int
}

// structure is the result of the HTML scan.
type structure struct {
	steps []step
	// kept are the ranges in which a line start keeps its indentation.
	kept []span
	// inside are the ranges of HTML tags spanning lines, whose inner lines get one more level.
	inside []span
}

// block is a template block: the open HTML elements at its start, at the end of its first branch, and whether it has
// an else branch.
type block struct {
	start     []element
	branchEnd []string
	hasEnd    bool
	hasElse   bool
}

// indentEdits returns the edits that set the indentation of every line, or why the HTML structure cannot be indented.
func indentEdits(text string, tags []parser.Tag, options indentOptions) ([]edit, *indentError) {
	scan, failure := scanStructure(text, tags, options.templateBlocks == "indent")
	if failure != nil {
		return nil, failure
	}
	dedents := map[int]bool{}
	for _, s := range scan.steps {
		if s.dedent {
			dedents[s.index] = true
		}
	}
	var edits []edit
	next, depth := 0, 0
	for lineStart := 0; lineStart <= len(text); {
		for next < len(scan.steps) && scan.steps[next].index < lineStart {
			depth += scan.steps[next].delta
			next++
		}
		first := lineStart
		for first < len(text) && (text[first] == ' ' || text[first] == '\t') {
			first++
		}
		inRange := options.limits == nil || lineStart >= options.limits.Start && lineStart < options.limits.End
		if !within(scan.kept, lineStart) && inRange {
			blank := first == len(text) || text[first] == '\n' || text[first] == '\r'
			level := depth
			if within(scan.inside, lineStart) {
				level++
			}
			if dedents[first] {
				level--
			}
			// The formatter empties a blank line.
			indentation := ""
			if !blank {
				indentation = strings.Repeat(options.unit, max(level, 0))
			}
			if text[lineStart:first] != indentation {
				edits = append(edits, edit{start: lineStart, end: first, text: indentation})
			}
		}
		lineEnd := strings.IndexByte(text[lineStart:], '\n')
		if lineEnd < 0 {
			break
		}
		lineStart += lineEnd + 1
	}
	return edits, nil
}

func within(ranges []span, index int) bool {
	for _, r := range ranges {
		if r.start < index && index < r.end {
			return true
		}
	}
	return false
}

func names(elements []element) []string {
	result := make([]string, len(elements))
	for i, e := range elements {
		result[i] = e.name
	}
	return result
}

func sameNames(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for i := range left {
		if left[i] != right[i] {
			return false
		}
	}
	return true
}

// scanStructure reads the HTML elements and template blocks of a text.
func scanStructure(text string, tags []parser.Tag, counted bool) (*structure, *indentError) {
	scan := &structure{}
	var elements []element
	var blocks []*block
	next := 0
	raw := ""
	keptStart := -1
	position := 0

	// beforeLine is the offset from which a change of depth applies to the line of a tag: before the line when the tag
	// starts it.
	beforeLine := func(index int) int {
		lineStart := lineStartBefore(text, index)
		if lineStart > index || strings.Trim(text[lineStart:index], " \t") == "" {
			return lineStart - 1
		}
		return index
	}

	// templateTag handles a template tag, which is opaque to the HTML scan; block tags open, branch and close template
	// blocks. Every branch of a block must end with the same open HTML elements, and a block without an else branch
	// with those of its start.
	templateTag := func(tag parser.Tag) *indentError {
		scan.kept = append(scan.kept, span{tag.Start, tag.End})
		switch tag.Kind {
		case parser.TagIf, parser.TagFor, parser.TagIfBlock:
			blocks = append(blocks, &block{start: append([]element(nil), elements...)})
			if counted {
				scan.steps = append(scan.steps, step{index: tag.End, delta: 1})
			}
			return nil
		case parser.TagElseIf, parser.TagElse, parser.TagClose:
		default:
			return nil
		}
		if len(blocks) == 0 {
			return nil
		}
		b := blocks[len(blocks)-1]
		end := names(elements)
		if b.hasEnd && !sameNames(b.branchEnd, end) {
			return &indentError{index: tag.Start, message: "the HTML elements open at the end of this branch differ from those of the first branch"}
		}
		if tag.Kind == parser.TagClose {
			if !b.hasElse && !sameNames(names(b.start), end) {
				return &indentError{index: tag.Start, message: "a template block without an else branch must end with the HTML elements open at its start"}
			}
			blocks = blocks[:len(blocks)-1]
			// The close tag aligns with the start of its block; the elements that every branch opened apply after it.
			opened := len(end) - len(b.start)
			if opened != 0 {
				scan.steps = append(scan.steps, step{index: beforeLine(tag.Start), delta: -opened}, step{index: tag.End, delta: opened})
			}
			if counted {
				scan.steps = append(scan.steps, step{index: tag.Start, delta: -1, dedent: true})
			}
			return nil
		}
		b.branchEnd, b.hasEnd = end, true
		if tag.Kind == parser.TagElse {
			b.hasElse = true
		}
		// The next branch starts from the elements open at the start of the block.
		scan.steps = append(scan.steps, step{index: beforeLine(tag.Start), delta: len(b.start) - len(elements)})
		elements = append([]element(nil), b.start...)
		if counted {
			scan.steps = append(scan.steps, step{index: tag.Start, delta: 0, dedent: true})
		}
		return nil
	}

	// htmlTagEnd moves past one HTML tag from `<` and returns its end, reading template tags inside it.
	htmlTagEnd := func(start int) (int, *indentError) {
		var quote byte
		quoteStart := 0
		index := start + 1
		for index < len(text) {
			if next < len(tags) && tags[next].Start == index {
				if failure := templateTag(tags[next]); failure != nil {
					return 0, failure
				}
				index = tags[next].End
				next++
				continue
			}
			c := text[index]
			if quote != 0 {
				if c == quote {
					scan.kept = append(scan.kept, span{quoteStart, index})
					quote = 0
				}
			} else if c == '"' || c == '\'' {
				quote = c
				quoteStart = index
			} else if c == '>' {
				return index + 1, nil
			}
			index++
		}
		return 0, &indentError{index: start, message: `the HTML tag is not closed with ">"`}
	}

	// skipTemplateTags reads the template tags inside an HTML comment, which are still template tags; the comment keeps
	// its lines.
	skipTemplateTags := func(end int) *indentError {
		for next < len(tags) && tags[next].Start < end {
			next++
			if failure := templateTag(tags[next-1]); failure != nil {
				return failure
			}
		}
		return nil
	}

	for position < len(text) {
		if next < len(tags) && tags[next].Start == position {
			if failure := templateTag(tags[next]); failure != nil {
				return nil, failure
			}
			position = tags[next].End
			next++
			continue
		}
		if text[position] != '<' {
			position++
			continue
		}
		if raw != "" && !startsWithEndTag(text, position, raw) {
			position++
			continue
		}
		if strings.HasPrefix(text[position:], "<!--") {
			end := len(text)
			if close := strings.Index(text[position+4:], "-->"); close >= 0 {
				end = position + 4 + close + 3
			}
			scan.kept = append(scan.kept, span{position, end})
			if failure := skipTemplateTags(end); failure != nil {
				return nil, failure
			}
			position = end
			continue
		}
		if position+1 < len(text) && (text[position+1] == '!' || text[position+1] == '?') {
			end, failure := htmlTagEnd(position)
			if failure != nil {
				return nil, failure
			}
			position = end
			continue
		}
		closing, name, ok := tagName(text, position)
		if !ok {
			position++
			continue
		}
		end, failure := htmlTagEnd(position)
		if failure != nil {
			return nil, failure
		}
		if strings.Contains(text[position:end], "\n") {
			scan.inside = append(scan.inside, span{position, end})
		}
		if closing {
			if voidElements[name] {
				position = end
				continue
			}
			if len(elements) == 0 {
				return nil, &indentError{index: position, message: fmt.Sprintf("the end tag </%s> has no open element", name)}
			}
			if open := elements[len(elements)-1]; open.name != name {
				return nil, &indentError{index: position, message: fmt.Sprintf("the end tag </%s> does not match the open element <%s>", name, open.name)}
			}
			scan.steps = append(scan.steps, step{index: position, delta: -1, dedent: true})
			elements = elements[:len(elements)-1]
			if keptElements[name] && !anyKept(elements) && keptStart >= 0 {
				keptEnd := len(text)
				if newline := strings.IndexByte(text[position:], '\n'); newline >= 0 {
					keptEnd = position + newline
				}
				scan.kept = append(scan.kept, span{keptStart, keptEnd})
				keptStart = -1
			}
			raw = ""
			position = end
			continue
		}
		selfClosing := text[end-2] == '/'
		if !voidElements[name] && !selfClosing {
			elements = append(elements, element{name: name, start: position})
			scan.steps = append(scan.steps, step{index: end, delta: 1})
			if keptElements[name] && keptStart < 0 {
				keptStart = end
			}
			if rawElements[name] {
				raw = name
			}
		}
		position = end
	}

	if len(elements) > 0 {
		open := elements[len(elements)-1]
		return nil, &indentError{index: open.start, message: fmt.Sprintf("the element <%s> is not closed", open.name)}
	}
	sort.SliceStable(scan.steps, func(i, j int) bool { return scan.steps[i].index < scan.steps[j].index })
	return scan, nil
}

func anyKept(elements []element) bool {
	for _, e := range elements {
		if keptElements[e.name] {
			return true
		}
	}
	return false
}

func isASCIILetter(c byte) bool { return c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' }

// tagName reads `<name` or `</name` at position as /^<(\/?)([A-Za-z][A-Za-z0-9-]*)/ over the next 64 characters, and
// returns the lower-case name.
func tagName(text string, position int) (closing bool, name string, ok bool) {
	limit := min(position+64, len(text))
	index := position + 1
	if index < limit && text[index] == '/' {
		closing = true
		index++
	}
	if index >= limit || !isASCIILetter(text[index]) {
		return false, "", false
	}
	start := index
	for index < limit && (isASCIILetter(text[index]) || text[index] >= '0' && text[index] <= '9' || text[index] == '-') {
		index++
	}
	return closing, strings.ToLower(text[start:index]), true
}

// startsWithEndTag reports `</name` at index in any ASCII letter case; name is lower case.
func startsWithEndTag(text string, index int, name string) bool {
	end := index + len(name) + 2
	if end > len(text) || text[index:index+2] != "</" {
		return false
	}
	for i := range len(name) {
		c := text[index+2+i]
		if c >= 'A' && c <= 'Z' {
			c += 'a' - 'A'
		}
		if c != name[i] {
			return false
		}
	}
	return true
}
