package expr

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/polyspec/template/ast"
	"github.com/polyspec/template/errs"
	"github.com/polyspec/template/lexer"
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

// Peek returns the next token.
func (p *Parser) Peek() (*Token, error) { return p.lexer.Peek() }

// Next consumes the next token.
func (p *Parser) Next() (*Token, error) { return p.lexer.Next() }

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
		p.Next()
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
		p.Next()
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
		p.Next()
		name, err := p.Expect("IDENT")
		if err != nil {
			return nil, err
		}
		args := []ast.Expr{left}
		end := name.End
		if typ, _, err := p.peekType(); err != nil {
			return nil, err
		} else if typ == "LPAREN" {
			p.Next()
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
		p.Next()
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
		p.Next()
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
	operator, _ := p.Next()
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

func (p *Parser) parseLeftAssoc(next func() (ast.Expr, error), ops map[TokenType]string) (ast.Expr, error) {
	_, start, err := p.peekType()
	if err != nil {
		return nil, err
	}
	left, err := next()
	if err != nil {
		return nil, err
	}
	for {
		typ, _, err := p.peekType()
		if err != nil {
			return nil, err
		}
		op, ok := ops[typ]
		if !ok {
			return left, nil
		}
		p.Next()
		right, err := next()
		if err != nil {
			return nil, err
		}
		left = &ast.Binary{Type: "Binary", Op: op, Left: left, Right: right, Span: p.span(start, p.End())}
	}
}

func (p *Parser) parseNonAssoc(next func() (ast.Expr, error), ops map[TokenType]string) (ast.Expr, error) {
	_, start, err := p.peekType()
	if err != nil {
		return nil, err
	}
	left, err := next()
	if err != nil {
		return nil, err
	}
	typ, _, err := p.peekType()
	if err != nil {
		return nil, err
	}
	op, ok := ops[typ]
	if !ok {
		return left, nil
	}
	p.Next()
	right, err := next()
	if err != nil {
		return nil, err
	}
	node := &ast.Binary{Type: "Binary", Op: op, Left: left, Right: right, Span: p.span(start, p.End())}
	tok, err := p.Peek()
	if err != nil {
		return nil, err
	}
	if _, chained := ops[tok.Type]; chained {
		return nil, p.Unexpected(tok)
	}
	return node, nil
}

func (p *Parser) parseOr() (ast.Expr, error) {
	return p.parseLeftAssoc(p.parseAnd, map[TokenType]string{"OR": "||"})
}

func (p *Parser) parseAnd() (ast.Expr, error) {
	return p.parseLeftAssoc(p.parseEquality, map[TokenType]string{"AND": "&&"})
}

func (p *Parser) parseEquality() (ast.Expr, error) {
	return p.parseNonAssoc(p.parseComparison, equalityOps)
}

func (p *Parser) parseComparison() (ast.Expr, error) {
	return p.parseNonAssoc(p.parseAdditive, comparisonOps)
}

func (p *Parser) parseAdditive() (ast.Expr, error) {
	return p.parseLeftAssoc(p.parseMultiplicative, additiveOps)
}

func (p *Parser) parseMultiplicative() (ast.Expr, error) {
	return p.parseLeftAssoc(p.parseUnary, multiplicativeOps)
}

func (p *Parser) parseUnary() (ast.Expr, error) {
	tok, err := p.Peek()
	if err != nil {
		return nil, err
	}
	if tok.Type == "BANG" || tok.Type == "MINUS" {
		p.Next()
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
		p.Next()
		after, err := p.Peek()
		if err != nil {
			return nil, err
		}
		switch {
		case after.Type == "LPAREN" && (!adjacentOnly || after.Start == first.End):
			p.Next()
			args, err := p.parseArguments(nil)
			if err != nil {
				return nil, err
			}
			close, err := p.Expect("RPAREN")
			if err != nil {
				return nil, err
			}
			node = &ast.Call{Type: "Call", Name: first.Value, Args: args, Span: p.span(start, close.End)}
		case after.Type == "DOT_IDENT" && ast.LoopMetaFields[after.Value[1:]]:
			p.Next()
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
			p.Next()
			node = &ast.Member{Type: "Member", Object: node, Key: tok.Value[1:], Span: p.span(start, tok.End)}
		case "LBRACKET":
			p.Next()
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
		p.Next()
		return &ast.Literal{Type: "Literal", Kind: "null", Value: nil, Span: p.span(tok.Start, tok.End)}, nil
	case "TRUE", "FALSE":
		p.Next()
		return &ast.Literal{Type: "Literal", Kind: "bool", Value: tok.Type == "TRUE", Span: p.span(tok.Start, tok.End)}, nil
	case "NUMBER":
		p.Next()
		f, _ := strconv.ParseFloat(tok.Value, 64)
		return &ast.Literal{Type: "Literal", Kind: "number", Value: f, Span: p.span(tok.Start, tok.End)}, nil
	case "STRING":
		p.Next()
		return &ast.Literal{Type: "Literal", Kind: "string", Value: tok.Decoded, Span: p.span(tok.Start, tok.End)}, nil
	case "LPAREN":
		p.Next()
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
	open, _ := p.Next()
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
			p.Next()
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
				p.Next()
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
			p.Next()
			continue
		}
		if tok.Type != "RBRACKET" {
			return nil, p.Unexpected(tok)
		}
	}
	close, _ := p.Next()
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
			p.Next()
			continue
		}
		if tok.Type != "RPAREN" {
			return nil, p.Unexpected(tok)
		}
	}
}
