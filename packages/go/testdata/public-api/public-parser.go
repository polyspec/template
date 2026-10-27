package consumer

import (
	template "github.com/polyspec/template/packages/go"
	"github.com/polyspec/template/packages/go/render"
	"github.com/polyspec/template/packages/go/source"
)

// Analyze uses only the public parser and its nameable result types.
func Analyze() (*template.Analysis, error) {
	var tag template.Tag
	var token template.Token
	var _ template.TagKind = tag.Kind
	var _ template.TokenKind = token.Kind
	return template.Analyze([]byte("[= value]"), "page.tpl", template.ParseOptions{Delimiters: "[]"})
}

// The parser adapter names only public source, delimiter and artifact types.
func parserAdapter(input []byte, name string, pair template.Delimiters) (*render.ParsedTemplate, error) {
	var nativePair render.Delimiters = pair
	tree, err := template.Parse(input, name, template.ParseOptions{Delimiters: nativePair.Open + nativePair.Close})
	if err != nil {
		return nil, err
	}
	context, sourceErr := source.FromBytes(name, input)
	if sourceErr != nil {
		return nil, sourceErr
	}
	return &render.ParsedTemplate{AST: tree, Lines: context.Lines}, nil
}

var _ render.ParseFunc = parserAdapter
