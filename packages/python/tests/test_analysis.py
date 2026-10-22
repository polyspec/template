# EDT-9: the tags of the analysis are the accepted tags that the editors paint.
#!/usr/bin/env python3
"""Syntax analysis of accepted tags: the EDT-8 class of every part of a tag,
the body range of each tag and the prefix analysis of a source with an error
. Ranges are code point indexes into the source string."""

import unittest

from polyspec.template import ParseOptions, TemplateError, analyze, _analyze_prefix


def classes(source: str, tokens) -> list[str]:
    return [
        f"{token['kind']} {source[token['start'] : token['end']]}" for token in tokens
    ]


class TokenClasses(unittest.TestCase):
    # FMT-1, GRM-2: every part of every form of a tag body is classified.
    # EDT-8: the parser classifies every part of a tag, so no editor tool reads
    # the tag syntax again.
    def test_classifies_every_part_of_every_tag_kind(self):
        cases = [
            ("{* note *}", ["comment {* note *}"]),
            (
                '{= (user.name ?? null) | upper(1, "x")}',
                [
                    "delimiter {",
                    "keyword =",
                    "operator (",
                    "variable user",
                    "property .name",
                    "operator ??",
                    "keyword null",
                    "operator )",
                    "operator |",
                    "function upper",
                    "operator (",
                    "number 1",
                    "operator ,",
                    'string "x"',
                    "operator )",
                    "delimiter }",
                ],
            ),
            (
                "{@ item = items}{/}",
                [
                    "delimiter {",
                    "keyword @",
                    "variable item",
                    "operator =",
                    "variable items",
                    "delimiter }",
                    "delimiter {",
                    "keyword /",
                    "delimiter }",
                ],
            ),
            (
                "{: count += 1}",
                [
                    "delimiter {",
                    "keyword :",
                    "variable count",
                    "operator +=",
                    "number 1",
                    "delimiter }",
                ],
            ),
            (
                "{: count++}",
                [
                    "delimiter {",
                    "keyword :",
                    "variable count",
                    "operator ++",
                    "delimiter }",
                ],
            ),
            (
                "{? a in b}{:? !c}{:}{/}",
                [
                    "delimiter {",
                    "keyword ?",
                    "variable a",
                    "keyword in",
                    "variable b",
                    "delimiter }",
                    "delimiter {",
                    "keyword :?",
                    "operator !",
                    "variable c",
                    "delimiter }",
                    "delimiter {",
                    "keyword :",
                    "delimiter }",
                    "delimiter {",
                    "keyword /",
                    "delimiter }",
                ],
            ),
            (
                "{?# side}{/}",
                [
                    "delimiter {",
                    "keyword ?#",
                    "variable side",
                    "delimiter }",
                    "delimiter {",
                    "keyword /",
                    "delimiter }",
                ],
            ),
            (
                '{+ parts/head.tpl}{+ "quoted.tpl"}',
                [
                    "delimiter {",
                    "keyword +",
                    "path parts/head.tpl",
                    "delimiter }",
                    "delimiter {",
                    "keyword +",
                    'string "quoted.tpl"',
                    "delimiter }",
                ],
            ),
            (
                "{# card cards/card.tpl title:page.title x}",
                [
                    "delimiter {",
                    "keyword #",
                    "path card",
                    "path cards/card.tpl",
                    "path title:page.title",
                    "path x",
                    "delimiter }",
                ],
            ),
            (
                "{% delimiter []}[= a]",
                [
                    "delimiter {",
                    "keyword %",
                    "keyword delimiter",
                    "string []",
                    "delimiter }",
                    "delimiter [",
                    "keyword =",
                    "variable a",
                    "delimiter ]",
                ],
            ),
            (
                '<a href="{{= url }}">',
                ['delimiter "{{', "keyword =", "variable url", 'delimiter }}"'],
            ),
            (
                "{= x.f(1) | g }",
                [
                    "delimiter {",
                    "keyword =",
                    "variable x",
                    "function .f",
                    "operator (",
                    "number 1",
                    "operator )",
                    "operator |",
                    "function g",
                    "delimiter }",
                ],
            ),
        ]
        for source, expected in cases:
            with self.subTest(source=source):
                self.assertEqual(
                    classes(source, analyze(source, "t.tpl").tokens), expected
                )

    def test_ranges_are_code_point_indexes(self):
        source = "가{= a }"
        tokens = analyze(source, "t.tpl").tokens
        self.assertEqual(
            [(t["start"], t["end"]) for t in tokens], [(1, 2), (2, 3), (4, 5), (6, 7)]
        )

    def test_gives_each_tag_the_range_of_its_body_between_the_delimiters(self):
        source = '<a href="{{= url }}">{* c *}'
        tags = analyze(source, "t.tpl").tags
        self.assertEqual(
            [source[tag["body_start"] : tag["body_end"]] for tag in tags],
            ["= url ", "* c *"],
        )


class PrefixAnalysis(unittest.TestCase):
    @staticmethod
    def kinds(source: str, result) -> list[str]:
        return [
            f"{tag['kind']} {source[tag['start'] : tag['end']]}" for tag in result.tags
        ]

    def test_returns_every_tag_and_token_and_no_error_for_a_source_that_parses(self):
        source = "{? a}{= b.c}{/}"
        result = _analyze_prefix(source, "t.tpl")
        self.assertIsNone(result.error)
        self.assertEqual(result.tags, analyze(source, "t.tpl").tags)
        self.assertEqual(result.tokens, analyze(source, "t.tpl").tokens)

    def test_returns_every_tag_of_a_source_whose_block_is_not_closed(self):
        source = "<ul>{@ x = xs}<li>{= x}</li>"
        result = _analyze_prefix(source, "t.tpl")
        self.assertIsInstance(result.error, TemplateError)
        self.assertEqual(result.error.code, "E_PARSE_UNCLOSED_BLOCK")
        self.assertEqual(self.kinds(source, result), ["for {@ x = xs}", "echo {= x}"])
        self.assertEqual(
            [source[t["start"] : t["end"]] for t in result.tokens],
            ["{", "@", "x", "=", "xs", "}", "{", "=", "x", "}"],
        )

    def test_returns_the_tags_before_a_tag_that_fails_and_only_their_tokens(self):
        source = "{= a}{? b}{= c +}{= d}{/}"
        result = _analyze_prefix(source, "t.tpl")
        self.assertEqual(result.error.code, "E_PARSE_UNEXPECTED_TOKEN")
        self.assertEqual(self.kinds(source, result), ["echo {= a}", "if {? b}"])
        self.assertEqual(
            [source[t["start"] : t["end"]] for t in result.tokens],
            ["{", "=", "a", "}", "{", "?", "b", "}"],
        )

    def test_uses_the_delimiter_option(self):
        source = "[? a]x"
        result = _analyze_prefix(source, "t.tpl", ParseOptions(delimiters="[]"))
        self.assertEqual(self.kinds(source, result), ["if [? a]"])


if __name__ == "__main__":
    unittest.main()
