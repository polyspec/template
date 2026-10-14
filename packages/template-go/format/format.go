// Package format formats template sources: the whitespace inside tags and the indentation of lines, refusing a result
// whose AST differs from the source AST (docs/operations/editor-tools.md). It is the Go port of the formatter of
// @polyspec/template-language and gives byte-identical results.
package format

import (
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/polyspec/template/packages/template-go/ast"
	"github.com/polyspec/template/packages/template-go/errs"
	"github.com/polyspec/template/packages/template-go/lexer"
	"github.com/polyspec/template/packages/template-go/parser"
	"github.com/polyspec/template/packages/template-go/render"
)

// Range is a byte range [Start, End) of the source.
type Range struct {
	Start int
	End   int
}

// Options configure Format. The zero value formats with an indent unit of two spaces.
type Options struct {
	// Name is the template name used in errors. The default is `template.tpl`.
	Name string
	// Delimiters is the engine delimiter option as two characters (LEX-22). The default is `{}`.
	Delimiters string
	// Range, when set, limits formatting to the tags that lie completely inside it and the lines that start inside it.
	Range *Range
	// Indent is the indent unit: a run of spaces or one tab. The default is two spaces.
	Indent string
	// KeepIndentation keeps the indentation of every line and formats only the tags.
	KeepIndentation bool
	// TemplateBlocks is "indent" (the default), where template blocks add an indentation level like HTML elements, or
	// "flat", where they add none.
	TemplateBlocks string
}

// Reason tells why Format returned no text.
type Reason string

const (
	// ReasonParse means the source does not parse.
	ReasonParse Reason = "parse"
	// ReasonInvariant means the formatted text does not parse to the same AST.
	ReasonInvariant Reason = "invariant"
	// ReasonHTML means the HTML structure is not balanced, so the lines cannot be indented.
	ReasonHTML Reason = "html"
)

// Error is the reason why the source is kept.
type Error struct {
	Reason Reason
	// Code is the error code of the parser, or "" for an AST difference or an HTML structure error.
	Code errs.Code
	// Line is the 1-based line of the error position.
	Line int
	// Col is the 1-based byte column of the error position, as in parser errors (ERR-1).
	Col     int
	Message string
}

// Error implements the error interface.
func (e *Error) Error() string {
	return fmt.Sprintf("%s error at %d:%d: %s", e.Reason, e.Line, e.Col, e.Message)
}

// Result is the formatted text and whether it differs from the source.
type Result struct {
	Text    string
	Changed bool
}

type edit struct {
	start, end int
	text       string
}

const bom = "\ufeff"

var indentUnit = regexp.MustCompile(`^(?: +|\t)$`)

// Format formats the whitespace inside the tags of a template and the indentation of its lines. Other text outside
// tags, comments and directives are never changed. The source and the result are parsed, and the result is returned
// only when both ASTs are equal without their `span` fields and, when lines are indented, without the spaces and tabs
// at the start of lines of text. A source that cannot be formatted returns an *Error; invalid options return another
// error.
func Format(source string, options Options) (Result, error) {
	indent := options.Indent
	if indent == "" {
		indent = "  "
	}
	if !indentUnit.MatchString(indent) {
		return Result{}, errors.New("indent must be a run of spaces or one tab")
	}
	templateBlocks := options.TemplateBlocks
	if templateBlocks == "" {
		templateBlocks = "indent"
	}
	if templateBlocks != "indent" && templateBlocks != "flat" {
		return Result{}, fmt.Errorf("templateBlocks must be indent or flat, not %q", templateBlocks)
	}
	delimiters := parser.DefaultDelimiters
	if options.Delimiters != "" {
		d, ok := parser.ParseDelimiters(options.Delimiters)
		if !ok {
			return Result{}, fmt.Errorf("%q is not a delimiter pair", options.Delimiters)
		}
		delimiters = d
	}
	name := options.Name
	if name == "" {
		name = "template.tpl"
	}
	prefix := ""
	if strings.HasPrefix(source, bom) {
		prefix = bom
	}
	text := source[len(prefix):]
	analysis, err := analyze(text, name, delimiters)
	if err != nil {
		return Result{}, parseError(err)
	}

	var limits *Range
	if options.Range != nil {
		limits = &Range{Start: options.Range.Start - len(prefix), End: options.Range.End - len(prefix)}
	}
	var edits []edit
	for _, tag := range analysis.Tags {
		if tag.Kind == parser.TagDirective {
			continue
		}
		if limits != nil && (tag.Start < limits.Start || tag.End > limits.End) {
			continue
		}
		var tokens []parser.Token
		for _, token := range analysis.Tokens {
			if token.Start >= tag.BodyStart && token.End <= tag.BodyEnd {
				tokens = append(tokens, token)
			}
		}
		body, ok := formatBody(bodyInput{kind: tag.Kind, source: text, bodyStart: tag.BodyStart, bodyEnd: tag.BodyEnd, tokens: tokens})
		if !ok || body == text[tag.BodyStart:tag.BodyEnd] {
			continue
		}
		edits = append(edits, edit{start: tag.BodyStart, end: tag.BodyEnd, text: body})
	}
	if !options.KeepIndentation {
		indentation, failure := indentEdits(text, analysis.Tags, indentOptions{unit: indent, templateBlocks: templateBlocks, limits: limits})
		if failure != nil {
			line, col := errs.NewLineIndex([]byte(text)).Position(failure.index)
			return Result{}, &Error{Reason: ReasonHTML, Line: line, Col: col, Message: failure.message}
		}
		edits = append(edits, indentation...)
		sort.SliceStable(edits, func(i, j int) bool { return edits[i].start < edits[j].start })
	}
	if len(edits) == 0 {
		return Result{Text: source}, nil
	}

	formatted := apply(text, edits)
	after, err := analyze(formatted, name, delimiters)
	if err != nil {
		line, col := errs.NewLineIndex([]byte(text)).Position(edits[0].start)
		return Result{}, &Error{Reason: ReasonInvariant, Line: line, Col: col, Message: "formatted text does not parse: " + err.Error()}
	}
	before, err := treeValue(analysis.AST)
	if err != nil {
		return Result{}, err
	}
	result, err := treeValue(after.AST)
	if err != nil {
		return Result{}, err
	}
	if !options.KeepIndentation {
		before, result = withoutLineIndentation(before), withoutLineIndentation(result)
	}
	if !sameTree(before, result) {
		line, col := errs.NewLineIndex([]byte(text)).Position(edits[0].start)
		return Result{}, &Error{Reason: ReasonInvariant, Line: line, Col: col, Message: "formatted text parses to a different AST"}
	}
	return Result{Text: prefix + formatted, Changed: true}, nil
}

// analyze parses a text whose byte order mark is already removed. A panic is E_INTERNAL (ERR-13).
func analyze(text, name string, delimiters parser.Delimiters) (*parser.Analysis, error) {
	return render.Guard(name, func() (*parser.Analysis, error) {
		source, err := lexer.FromBytes(name, []byte(text))
		if err != nil {
			return nil, err
		}
		return parser.Analyze(source, delimiters)
	})
}

func apply(text string, edits []edit) string {
	var output strings.Builder
	cursor := 0
	for _, e := range edits {
		output.WriteString(text[cursor:e.start])
		output.WriteString(e.text)
		cursor = e.end
	}
	output.WriteString(text[cursor:])
	return output.String()
}

func parseError(err error) *Error {
	var te *errs.Error
	if errors.As(err, &te) {
		return &Error{Reason: ReasonParse, Code: te.Code, Line: te.Line, Col: te.Col, Message: te.Message}
	}
	return &Error{Reason: ReasonParse, Message: err.Error()}
}

// lineStartBefore is the start of the line that contains the byte at index, as JavaScript's
// `text.lastIndexOf('\n', index - 1) + 1` gives it: a negative position searches from the start.
func lineStartBefore(text string, index int) int {
	from := max(index-1, 0)
	return strings.LastIndex(text[:min(from+1, len(text))], "\n") + 1
}

// treeValue is the JSON value of an AST, whose objects compare without key order.
func treeValue(tree *ast.Template) (any, error) {
	return jsonValue(tree)
}
