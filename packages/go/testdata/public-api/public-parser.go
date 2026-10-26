package consumer

import template "github.com/polyspec/template/packages/go"

// Analyze uses only the public parser and its nameable result types.
func Analyze() (*template.Analysis, error) {
	var tag template.Tag
	var token template.Token
	var _ template.TagKind = tag.Kind
	var _ template.TokenKind = token.Kind
	return template.Analyze([]byte("hello"), "page.tpl", template.ParseOptions{})
}
