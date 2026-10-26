package format

import (
	"strings"

	"github.com/polyspec/template/packages/go/internal/parser"
)

// bodyInput is the source text of one tag body and the tokens that the parser classified inside it, its sigil first.
type bodyInput struct {
	kind      parser.TagKind
	source    string
	bodyStart int
	bodyEnd   int
	tokens    []parser.Token
}

func whitespace(text string) bool {
	return strings.Trim(text, " \t\r\n") == ""
}

// formatBody returns the formatted body of a tag in the formatting style (GRM-2), or false when the tag is kept as
// written: comments, directives, bodies that contain a line terminator and bodies whose expression tokens do not
// cover every non-whitespace character.
func formatBody(input bodyInput) (string, bool) {
	source, kind := input.source, input.kind
	body := source[input.bodyStart:input.bodyEnd]
	if strings.ContainsAny(body, "\r\n") || kind == parser.TagComment || kind == parser.TagDirective {
		return "", false
	}
	sigil := input.tokens[0]
	rest := input.tokens[1:]
	text := func(token parser.Token) string { return source[token.Start:token.End] }
	// The parser accepts only spaces and tabs around the words of these bodies.
	after := strings.Trim(source[sigil.End:input.bodyEnd], " \t")
	switch kind {
	case parser.TagEcho:
		expression, ok := expressionText(input, rest, sigil.End)
		return withRest("=", expression, ok)
	case parser.TagIf:
		expression, ok := expressionText(input, rest, sigil.End)
		return withRest("?", expression, ok)
	case parser.TagElseIf:
		expression, ok := expressionText(input, rest, sigil.End)
		return withRest(":?", expression, ok)
	case parser.TagElse:
		return ":", true
	case parser.TagClose:
		return "/", true
	case parser.TagIfBlock:
		return withRest("?#", after, true)
	case parser.TagInclude:
		return withRest("+", after, true)
	case parser.TagBlock:
		return withRest("#", strings.Join(words(after), " "), true)
	case parser.TagFor:
		// The loop variable and its `=`, then the iterated expression.
		name, equals := rest[0], rest[1]
		iter, ok := expressionText(input, rest[2:], equals.End)
		if !ok {
			return "", false
		}
		return "@ " + text(name) + " = " + iter, true
	case parser.TagAssignment:
		// The assigned name and its operator, then the value unless the operator is `++` or `--`.
		name, operator := rest[0], rest[1]
		if len(rest) == 2 {
			if !whitespace(source[operator.End:input.bodyEnd]) {
				return "", false
			}
			return ":" + text(name) + text(operator), true
		}
		value, ok := expressionText(input, rest[2:], operator.End)
		if !ok {
			return "", false
		}
		return ":" + text(name) + " " + text(operator) + " " + value, true
	}
	return "", false
}

func withRest(sigil, rest string, ok bool) (string, bool) {
	if !ok {
		return "", false
	}
	if rest == "" {
		return sigil, true
	}
	return sigil + " " + rest, true
}

// expressionText joins the expression tokens that start at from, or returns false when anything other than whitespace
// lies between them.
func expressionText(input bodyInput, tokens []parser.Token, from int) (string, bool) {
	cursor := from
	joined := make([]expressionToken, 0, len(tokens))
	for _, token := range tokens {
		if !whitespace(input.source[cursor:token.Start]) {
			return "", false
		}
		joined = append(joined, expressionToken{text: input.source[token.Start:token.End], kind: token.Kind})
		cursor = token.End
	}
	if !whitespace(input.source[cursor:input.bodyEnd]) || len(joined) == 0 {
		return "", false
	}
	return joinTokens(joined), true
}

// words splits a block tag body at horizontal whitespace outside string literals.
func words(text string) []string {
	var result []string
	var current strings.Builder
	var quote byte
	for index := 0; index < len(text); index++ {
		c := text[index]
		if quote != 0 {
			current.WriteByte(c)
			switch c {
			case '\\':
				if index+1 < len(text) {
					current.WriteByte(text[index+1])
				}
				index++
			case quote:
				quote = 0
			}
			continue
		}
		if c == ' ' || c == '\t' {
			if current.Len() > 0 {
				result = append(result, current.String())
			}
			current.Reset()
			continue
		}
		if c == '"' || c == '\'' {
			quote = c
		}
		current.WriteByte(c)
	}
	if current.Len() > 0 {
		result = append(result, current.String())
	}
	return result
}
