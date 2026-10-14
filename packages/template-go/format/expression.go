package format

import (
	"strings"

	"github.com/polyspec/template/packages/template-go/parser"
)

// expressionToken is an expression token: its text and the EDT-8 class that the parser gives it.
type expressionToken struct {
	text string
	kind parser.TokenKind
}

// isName reports a name that can be called or indexed: a variable or a function name, not a keyword.
func isName(token expressionToken) bool {
	return token.kind == parser.TokenVariable || token.kind == parser.TokenFunction && !strings.HasPrefix(token.text, ".")
}

// isAccessor reports DOT_IDENT and DOT_INDEX tokens (EXP-5). They stay adjacent to the token on their left.
func isAccessor(token expressionToken) bool {
	return token.kind == parser.TokenProperty || token.kind == parser.TokenFunction && strings.HasPrefix(token.text, ".")
}

// endsOperand reports a token that can end an operand, so that a following `-` is binary and a following `[` an index.
func endsOperand(token *expressionToken) bool {
	if token == nil {
		return false
	}
	if token.text == ")" || token.text == "]" {
		return true
	}
	if token.kind == parser.TokenKeyword {
		return token.text != "in"
	}
	return token.kind != parser.TokenOperator
}

// joinTokens joins expression tokens with the separators of the formatting style: one space around binary and
// ternary operators, `|`, `=>` and `in`; one space after `,`; no space after `(`, `[`, `...` and unary `!` and `-`;
// no space before `,`, `)`, `]` and accessors; no space between a function or method name and `(`, between an operand
// and an index `[`, and around the `::` token of `Class::name`.
func joinTokens(tokens []expressionToken) string {
	if len(tokens) == 0 {
		return ""
	}
	unary := make([]bool, len(tokens))
	for i, token := range tokens {
		var previous *expressionToken
		if i > 0 {
			previous = &tokens[i-1]
		}
		unary[i] = token.text == "!" || token.text == "-" && !endsOperand(previous)
	}
	var output strings.Builder
	output.WriteString(tokens[0].text)
	for i := 1; i < len(tokens); i++ {
		output.WriteString(separator(tokens[i-1], tokens[i], unary[i-1]))
		output.WriteString(tokens[i].text)
	}
	return output.String()
}

func separator(previous, current expressionToken, previousUnary bool) string {
	if previous.text == "::" || current.text == "::" {
		return ""
	}
	if current.text == "," || current.text == ")" || current.text == "]" || isAccessor(current) {
		return ""
	}
	if previous.text == "(" || previous.text == "[" || previous.text == "..." || previousUnary {
		return ""
	}
	if current.text == "(" {
		if isName(previous) || isAccessor(previous) {
			return ""
		}
		return " "
	}
	if current.text == "[" {
		if endsOperand(&previous) {
			return ""
		}
		return " "
	}
	return " "
}
