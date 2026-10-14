package parser

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/polyspec/template/packages/template-go/ast"
	"github.com/polyspec/template/packages/template-go/errs"
	"github.com/polyspec/template/packages/template-go/expr"
	"github.com/polyspec/template/packages/template-go/lexer"
)

var reserved = map[string]bool{"true": true, "false": true, "null": true, "in": true}
var assignHead = regexp.MustCompile(`^([A-Za-z_][A-Za-z0-9_]*)[ \t]*(\+\+|--|[-+*/%]=|=)`)

// matchAssignHead returns the submatch indices of the assignment head at the start of rest, or nil
// (LEX-6). Go regexp has no lookahead, so an operator = that = or > follows is rejected here, as
// the (?![=>]) of the TypeScript ASSIGN_HEAD rejects it.
func matchAssignHead(rest string) []int {
	m := assignHead.FindStringSubmatchIndex(rest)
	if m == nil {
		return nil
	}
	if rest[m[4]:m[5]] == "=" && m[5] < len(rest) && (rest[m[5]] == '=' || rest[m[5]] == '>') {
		return nil
	}
	return m
}

var loopHead = regexp.MustCompile(`^[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*=`)
var whitespaceOnlyPattern = regexp.MustCompile(`^[ \t\r\n]*$`)

type textPiece struct {
	start, end int
	value      string
}

// item is a *textPiece, an ast.Node or a *rawNode.
type item = any

// rawNode is a block node whose bodies are still raw item lists.
type rawNode struct {
	node   ast.Node
	bodies []*[]item
	orelse *[]item
}

type frame struct {
	raw       *rawNode
	current   *[]item
	hasElse   bool
	openStart int
}

type tagContext struct {
	start      int
	open       int
	closeCount int
	wrapper    *Wrapper
}

// TagKind is the kind of an accepted tag.
type TagKind string

// The tag kinds of accepted tags.
const (
	TagAssignment TagKind = "assignment"
	TagBlock      TagKind = "block"
	TagClose      TagKind = "close"
	TagComment    TagKind = "comment"
	TagDirective  TagKind = "directive"
	TagEcho       TagKind = "echo"
	TagElse       TagKind = "else"
	TagElseIf     TagKind = "elseif"
	TagFor        TagKind = "for"
	TagIf         TagKind = "if"
	TagIfBlock    TagKind = "ifblock"
	TagInclude    TagKind = "include"
)

// Tag is the source range of one accepted template tag. Start and End include the wrapper; BodyStart and BodyEnd are
// the byte offsets of the text between the open and the close delimiters, sigil included.
type Tag struct {
	Kind      TagKind
	Start     int
	End       int
	BodyStart int
	BodyEnd   int
	Echo      bool
}

// TokenKind is a token type of EDT-8.
type TokenKind string

// The token types of EDT-8.
const (
	TokenDelimiter TokenKind = "delimiter"
	TokenKeyword   TokenKind = "keyword"
	TokenVariable  TokenKind = "variable"
	TokenProperty  TokenKind = "property"
	TokenFunction  TokenKind = "function"
	TokenString    TokenKind = "string"
	TokenNumber    TokenKind = "number"
	TokenOperator  TokenKind = "operator"
	TokenComment   TokenKind = "comment"
	TokenPath      TokenKind = "path"
)

// Token is a classified byte range of an accepted tag (EDT-8).
type Token struct {
	Start int
	End   int
	Kind  TokenKind
}

// Analysis is the AST of a template with the tags accepted while producing it and the tokens of those tags in source
// order.
type Analysis struct {
	AST    *ast.Template
	Tags   []Tag
	Tokens []Token
}

// Parse parses a source into a template.
func Parse(source *lexer.Source, delimiters Delimiters) (*ast.Template, error) {
	analysis, err := Analyze(source, delimiters)
	if err != nil {
		return nil, err
	}
	return analysis.AST, nil
}

// Analyze parses a source once and returns its AST with the parser-owned tag ranges and tokens.
func Analyze(source *lexer.Source, delimiters Delimiters) (*Analysis, error) {
	root := []item{}
	p := &templateParser{source: source, delimiters: delimiters, text: source.Text, root: &root, textBeforeFirstTagIsWhitespace: true}
	tree, err := p.parse()
	if err != nil {
		return nil, err
	}
	return &Analysis{AST: tree, Tags: p.syntaxTags, Tokens: p.tokens}, nil
}

// expressionKind is the EDT-8 class of an expression token, which depends on its neighbours for names.
func expressionKind(token, previous, next *expr.Token) TokenKind {
	switch token.Type {
	case "STRING":
		return TokenString
	case "NUMBER":
		return TokenNumber
	case "NULL", "TRUE", "FALSE", "IN":
		return TokenKeyword
	case "IDENT":
		if next != nil && next.Type == "LPAREN" || previous != nil && previous.Type == "PIPE" {
			return TokenFunction
		}
		return TokenVariable
	case "DOT_IDENT":
		if next != nil && next.Type == "LPAREN" {
			return TokenFunction
		}
		return TokenProperty
	case "DOT_INDEX":
		return TokenProperty
	}
	return TokenOperator
}

func expressionTokens(parser *expr.Parser) []Token {
	var consumed []*expr.Token
	for _, token := range parser.Consumed() {
		if token.Type != "CLOSE" && token.Type != "EOF" {
			consumed = append(consumed, token)
		}
	}
	tokens := make([]Token, len(consumed))
	for i, token := range consumed {
		var previous, next *expr.Token
		if i > 0 {
			previous = consumed[i-1]
		}
		if i+1 < len(consumed) {
			next = consumed[i+1]
		}
		tokens[i] = Token{Start: token.Start, End: token.End, Kind: expressionKind(token, previous, next)}
	}
	return tokens
}

func sigilKind(sigil string) TagKind {
	switch sigil {
	case "*":
		return TagComment
	case "=":
		return TagEcho
	case "@":
		return TagFor
	case "?":
		return TagIf
	case "?#":
		return TagIfBlock
	case ":?":
		return TagElseIf
	case ":":
		return TagElse
	case "/":
		return TagClose
	case "+":
		return TagInclude
	case "#":
		return TagBlock
	case "%":
		return TagDirective
	}
	panic(fmt.Sprintf("unknown accepted tag sigil %q", sigil))
}

type templateParser struct {
	source     *lexer.Source
	delimiters Delimiters
	text       string
	root       *[]item
	frames     []*frame
	tags       []tagRange
	syntaxTags []Tag
	tokens     []Token
	comments   []*ast.Comment
	// The expression parsers and the tokens outside expressions of the tag being parsed.
	tagParsers                     []*expr.Parser
	tagTokens                      []Token
	sawTag                         bool
	textBeforeFirstTagIsWhitespace bool
}

func (p *templateParser) name() string { return p.source.Name }

func (p *templateParser) fail(code errs.Code, start, end int, message string) error {
	return p.source.Error(code, start, end, message)
}

func (p *templateParser) items() *[]item {
	if len(p.frames) > 0 {
		return p.frames[len(p.frames)-1].current
	}
	return p.root
}

func (p *templateParser) push(it item) {
	list := p.items()
	*list = append(*list, it)
}

func (p *templateParser) top() *frame {
	if len(p.frames) == 0 {
		return nil
	}
	return p.frames[len(p.frames)-1]
}

func (p *templateParser) openFrame(node ast.Node, openStart int) {
	body := []item{}
	p.frames = append(p.frames, &frame{raw: &rawNode{node: node, bodies: []*[]item{&body}}, current: &body, openStart: openStart})
}

func (p *templateParser) parse() (*ast.Template, error) {
	if err := p.scan(); err != nil {
		return nil, err
	}
	if f := p.top(); f != nil {
		return nil, p.fail(errs.ParseUnclosedBlock, f.openStart, f.openStart+1, "block is not closed before the end of the file")
	}
	removed := standaloneRanges(p.text, p.tags)
	comments := p.comments
	if comments == nil {
		comments = []*ast.Comment{}
	}
	return &ast.Template{Type: "Template", Name: p.name(), Body: p.finalize(*p.root, removed), Comments: comments}, nil
}

func (p *templateParser) scan() error {
	text := p.text
	index, textStart := 0, 0
	flush := func(end int) {
		if end > textStart {
			p.pushText(textStart, end, text[textStart:end])
		}
	}
	for index < len(text) {
		c := text[index]
		open := p.delimiters.Open
		if c == '\\' && index+1 < len(text) && text[index+1] == open[0] && startsTag(text, index+1, p.delimiters) {
			flush(index)
			p.pushText(index, index+2, open)
			index += 2
			textStart = index
			continue
		}
		if c == open[0] && startsTag(text, index, p.delimiters) {
			flush(index)
			end, err := p.parseTag(tagContext{start: index, open: index, closeCount: 1})
			if err != nil {
				return err
			}
			index = end
			textStart = index
			continue
		}
		if w := wrappedTagAt(text, index, p.delimiters); w != nil {
			flush(index)
			openIndex := skipHorizontalSpace(text, index+len(w.Opener)) + 1
			end, err := p.parseTag(tagContext{start: index, open: openIndex, closeCount: 2, wrapper: w})
			if err != nil {
				return err
			}
			index = end
			textStart = index
			continue
		}
		index++
	}
	flush(len(text))
	return nil
}

func (p *templateParser) pushText(start, end int, value string) {
	if !p.sawTag && p.textBeforeFirstTagIsWhitespace && !whitespaceOnlyPattern.MatchString(value) {
		p.textBeforeFirstTagIsWhitespace = false
	}
	p.push(&textPiece{start: start, end: end, value: value})
}

func (p *templateParser) closeSequence(c tagContext) string {
	return strings.Repeat(p.delimiters.Close, c.closeCount)
}

func (p *templateParser) exprParser(c tagContext, start int) *expr.Parser {
	parser := expr.NewParser(p.source, start, expr.Options{Close: p.delimiters.Close, CloseCount: c.closeCount, OpenIndex: c.open})
	p.tagParsers = append(p.tagParsers, parser)
	return parser
}

func (p *templateParser) mark(start, end int, kind TokenKind) {
	p.tagTokens = append(p.tagTokens, Token{Start: start, End: end, Kind: kind})
}

// closeStart is the byte offset of the close delimiters of the tag that ends at end: before the wrapper closer and
// the horizontal whitespace in front of it (LEX-19).
func (p *templateParser) closeStart(c tagContext, end int) int {
	tail := end
	if c.wrapper != nil {
		tail -= len(c.wrapper.Closer)
		for isHorizontalSpace(p.text[tail-1]) {
			tail--
		}
	}
	return tail - c.closeCount
}

func (p *templateParser) rawReader(c tagContext) *rawTagReader {
	return &rawTagReader{source: p.source, close: p.delimiters.Close, closeCount: c.closeCount}
}

// expectCloseRaw skips horizontal whitespace and consumes the close delimiter sequence.
func (p *templateParser) expectCloseRaw(c tagContext, index int) (int, error) {
	at := skipHorizontalSpace(p.text, index)
	sequence := p.closeSequence(c)
	if strings.HasPrefix(p.text[at:], sequence) {
		return at + len(sequence), nil
	}
	if !strings.Contains(p.text[at:], p.delimiters.Close) {
		return 0, p.fail(errs.ParseUnterminatedTag, c.open, c.open+1, "tag is not terminated")
	}
	return 0, p.fail(errs.ParseUnexpectedToken, at, at+1, fmt.Sprintf("unexpected %q before the end of the tag", p.text[at:at+1]))
}

// finishTag consumes the wrapper closer of a wrapped tag (LEX-19).
func (p *templateParser) finishTag(c tagContext, afterClose int) (int, error) {
	if c.wrapper == nil {
		return afterClose, nil
	}
	at := skipHorizontalSpace(p.text, afterClose)
	if !strings.HasPrefix(p.text[at:], c.wrapper.Closer) {
		return 0, p.fail(errs.ParseInvalidWrapper, c.start, c.start+len(c.wrapper.Opener), fmt.Sprintf("wrapped tag is not followed by %q", c.wrapper.Closer))
	}
	return at + len(c.wrapper.Closer), nil
}

// closeExpression consumes the close delimiter after an expression and the wrapper closer.
func (p *templateParser) closeExpression(c tagContext, parser *expr.Parser) (int, error) {
	afterClose, err := parser.ExpectClose()
	if err != nil {
		return 0, err
	}
	return p.finishTag(c, afterClose)
}

// closeRaw consumes the close delimiter after a raw body and the wrapper closer.
func (p *templateParser) closeRaw(c tagContext, index int) (int, error) {
	afterClose, err := p.expectCloseRaw(c, index)
	if err != nil {
		return 0, err
	}
	return p.finishTag(c, afterClose)
}

func (p *templateParser) parseTag(c tagContext) (int, error) {
	text := p.text
	sigil := sigilAfter(text, c.open)
	bodyStart := c.open + 1
	if sigil != "" {
		bodyStart = skipHorizontalSpace(text, skipHorizontalSpace(text, c.open+1)+len(sigil))
	}
	firstTag := !p.sawTag
	p.sawTag = true
	p.tagParsers = nil
	p.tagTokens = nil
	assignment := false
	var end int
	var err error
	echo := false
	switch sigil {
	case "*":
		end, err = p.parseComment(c, bodyStart)
	case "=":
		echo = true
		end, err = p.parseEcho(c, bodyStart)
	case "@":
		end, err = p.parseLoop(c, bodyStart)
	case "?":
		end, err = p.parseIf(c, bodyStart)
	case "?#":
		end, err = p.parseIfBlock(c, bodyStart)
	case ":?":
		end, err = p.parseElseIf(c, bodyStart)
	case ":":
		if matchAssignHead(text[bodyStart:]) != nil {
			assignment = true
			end, err = p.parseAssignment(c, bodyStart)
		} else {
			end, err = p.parseElse(c, bodyStart)
		}
	case "/":
		end, err = p.parseClose(c, bodyStart)
	case "+":
		end, err = p.parseInclude(c, bodyStart)
	case "#":
		end, err = p.parseBlock(c, bodyStart)
	case "%":
		end, err = p.parseDirective(c, bodyStart, firstTag)
	case "":
		err = p.fail(errs.ParseUnexpectedToken, bodyStart, bodyStart+1, "unknown tag")
	default:
		err = p.fail(errs.ParseUnexpectedToken, bodyStart, bodyStart+1, "unknown tag")
	}
	if err != nil {
		return 0, err
	}
	p.tags = append(p.tags, tagRange{start: c.start, end: end, echo: echo})
	kind := sigilKind(sigil)
	if assignment {
		kind = TagAssignment
	}
	tagBodyStart := c.open + 1
	tagBodyEnd := p.closeStart(c, end)
	p.syntaxTags = append(p.syntaxTags, Tag{Kind: kind, Start: c.start, End: end, BodyStart: tagBodyStart, BodyEnd: tagBodyEnd, Echo: echo})
	if kind == TagComment {
		p.tokens = append(p.tokens, Token{Start: c.start, End: end, Kind: TokenComment})
		return end, nil
	}
	p.tokens = append(p.tokens, Token{Start: c.start, End: tagBodyStart, Kind: TokenDelimiter})
	sigilStart := skipHorizontalSpace(text, tagBodyStart)
	p.tokens = append(p.tokens, Token{Start: sigilStart, End: sigilStart + len(sigil), Kind: TokenKeyword})
	p.tokens = append(p.tokens, p.tagTokens...)
	for _, parser := range p.tagParsers {
		p.tokens = append(p.tokens, expressionTokens(parser)...)
	}
	p.tokens = append(p.tokens, Token{Start: tagBodyEnd, End: end, Kind: TokenDelimiter})
	return end, nil
}

func (p *templateParser) parseComment(c tagContext, bodyStart int) (int, error) {
	terminator := "*" + p.closeSequence(c)
	at := strings.Index(p.text[bodyStart:], terminator)
	if at < 0 {
		return 0, p.fail(errs.ParseUnterminatedComment, c.open, c.open+1, "comment is not terminated")
	}
	end, err := p.finishTag(c, bodyStart+at+len(terminator))
	if err != nil {
		return 0, err
	}
	// The value starts after the sigil `*` (AST-9).
	valueStart := skipHorizontalSpace(p.text, c.open+1) + 1
	p.comments = append(p.comments, &ast.Comment{Type: "Comment", Value: p.text[valueStart : bodyStart+at], Span: ast.Span{c.start, end}})
	return end, nil
}

func (p *templateParser) parseEcho(c tagContext, bodyStart int) (int, error) {
	parser := p.exprParser(c, bodyStart)
	e, err := parser.ParseExpression()
	if err != nil {
		return 0, err
	}
	end, err := p.closeExpression(c, parser)
	if err != nil {
		return 0, err
	}
	p.push(&ast.Echo{Type: "Echo", Expr: e, Span: ast.Span{c.start, end}})
	return end, nil
}

func (p *templateParser) parseLoop(c tagContext, bodyStart int) (int, error) {
	m := loopHead.FindStringSubmatchIndex(p.text[bodyStart:])
	if m == nil {
		at := skipHorizontalSpace(p.text, bodyStart)
		return 0, p.fail(errs.ParseUnexpectedToken, at, at+1, "loop requires \"name = expression\"")
	}
	name := p.text[bodyStart+m[2] : bodyStart+m[3]]
	if reserved[name] {
		return 0, p.fail(errs.ParseReservedName, bodyStart+m[2], bodyStart+m[3], name+" is a reserved word")
	}
	p.mark(bodyStart+m[2], bodyStart+m[3], TokenVariable)
	p.mark(bodyStart+m[1]-1, bodyStart+m[1], TokenOperator)
	parser := p.exprParser(c, bodyStart+m[1])
	iter, err := parser.ParseExpression()
	if err != nil {
		return 0, err
	}
	end, err := p.closeExpression(c, parser)
	if err != nil {
		return 0, err
	}
	p.openFrame(&ast.For{Type: "For", Name: name, Iter: iter, Span: ast.Span{c.start, end}}, c.start)
	return end, nil
}

func (p *templateParser) parseIf(c tagContext, bodyStart int) (int, error) {
	parser := p.exprParser(c, bodyStart)
	test, err := parser.ParseExpression()
	if err != nil {
		return 0, err
	}
	end, err := p.closeExpression(c, parser)
	if err != nil {
		return 0, err
	}
	span := ast.Span{c.start, end}
	p.openFrame(&ast.If{Type: "If", Branches: []*ast.IfBranch{{Test: test, Span: span}}, Span: span}, c.start)
	return end, nil
}

func (p *templateParser) parseIfBlock(c tagContext, bodyStart int) (int, error) {
	parser := p.exprParser(c, bodyStart)
	id, err := parser.Expect("IDENT")
	if err != nil {
		return 0, err
	}
	end, err := p.closeExpression(c, parser)
	if err != nil {
		return 0, err
	}
	p.openFrame(&ast.IfBlock{Type: "IfBlock", ID: id.Value, Span: ast.Span{c.start, end}}, c.start)
	return end, nil
}

func (p *templateParser) parseElseIf(c tagContext, bodyStart int) (int, error) {
	f := p.top()
	if f == nil {
		return 0, p.fail(errs.ParseElseOutsideBlock, c.start, c.start+1, "\"{:?}\" outside of a block")
	}
	ifNode, ok := f.raw.node.(*ast.If)
	if !ok {
		return 0, p.fail(errs.ParseElseifNotInIf, c.start, c.start+1, "\"{:?}\" inside a loop or if-block")
	}
	if f.hasElse {
		return 0, p.fail(errs.ParseElseifAfterElse, c.start, c.start+1, "\"{:?}\" after \"{:}\"")
	}
	parser := p.exprParser(c, bodyStart)
	test, err := parser.ParseExpression()
	if err != nil {
		return 0, err
	}
	end, err := p.closeExpression(c, parser)
	if err != nil {
		return 0, err
	}
	ifNode.Branches = append(ifNode.Branches, &ast.IfBranch{Test: test, Span: ast.Span{c.start, end}})
	body := []item{}
	f.raw.bodies = append(f.raw.bodies, &body)
	f.current = &body
	return end, nil
}

func (p *templateParser) parseElse(c tagContext, bodyStart int) (int, error) {
	f := p.top()
	if f == nil {
		return 0, p.fail(errs.ParseElseOutsideBlock, c.start, c.start+1, "\"{:}\" outside of a block")
	}
	if f.hasElse {
		return 0, p.fail(errs.ParseDuplicateElse, c.start, c.start+1, "second \"{:}\" in the same block")
	}
	end, err := p.closeRaw(c, bodyStart)
	if err != nil {
		return 0, err
	}
	body := []item{}
	f.raw.orelse = &body
	f.current = &body
	f.hasElse = true
	return end, nil
}

func (p *templateParser) parseClose(c tagContext, bodyStart int) (int, error) {
	f := p.top()
	if f == nil {
		return 0, p.fail(errs.ParseUnexpectedClose, c.start, c.start+1, "\"{/}\" without an open block")
	}
	end, err := p.closeRaw(c, bodyStart)
	if err != nil {
		return 0, err
	}
	p.frames = p.frames[:len(p.frames)-1]
	setSpan(f.raw.node, ast.Span{f.openStart, end})
	p.push(f.raw)
	return end, nil
}

func (p *templateParser) parseInclude(c tagContext, bodyStart int) (int, error) {
	path, err := p.rawReader(c).readIncludePath(bodyStart)
	if err != nil {
		return 0, err
	}
	p.mark(path.start, path.end, rawKind(path.quoted))
	end, err := p.closeRaw(c, path.end)
	if err != nil {
		return 0, err
	}
	p.push(&ast.Include{Type: "Include", Path: path.value, Span: ast.Span{c.start, end}})
	return end, nil
}

func (p *templateParser) parseBlock(c tagContext, bodyStart int) (int, error) {
	body, err := p.rawReader(c).readBlockBody(bodyStart)
	if err != nil {
		return 0, err
	}
	for _, word := range body.words {
		p.mark(word.start, word.end, rawKind(word.quoted))
	}
	end, err := p.closeRaw(c, body.end)
	if err != nil {
		return 0, err
	}
	p.push(&ast.Block{Type: "Block", ID: body.id, Path: body.path, Scope: body.scope, Span: ast.Span{c.start, end}})
	return end, nil
}

func (p *templateParser) parseAssignment(c tagContext, bodyStart int) (int, error) {
	m := matchAssignHead(p.text[bodyStart:])
	if m == nil {
		return 0, p.fail(errs.ParseUnexpectedToken, bodyStart, bodyStart+1, "unknown tag")
	}
	name := p.text[bodyStart+m[2] : bodyStart+m[3]]
	operator := p.text[bodyStart+m[4] : bodyStart+m[5]]
	if reserved[name] {
		return 0, p.fail(errs.ParseReservedName, bodyStart, bodyStart+len(name), name+" is a reserved word")
	}
	variable := &ast.Var{Type: "Var", Name: name, Span: ast.Span{bodyStart, bodyStart + len(name)}}
	afterOperator := bodyStart + m[1]
	p.mark(bodyStart, bodyStart+len(name), TokenVariable)
	p.mark(afterOperator-len(operator), afterOperator, TokenOperator)
	var value ast.Expr
	var end int
	var err error
	if operator == "++" || operator == "--" {
		if end, err = p.closeRaw(c, afterOperator); err != nil {
			return 0, err
		}
		one := &ast.Literal{Type: "Literal", Kind: "number", Value: float64(1), Span: ast.Span{afterOperator - 2, afterOperator}}
		op := "+"
		if operator == "--" {
			op = "-"
		}
		value = &ast.Binary{Type: "Binary", Op: op, Left: variable, Right: one, Span: ast.Span{bodyStart, afterOperator}}
	} else {
		parser := p.exprParser(c, afterOperator)
		rhs, err := parser.ParseExpression()
		if err != nil {
			return 0, err
		}
		if end, err = p.closeExpression(c, parser); err != nil {
			return 0, err
		}
		if operator == "=" {
			value = rhs
		} else {
			value = &ast.Binary{Type: "Binary", Op: operator[:1], Left: variable, Right: rhs, Span: ast.Span{bodyStart, parser.End()}}
		}
	}
	p.push(&ast.Set{Type: "Set", Name: name, Expr: value, Span: ast.Span{c.start, end}})
	return end, nil
}

func (p *templateParser) parseDirective(c tagContext, bodyStart int, firstTag bool) (int, error) {
	invalid := func(message string) error {
		return p.fail(errs.ParseInvalidDirective, c.start, c.start+1, message)
	}
	if !firstTag || !p.textBeforeFirstTagIsWhitespace {
		return 0, invalid("delimiter directive is not the first tag")
	}
	index := skipHorizontalSpace(p.text, bodyStart)
	if !strings.HasPrefix(p.text[index:], "delimiter") {
		return 0, invalid("directive is not \"delimiter\"")
	}
	p.mark(index, index+len("delimiter"), TokenKeyword)
	index = skipHorizontalSpace(p.text, index+len("delimiter"))
	valueStart := index
	value := ""
	for index < len(p.text) && !isHorizontalSpace(p.text[index]) && !strings.HasPrefix(p.text[index:], p.closeSequence(c)) {
		value += p.text[index : index+1]
		index++
		if len(value) > 2 {
			break
		}
	}
	delimiters, ok := ParseDelimiters(value)
	if !ok {
		return 0, invalid(fmt.Sprintf("%q is not a delimiter pair", value))
	}
	p.mark(valueStart, index, TokenString)
	end, err := p.closeRaw(c, index)
	if err != nil {
		return 0, err
	}
	p.delimiters = delimiters
	return end, nil
}

func rawKind(quoted bool) TokenKind {
	if quoted {
		return TokenString
	}
	return TokenPath
}

func setSpan(node ast.Node, span ast.Span) {
	switch n := node.(type) {
	case *ast.If:
		n.Span = span
	case *ast.For:
		n.Span = span
	case *ast.IfBlock:
		n.Span = span
	}
}

// finalize applies standalone removal to text pieces and merges them into Text nodes (AST-6).
func (p *templateParser) finalize(items []item, removed []byteRange) []ast.Node {
	nodes := []ast.Node{}
	var pending []*textPiece
	flush := func() {
		if len(pending) == 0 {
			return
		}
		var value strings.Builder
		for _, piece := range pending {
			value.WriteString(piece.value)
		}
		if value.Len() > 0 {
			nodes = append(nodes, &ast.Text{Type: "Text", Value: value.String(), Span: ast.Span{pending[0].start, pending[len(pending)-1].end}})
		}
		pending = nil
	}
	for _, it := range items {
		switch x := it.(type) {
		case *textPiece:
			pending = append(pending, cutPiece(x, removed)...)
		case *rawNode:
			flush()
			nodes = append(nodes, p.finalizeRaw(x, removed))
		case ast.Node:
			flush()
			nodes = append(nodes, x)
		}
	}
	flush()
	return nodes
}

func (p *templateParser) finalizeRaw(raw *rawNode, removed []byteRange) ast.Node {
	switch n := raw.node.(type) {
	case *ast.If:
		for i, body := range raw.bodies {
			n.Branches[i].Body = p.finalize(*body, removed)
		}
		if raw.orelse != nil {
			n.Else = p.finalize(*raw.orelse, removed)
		}
	case *ast.For:
		n.Body = p.finalize(*raw.bodies[0], removed)
		if raw.orelse != nil {
			n.Empty = p.finalize(*raw.orelse, removed)
		}
	case *ast.IfBlock:
		n.Body = p.finalize(*raw.bodies[0], removed)
		if raw.orelse != nil {
			n.Else = p.finalize(*raw.orelse, removed)
		}
	}
	return raw.node
}

// cutPiece removes the parts of a text piece that fall inside removed ranges.
func cutPiece(piece *textPiece, removed []byteRange) []*textPiece {
	var result []*textPiece
	cursor := piece.start
	push := func(start, end int) {
		if end <= start {
			return
		}
		value := piece.value
		if piece.end-piece.start == len(piece.value) {
			value = piece.value[start-piece.start : end-piece.start]
		}
		result = append(result, &textPiece{start: start, end: end, value: value})
	}
	for _, r := range removed {
		if r.end <= cursor {
			continue
		}
		if r.start >= piece.end {
			break
		}
		push(cursor, min(r.start, piece.end))
		cursor = max(cursor, r.end)
	}
	push(cursor, piece.end)
	return result
}
