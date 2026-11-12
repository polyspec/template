package expr

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/polyspec/template/packages/go/ast"
	"github.com/polyspec/template/packages/go/errs"
	"github.com/polyspec/template/packages/go/internal/lexer"
)

// DepthLimit is the expression nesting limit (RT-33).
const DepthLimit = 64

var equalityOps = map[TokenType]string{"EQ": "==", "NE": "!=", "SEQ": "===", "SNE": "!=="}
var comparisonOps = map[TokenType]string{"LT": "<", "GT": ">", "LE": "<=", "GE": ">=", "IN": "in"}
var additiveOps = map[TokenType]string{"PLUS": "+", "MINUS": "-"}
var multiplicativeOps = map[TokenType]string{"STAR": "*", "SLASH": "/", "PERCENT": "%"}
var expressionStart = map[TokenType]bool{"IDENT": true, "NUMBER": true, "STRING": true, "NULL": true, "TRUE": true, "FALSE": true, "LPAREN": true, "LBRACKET": true, "BANG": true, "MINUS": true}

// Parser is a recursive descent expression parser.
type Parser struct {
	source  *lexer.Source
	lexer   *Lexer
	options Options
	depth   int
}

// NewParser creates a parser starting at a byte offset.
func NewParser(source *lexer.Source, start int, options Options) *Parser {
	return &Parser{source: source, lexer: NewLexer(source, start, options), options: options}
}

// End is the byte offset after the last consumed token.
func (p *Parser) End() int { return p.lexer.ConsumedEnd() }

// Consumed returns the tokens consumed so far, including the close delimiter.
func (p *Parser) Consumed() []*Token { return p.lexer.Consumed() }

// Peek returns the next token.
func (p *Parser) Peek() (*Token, error) { return p.lexer.Peek() }

// Next consumes the next token.
func (p *Parser) Next() (*Token, error) { return p.lexer.Next() }

// Consume consumes the token that the last Peek returned (Lexer.Consume).
func (p *Parser) Consume() { p.lexer.Consume() }

// Unexpected creates the error for a token the grammar does not accept.
func (p *Parser) Unexpected(tok *Token) error {
	if p.options.OpenIndex >= 0 && p.options.Close != "" {
		if !strings.Contains(p.source.Text[tok.Start:], p.options.Close) {
			return p.lexer.Error(errs.ParseUnterminatedTag, p.options.OpenIndex, p.options.OpenIndex+1, "tag is not terminated")
		}
	}
	if tok.Type == "EOF" {
		return p.lexer.Error(errs.ParseUnexpectedToken, tok.Start, tok.Start, "unexpected end of input")
	}
	return p.lexer.Error(errs.ParseUnexpectedToken, tok.Start, tok.End, fmt.Sprintf("unexpected token %q", tok.Value))
}

// Expect consumes a token of the given type.
func (p *Parser) Expect(typ TokenType) (*Token, error) {
	tok, err := p.Peek()
	if err != nil {
		return nil, err
	}
	if tok.Type != typ {
		return nil, p.Unexpected(tok)
	}
	return p.Next()
}

// ExpectClose consumes the close delimiter of the tag (LEX-11) and returns the offset after it.
func (p *Parser) ExpectClose() (int, error) {
	tok, err := p.Peek()
	if err != nil {
		return 0, err
	}
	if tok.Type == "CLOSE" {
		p.Consume()
		return tok.End, nil
	}
	if tok.Type == "EOF" {
		return 0, p.Unexpected(tok)
	}
	end := -1
	for k := 0; k < p.options.CloseCount; k++ {
		part, err := p.Peek()
		if err != nil {
			return 0, err
		}
		if part.Value != p.options.Close || (k > 0 && part.Start != end) {
			return 0, p.Unexpected(part)
		}
		p.Consume()
		end = part.End
	}
	return end, nil
}

func (p *Parser) span(start, end int) ast.Span { return ast.Span{start, end} }

func (p *Parser) enter() error {
	p.depth++
	if p.depth > DepthLimit {
		tok, err := p.Peek()
		if err != nil {
			return err
		}
		return p.lexer.Error(errs.RuntimeLimit, tok.Start, tok.End, fmt.Sprintf("expression nesting exceeds %d", DepthLimit))
	}
	return nil
}

func (p *Parser) leave() { p.depth-- }

func (p *Parser) peekType() (TokenType, int, error) {
	tok, err := p.Peek()
	if err != nil {
		return "", 0, err
	}
	return tok.Type, tok.Start, nil
}

// ParseExpression parses a full expression including pipes.
func (p *Parser) ParseExpression() (ast.Expr, error) {
	if err := p.enter(); err != nil {
		return nil, err
	}
	defer p.leave()
	_, start, err := p.peekType()
	if err != nil {
		return nil, err
	}
	left, err := p.parseTernary()
	if err != nil {
		return nil, err
	}
	for {
		typ, _, err := p.peekType()
		if err != nil {
			return nil, err
		}
		if typ != "PIPE" {
			return left, nil
		}
		p.Consume()
		name, err := p.Expect("IDENT")
		if err != nil {
			return nil, err
		}
		args := []ast.Expr{left}
		end := name.End
		if typ, _, err := p.peekType(); err != nil {
			return nil, err
		} else if typ == "LPAREN" {
			p.Consume()
			if args, err = p.parseArguments(args); err != nil {
				return nil, err
			}
			close, err := p.Expect("RPAREN")
			if err != nil {
				return nil, err
			}
			end = close.End
		}
		left = &ast.Call{Type: "Call", Name: name.Value, Args: args, Span: p.span(start, end)}
	}
}

func (p *Parser) parseTernary() (ast.Expr, error) {
	_, start, err := p.peekType()
	if err != nil {
		return nil, err
	}
	test, err := p.parseCoalesce()
	if err != nil {
		return nil, err
	}
	typ, _, err := p.peekType()
	if err != nil {
		return nil, err
	}
	switch typ {
	case "QUESTION":
		p.Consume()
		then, err := p.parseTernary()
		if err != nil {
			return nil, err
		}
		if _, err := p.Expect("COLON"); err != nil {
			return nil, err
		}
		otherwise, err := p.parseTernary()
		if err != nil {
			return nil, err
		}
		return &ast.Ternary{Type: "Ternary", Test: test, Then: then, Else: otherwise, Span: p.span(start, p.End())}, nil
	case "ELVIS":
		p.Consume()
		otherwise, err := p.parseTernary()
		if err != nil {
			return nil, err
		}
		return &ast.Ternary{Type: "Ternary", Test: test, Then: nil, Else: otherwise, Span: p.span(start, p.End())}, nil
	}
	return test, nil
}

func (p *Parser) parseCoalesce() (ast.Expr, error) {
	_, start, err := p.peekType()
	if err != nil {
		return nil, err
	}
	left, err := p.parseOr()
	if err != nil {
		return nil, err
	}
	typ, _, err := p.peekType()
	if err != nil {
		return nil, err
	}
	if typ != "COALESCE" {
		return left, nil
	}
	operator, err := p.Next()
	if err != nil {
		return nil, err
	}
	next, _, err := p.peekType()
	if err != nil {
		return nil, err
	}
	if !expressionStart[next] {
		literal := &ast.Literal{Type: "Literal", Kind: "null", Value: nil, Span: p.span(operator.End, operator.End)}
		return &ast.Binary{Type: "Binary", Op: "??", Left: left, Right: literal, Span: p.span(start, operator.End)}, nil
	}
	right, err := p.parseCoalesce()
	if err != nil {
		return nil, err
	}
	return &ast.Binary{Type: "Binary", Op: "??", Left: left, Right: right, Span: p.span(start, p.End())}, nil
}

// parseBinaryLevel parses one precedence level of the binary operators: operands of the next level joined by the operators of
// ops. The operators of a level that chains join from the left; an operator of a level that does not chain (associativity
// none, EXP-10) is unexpected after the second operand.
func (p *Parser) parseBinaryLevel(next func() (ast.Expr, error), ops map[TokenType]string, chains bool) (ast.Expr, error) {
	_, start, err := p.peekType()
	if err != nil {
		return nil, err
	}
	left, err := next()
	if err != nil {
		return nil, err
	}
	for {
		tok, err := p.Peek()
		if err != nil {
			return nil, err
		}
		op, ok := ops[tok.Type]
		if !ok {
			return left, nil
		}
		p.Consume()
		right, err := next()
		if err != nil {
			return nil, err
		}
		left = &ast.Binary{Type: "Binary", Op: op, Left: left, Right: right, Span: p.span(start, p.End())}
		if chains {
			continue
		}
		after, err := p.Peek()
		if err != nil {
			return nil, err
		}
		if _, chained := ops[after.Type]; chained {
			return nil, p.Unexpected(after)
		}
		return left, nil
	}
}

func (p *Parser) parseOr() (ast.Expr, error) {
	return p.parseBinaryLevel(p.parseAnd, map[TokenType]string{"OR": "||"}, true)
}

func (p *Parser) parseAnd() (ast.Expr, error) {
	return p.parseBinaryLevel(p.parseEquality, map[TokenType]string{"AND": "&&"}, true)
}

func (p *Parser) parseEquality() (ast.Expr, error) {
	return p.parseBinaryLevel(p.parseComparison, equalityOps, false)
}

func (p *Parser) parseComparison() (ast.Expr, error) {
	return p.parseBinaryLevel(p.parseAdditive, comparisonOps, false)
}

func (p *Parser) parseAdditive() (ast.Expr, error) {
	return p.parseBinaryLevel(p.parseMultiplicative, additiveOps, true)
}

func (p *Parser) parseMultiplicative() (ast.Expr, error) {
	return p.parseBinaryLevel(p.parseUnary, multiplicativeOps, true)
}

func (p *Parser) parseUnary() (ast.Expr, error) {
	tok, err := p.Peek()
	if err != nil {
		return nil, err
	}
	if tok.Type == "BANG" || tok.Type == "MINUS" {
		p.Consume()
		if err := p.enter(); err != nil {
			return nil, err
		}
		operand, err := p.parseUnary()
		p.leave()
		if err != nil {
			return nil, err
		}
		op := "-"
		if tok.Type == "BANG" {
			op = "!"
		}
		return &ast.Unary{Type: "Unary", Op: op, Operand: operand, Span: p.span(tok.Start, p.End())}, nil
	}
	return p.ParsePostfix(false)
}

// ParsePostfix parses a postfix expression; with adjacentOnly, accessors must touch the previous token (GRM-14).
func (p *Parser) ParsePostfix(adjacentOnly bool) (ast.Expr, error) {
	if err := p.enter(); err != nil {
		return nil, err
	}
	defer p.leave()
	first, err := p.Peek()
	if err != nil {
		return nil, err
	}
	start := first.Start
	var node ast.Expr
	if first.Type == "IDENT" {
		p.Consume()
		after, err := p.Peek()
		if err != nil {
			return nil, err
		}
		switch {
		case after.Type == "DOUBLE_COLON":
			p.Consume()
			method, err := p.Expect("IDENT")
			if err != nil {
				return nil, err
			}
			if _, err := p.Expect("LPAREN"); err != nil {
				return nil, err
			}
			args, close, err := p.parseCallArguments()
			if err != nil {
				return nil, err
			}
			node = &ast.ClassCall{Type: "ClassCall", ClassName: first.Value, Method: method.Value, Args: args, Span: p.span(start, close.End)}
		case after.Type == "LPAREN" && (!adjacentOnly || after.Start == first.End):
			p.Consume()
			args, close, err := p.parseCallArguments()
			if err != nil {
				return nil, err
			}
			node = &ast.Call{Type: "Call", Name: first.Value, Args: args, Span: p.span(start, close.End)}
		case after.Type == "DOT_IDENT" && ast.LoopMetaFields[after.Value[1:]]:
			p.Consume()
			node = &ast.LoopMeta{Type: "LoopMeta", Loop: first.Value, Field: after.Value[1:], Span: p.span(start, after.End)}
		default:
			node = &ast.Var{Type: "Var", Name: first.Value, Span: p.span(start, first.End)}
		}
	} else {
		node, err = p.parsePrimary()
		if err != nil {
			return nil, err
		}
	}
	for {
		tok, err := p.Peek()
		if err != nil {
			return nil, err
		}
		if adjacentOnly && tok.Start != p.End() {
			return node, nil
		}
		switch tok.Type {
		case "DOT_IDENT", "DOT_INDEX":
			p.Consume()
			method := tok.Value[1:]
			next, peekErr := p.Peek()
			if peekErr != nil {
				return nil, peekErr
			}
			if next.Type == "LPAREN" && (!adjacentOnly || next.Start == tok.End) {
				p.Consume()
				args, close, err := p.parseCallArguments()
				if err != nil {
					return nil, err
				}
				node = &ast.MemberCall{Type: "MemberCall", Object: node, Method: method, Args: args, Span: p.span(start, close.End)}
			} else {
				node = &ast.Member{Type: "Member", Object: node, Key: method, Span: p.span(start, tok.End)}
			}
		case "LBRACKET":
			p.Consume()
			index, err := p.ParseExpression()
			if err != nil {
				return nil, err
			}
			close, err := p.Expect("RBRACKET")
			if err != nil {
				return nil, err
			}
			node = &ast.Index{Type: "Index", Object: node, Index: index, Span: p.span(start, close.End)}
		case "LPAREN":
			return nil, p.Unexpected(tok)
		default:
			return node, nil
		}
	}
}

func (p *Parser) parsePrimary() (ast.Expr, error) {
	tok, err := p.Peek()
	if err != nil {
		return nil, err
	}
	switch tok.Type {
	case "NULL":
		p.Consume()
		return &ast.Literal{Type: "Literal", Kind: "null", Value: nil, Span: p.span(tok.Start, tok.End)}, nil
	case "TRUE", "FALSE":
		p.Consume()
		return &ast.Literal{Type: "Literal", Kind: "bool", Value: tok.Type == "TRUE", Span: p.span(tok.Start, tok.End)}, nil
	case "NUMBER":
		p.Consume()
		f, err := strconv.ParseFloat(tok.Value, 64)
		if err != nil {
			return nil, p.lexer.Error(errs.ParseInvalidNumber, tok.Start, tok.End, fmt.Sprintf("number %s is out of range", tok.Value))
		}
		return &ast.Literal{Type: "Literal", Kind: "number", Value: f, Span: p.span(tok.Start, tok.End)}, nil
	case "STRING":
		p.Consume()
		return &ast.Literal{Type: "Literal", Kind: "string", Value: tok.Decoded, Span: p.span(tok.Start, tok.End)}, nil
	case "LPAREN":
		p.Consume()
		inner, err := p.ParseExpression()
		if err != nil {
			return nil, err
		}
		if _, err := p.Expect("RPAREN"); err != nil {
			return nil, err
		}
		return inner, nil
	case "LBRACKET":
		return p.parseBracket()
	}
	return nil, p.Unexpected(tok)
}

type bracketEntry struct {
	key    ast.Expr
	value  ast.Expr
	spread *ast.Spread
}

func (p *Parser) parseBracket() (ast.Expr, error) {
	open, err := p.Next()
	if err != nil {
		return nil, err
	}
	var entries []bracketEntry
	arrows := 0
	for {
		tok, err := p.Peek()
		if err != nil {
			return nil, err
		}
		if tok.Type == "RBRACKET" {
			break
		}
		if tok.Type == "SPREAD" {
			p.Consume()
			expr, err := p.ParseExpression()
			if err != nil {
				return nil, err
			}
			entries = append(entries, bracketEntry{spread: &ast.Spread{Type: "Spread", Expr: expr, Span: p.span(tok.Start, p.End())}})
		} else {
			key, err := p.ParseExpression()
			if err != nil {
				return nil, err
			}
			typ, _, err := p.peekType()
			if err != nil {
				return nil, err
			}
			if typ == "ARROW" {
				p.Consume()
				arrows++
				value, err := p.ParseExpression()
				if err != nil {
					return nil, err
				}
				entries = append(entries, bracketEntry{key: key, value: value})
			} else {
				entries = append(entries, bracketEntry{key: key})
			}
		}
		tok, err = p.Peek()
		if err != nil {
			return nil, err
		}
		if tok.Type == "COMMA" {
			p.Consume()
			continue
		}
		if tok.Type != "RBRACKET" {
			return nil, p.Unexpected(tok)
		}
	}
	close, err := p.Next()
	if err != nil {
		return nil, err
	}
	span := p.span(open.Start, close.End)
	if arrows == 0 {
		items := make([]any, 0, len(entries))
		for _, entry := range entries {
			if entry.spread != nil {
				items = append(items, entry.spread)
			} else {
				items = append(items, entry.key)
			}
		}
		return &ast.List{Type: "List", Items: items, Span: span}, nil
	}
	mapEntries := make([]any, 0, len(entries))
	for _, entry := range entries {
		switch {
		case entry.spread != nil:
			mapEntries = append(mapEntries, entry.spread)
		case entry.value == nil:
			s := ast.SpanOf(entry.key)
			return nil, p.lexer.Error(errs.ParseUnexpectedToken, s[0], s[0]+1, "map literal entry without \"=>\"")
		default:
			mapEntries = append(mapEntries, &ast.MapEntry{Key: entry.key, Value: entry.value})
		}
	}
	return &ast.Map{Type: "Map", Entries: mapEntries, Span: span}, nil
}

// parseCallArguments parses the arguments of a call, after its opening parenthesis, up to the closing parenthesis, which it
// returns.
func (p *Parser) parseCallArguments() ([]ast.Expr, *Token, error) {
	args, err := p.parseArguments(nil)
	if err != nil {
		return nil, nil, err
	}
	close, err := p.Expect("RPAREN")
	if err != nil {
		return nil, nil, err
	}
	return args, close, nil
}

func (p *Parser) parseArguments(args []ast.Expr) ([]ast.Expr, error) {
	if args == nil {
		args = []ast.Expr{}
	}
	for {
		tok, err := p.Peek()
		if err != nil {
			return nil, err
		}
		if tok.Type == "RPAREN" {
			return args, nil
		}
		arg, err := p.ParseExpression()
		if err != nil {
			return nil, err
		}
		args = append(args, arg)
		tok, err = p.Peek()
		if err != nil {
			return nil, err
		}
		if tok.Type == "COMMA" {
			p.Consume()
			continue
		}
		if tok.Type != "RPAREN" {
			return nil, p.Unexpected(tok)
		}
	}
}
