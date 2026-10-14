#!/usr/bin/env python3
"""The formatter: token spacing of the formatting style, tag bodies, the
indentation of lines by HTML elements and template blocks, error results and
idempotence. The expected texts are those of the TypeScript reference
(packages/language)."""

import unittest
from pathlib import Path

from polyspec.template import FormatOptions, FormatResult, format_template
from polyspec.template.format_expression import join_tokens
from polyspec.template.format_invariant import same_tree

LANGUAGE_FIXTURES = (
    Path(__file__).resolve().parents[3]
    / "packages"
    / "language"
    / "tests"
    / "fixtures"
)


def lines(*items: str) -> str:
    return "\n".join(items)


class Case(unittest.TestCase):
    def text(self, result: FormatResult) -> str:
        self.assertTrue(result.ok, f"format failed: {result.error}")
        return result.text

    def formatted(self, source: str, options: "FormatOptions | None" = None) -> str:
        once = self.text(format_template(source, options))
        self.assertEqual(
            format_template(once, options),
            FormatResult(ok=True, text=once, changed=False),
        )
        return once


class JoinTokens(Case):
    def test_joins_tokens_with_the_separators_of_the_style(self):
        cases = [
            ([("a", "variable"), ("+", "operator"), ("b", "variable")], "a + b"),
            (
                [
                    ("-", "operator"),
                    ("a", "variable"),
                    ("-", "operator"),
                    ("-", "operator"),
                    ("1", "number"),
                ],
                "-a - -1",
            ),
            (
                [
                    ("!", "operator"),
                    ("done", "variable"),
                    ("&&", "operator"),
                    ("(", "operator"),
                    ("x", "variable"),
                    ("||", "operator"),
                    ("y", "variable"),
                    (")", "operator"),
                ],
                "!done && (x || y)",
            ),
            (
                [
                    ("f", "function"),
                    ("(", "operator"),
                    ("x", "variable"),
                    (",", "operator"),
                    ("g", "function"),
                    ("(", "operator"),
                    ("y", "variable"),
                    (")", "operator"),
                    (")", "operator"),
                ],
                "f(x, g(y))",
            ),
            (
                [
                    ("obj", "variable"),
                    (".method", "function"),
                    ("(", "operator"),
                    ("1", "number"),
                    (")", "operator"),
                ],
                "obj.method(1)",
            ),
            (
                [
                    ("Order", "variable"),
                    ("::", "operator"),
                    ("total", "function"),
                    ("(", "operator"),
                    ("x", "variable"),
                    (")", "operator"),
                ],
                "Order::total(x)",
            ),
            (
                [
                    ("c", "variable"),
                    ("?", "operator"),
                    ("Order", "variable"),
                    ("::", "operator"),
                    ("total", "function"),
                    ("(", "operator"),
                    ("x", "variable"),
                    (")", "operator"),
                    (":", "operator"),
                    ("b", "variable"),
                ],
                "c ? Order::total(x) : b",
            ),
            (
                [
                    ("c", "variable"),
                    ("?", "operator"),
                    ("a", "variable"),
                    (":", "operator"),
                    ("b", "variable"),
                ],
                "c ? a : b",
            ),
            (
                [
                    ("c", "variable"),
                    ("?", "operator"),
                    ("d", "variable"),
                    ("?", "operator"),
                    ("e", "variable"),
                    (":", "operator"),
                    ("a", "variable"),
                    (":", "operator"),
                    ("b", "variable"),
                ],
                "c ? d ? e : a : b",
            ),
            ([("a", "variable"), ("?:", "operator"), ("b", "variable")], "a ?: b"),
            ([("x", "variable"), ("??", "operator")], "x ??"),
            (
                [
                    ("f", "function"),
                    ("(", "operator"),
                    ("x", "variable"),
                    ("??", "operator"),
                    (")", "operator"),
                ],
                "f(x ??)",
            ),
            (
                [
                    ("x", "variable"),
                    ("|", "operator"),
                    ("slice", "function"),
                    ("(", "operator"),
                    ("0", "number"),
                    (",", "operator"),
                    ("10", "number"),
                    (")", "operator"),
                ],
                "x | slice(0, 10)",
            ),
            (
                [
                    ("[", "operator"),
                    ("1", "number"),
                    (",", "operator"),
                    ("...", "operator"),
                    ("rest", "variable"),
                    (",", "operator"),
                    ("]", "operator"),
                ],
                "[1, ...rest,]",
            ),
            (
                [
                    ("[", "operator"),
                    ("'a'", "string"),
                    ("=>", "operator"),
                    ("1", "number"),
                    ("]", "operator"),
                ],
                "['a' => 1]",
            ),
            (
                [
                    ("list", "variable"),
                    ("[", "operator"),
                    ("i", "variable"),
                    ("]", "operator"),
                    (".name", "property"),
                ],
                "list[i].name",
            ),
            ([("a", "variable"), (".0", "property"), (".b", "property")], "a.0.b"),
            (
                [
                    ("x", "variable"),
                    ("in", "keyword"),
                    ("[", "operator"),
                    ("1", "number"),
                    ("]", "operator"),
                ],
                "x in [1]",
            ),
            (
                [
                    ("x", "variable"),
                    ("in", "keyword"),
                    ("(", "operator"),
                    ("y", "variable"),
                    (")", "operator"),
                ],
                "x in (y)",
            ),
            (
                [
                    ("row", "variable"),
                    (".index_", "property"),
                    ("+", "operator"),
                    ("1", "number"),
                ],
                "row.index_ + 1",
            ),
            (
                [
                    ("(", "operator"),
                    ("-", "operator"),
                    ("1", "number"),
                    (")", "operator"),
                    ("*", "operator"),
                    ("2", "number"),
                ],
                "(-1) * 2",
            ),
        ]
        for tokens, expected in cases:
            with self.subTest(expected=expected):
                self.assertEqual(join_tokens(tokens), expected)


class Fixtures(Case):
    # The input and expected fixtures of the TypeScript formatter.
    def test_formats_every_fixture_of_the_reference_and_is_idempotent(self):
        names = sorted(
            path.name for path in (LANGUAGE_FIXTURES / "input").glob("*.tpl")
        )
        self.assertTrue(names)
        for name in names:
            with self.subTest(name=name):
                source = (
                    (LANGUAGE_FIXTURES / "input" / name).read_bytes().decode("utf-8")
                )
                expected = (
                    (LANGUAGE_FIXTURES / "expected" / name).read_bytes().decode("utf-8")
                )
                self.assertEqual(
                    self.formatted(source, FormatOptions(name=name)), expected
                )


class Format(Case):
    def test_formats_the_body_of_every_tag_kind(self):
        source = (
            "{=a+b}{?  x}{:?y}{:  }{/  }{@ i=xs}{/}{:n+=1}{:n ++ }"
            "{?#  side }{/}{+   a.tpl }{#  b   c.tpl   d:e.f }"
        )
        self.assertEqual(
            self.formatted(source, FormatOptions(indent=None)),
            "{= a + b}{? x}{:? y}{:}{/}{@ i = xs}{/}{:n += 1}{:n++}"
            "{?# side}{/}{+ a.tpl}{# b c.tpl d:e.f}",
        )

    def test_reports_an_unchanged_source(self):
        self.assertEqual(
            format_template("<p>{= a}</p>"),
            FormatResult(ok=True, text="<p>{= a}</p>", changed=False),
        )
        self.assertTrue(format_template("<p>{=a}</p>").changed)

    def test_keeps_a_byte_order_mark_and_crlf_line_terminators(self):
        source = "﻿<ul>\r\n{@ x=xs}\r\n<li>{=x}</li>\r\n{/}\r\n</ul>\r\n"
        self.assertEqual(
            self.text(format_template(source)),
            "﻿<ul>\r\n  {@ x = xs}\r\n    <li>{= x}</li>\r\n  {/}\r\n</ul>\r\n",
        )

    def test_formats_only_the_tags_inside_a_range(self):
        self.assertEqual(
            self.text(format_template("{=a}{=b}{=c}", FormatOptions(range=(4, 8)))),
            "{=a}{= b}{=c}",
        )

    def test_ranges_are_code_point_indexes(self):
        self.assertEqual(
            self.text(format_template("가{=a}{=b}", FormatOptions(range=(5, 9)))),
            "가{=a}{= b}",
        )

    def test_formats_with_the_delimiter_option(self):
        self.assertEqual(
            self.text(
                format_template(
                    "[= a[0]+1]\n[= [1,2][1]]", FormatOptions(delimiters="[]")
                )
            ),
            "[= a[0] + 1]\n[= [1, 2][1]]",
        )

    def test_formats_a_wrapped_tag_with_same_character_delimiters(self):
        self.assertEqual(
            self.text(
                format_template(
                    'var page = ";;=json(page)|raw;;";', FormatOptions(delimiters=";;")
                )
            ),
            'var page = ";;= json(page) | raw;;";',
        )

    def test_returns_the_parser_error_position_for_a_source_that_does_not_parse(self):
        result = format_template("<p>\n  {? a}\n</p>", FormatOptions(name="x.tpl"))
        self.assertFalse(result.ok)
        self.assertEqual(
            (
                result.error.reason,
                result.error.code,
                result.error.line,
                result.error.col,
            ),
            ("parse", "E_PARSE_UNCLOSED_BLOCK", 2, 3),
        )
        self.assertIsInstance(result.error.message, str)

    def test_never_changes_a_comment_or_a_directive(self):
        self.assertEqual(
            format_template("{*   a   *}{**}"),
            FormatResult(ok=True, text="{*   a   *}{**}", changed=False),
        )
        self.assertEqual(
            self.text(format_template("{%  delimiter  []}[=a]")),
            "{%  delimiter  []}[= a]",
        )

    def test_keeps_a_tag_whose_body_spans_lines(self):
        source = "{= a +\n b}"
        self.assertEqual(
            format_template(source, FormatOptions(indent=None)),
            FormatResult(ok=True, text=source, changed=False),
        )


class SameTree(unittest.TestCase):
    def test_ignores_spans_and_key_order(self):
        self.assertTrue(
            same_tree(
                {"type": "Var", "name": "a", "span": [0, 1]},
                {"span": [4, 5], "name": "a", "type": "Var"},
            )
        )

    def test_detects_a_different_value(self):
        self.assertFalse(
            same_tree(
                {"type": "Text", "value": "a ", "span": [0, 2]},
                {"type": "Text", "value": "a", "span": [0, 1]},
            )
        )

    def test_detects_a_different_list_length(self):
        self.assertFalse(same_tree({"body": [1, 2]}, {"body": [1]}))


BOARD = lines(
    '<div class="board-list">',
    '<h2>{= t["list.heading"]}</h2>',
    "{? length(p.props.posts) == 0}",
    '<p>{= t["list.empty"]}</p>',
    "{:}",
    "<ul>",
    "{@ post = p.props.posts}",
    '<li><a href="{= post.href}">{= post.title}</a></li>',
    "{/}",
    "</ul>",
    "{/}",
    "</div>",
    "",
)


class Indentation(Case):
    def test_indents_html_elements_and_template_blocks_by_two_spaces(self):
        self.assertEqual(
            self.formatted(BOARD),
            lines(
                '<div class="board-list">',
                '  <h2>{= t["list.heading"]}</h2>',
                "  {? length(p.props.posts) == 0}",
                '    <p>{= t["list.empty"]}</p>',
                "  {:}",
                "    <ul>",
                "      {@ post = p.props.posts}",
                '        <li><a href="{= post.href}">{= post.title}</a></li>',
                "      {/}",
                "    </ul>",
                "  {/}",
                "</div>",
                "",
            ),
        )

    def test_gives_template_blocks_no_level_with_template_blocks_flat(self):
        self.assertEqual(
            self.formatted(BOARD, FormatOptions(template_blocks="flat")),
            lines(
                '<div class="board-list">',
                '  <h2>{= t["list.heading"]}</h2>',
                "  {? length(p.props.posts) == 0}",
                '  <p>{= t["list.empty"]}</p>',
                "  {:}",
                "  <ul>",
                "    {@ post = p.props.posts}",
                '    <li><a href="{= post.href}">{= post.title}</a></li>',
                "    {/}",
                "  </ul>",
                "  {/}",
                "</div>",
                "",
            ),
        )

    def test_uses_the_indent_unit_and_replaces_existing_indentation(self):
        source = lines("<ul>", "        <li>a</li>", "\t<li>b</li>", "</ul>")
        self.assertEqual(
            self.formatted(source, FormatOptions(indent="\t")),
            lines("<ul>", "\t<li>a</li>", "\t<li>b</li>", "</ul>"),
        )
        self.assertEqual(
            self.formatted(source, FormatOptions(indent="    ")),
            lines("<ul>", "    <li>a</li>", "    <li>b</li>", "</ul>"),
        )

    def test_keeps_every_line_with_indent_none_and_formats_only_the_tags(self):
        self.assertEqual(
            self.formatted(
                "<ul>\n        <li>{=a}</li>\n</ul>", FormatOptions(indent=None)
            ),
            "<ul>\n        <li>{= a}</li>\n</ul>",
        )

    def test_rejects_an_indent_unit_that_is_not_spaces_or_one_tab(self):
        for indent in (" \t", "", "\t\t"):
            with self.subTest(indent=indent):
                with self.assertRaisesRegex(ValueError, "indent"):
                    format_template("<p></p>", FormatOptions(indent=indent))

    def test_rejects_an_unknown_template_blocks_value(self):
        with self.assertRaisesRegex(ValueError, "template_blocks"):
            format_template("<p></p>", FormatOptions(template_blocks="deep"))

    def test_empties_blank_lines_and_keeps_the_text_after_the_indentation(self):
        self.assertEqual(
            self.formatted("<div>\n   \n  a   b  \n</div>"),
            "<div>\n\n  a   b  \n</div>",
        )

    def test_keeps_the_indentation_inside_raw_elements_and_comments(self):
        source = lines(
            "<div>",
            "<pre>",
            "    code {= x}",
            "</pre>",
            "<textarea>",
            "   <b>text</b>",
            "   </textarea>",
            "<script>",
            '  if (a < b) { f("</div>"); }',
            "    </script>",
            "<style>",
            "      p { color: red; }",
            "</style>",
            "<!--",
            "        <div>",
            "-->",
            "<p>a</p>",
            "</div>",
        )
        self.assertEqual(
            self.formatted(source),
            lines(
                "<div>",
                "  <pre>",
                "    code {= x}",
                "</pre>",
                "  <textarea>",
                "   <b>text</b>",
                "   </textarea>",
                "  <script>",
                '  if (a < b) { f("</div>"); }',
                "    </script>",
                "  <style>",
                "      p { color: red; }",
                "</style>",
                "  <!--",
                "        <div>",
                "-->",
                "  <p>a</p>",
                "</div>",
            ),
        )

    def test_indents_the_lines_of_a_multi_line_start_tag_one_level_more(self):
        source = lines(
            "<div>",
            "<input",
            'type="text"',
            '      name="q">',
            '<p title="first',
            '      second">x</p>',
            "</div>",
        )
        self.assertEqual(
            self.formatted(source),
            lines(
                "<div>",
                "  <input",
                '    type="text"',
                '    name="q">',
                '  <p title="first',
                '      second">x</p>',
                "</div>",
            ),
        )

    def test_keeps_the_continuation_lines_of_a_tag_that_spans_lines(self):
        source = lines("<div>", "{= a +", "      b}", "</div>")
        self.assertEqual(
            self.formatted(source), lines("<div>", "  {= a +", "      b}", "</div>")
        )

    def test_opens_no_element_for_void_self_closing_doctype_and_instructions(self):
        source = lines(
            "<!DOCTYPE html>",
            "<div>",
            "<br>",
            '<img src="a.png" />',
            '<svg><path d="M0"/></svg>',
            "<p>x</p>",
            "</div>",
        )
        self.assertEqual(
            self.formatted(source),
            lines(
                "<!DOCTYPE html>",
                "<div>",
                "  <br>",
                '  <img src="a.png" />',
                '  <svg><path d="M0"/></svg>',
                "  <p>x</p>",
                "</div>",
            ),
        )

    def test_indents_each_branch_from_the_start_of_the_block(self):
        source = lines(
            "<main>",
            "{? a}",
            '<div class="x">',
            "{:}",
            '<div class="y">',
            "{/}",
            "<p>{= b}</p>",
            "</div>",
            "</main>",
        )
        self.assertEqual(
            self.formatted(source),
            lines(
                "<main>",
                "  {? a}",
                '    <div class="x">',
                "  {:}",
                '    <div class="y">',
                "  {/}",
                "    <p>{= b}</p>",
                "  </div>",
                "</main>",
            ),
        )

    def test_reads_template_tags_inside_a_start_tag_and_end_tags_in_any_case(self):
        source = lines('<DIV {? a}class="x"{/}>', "<span>{= b}</span>", "</div>")
        self.assertEqual(
            self.formatted(source),
            lines('<DIV {? a}class="x"{/}>', "  <span>{= b}</span>", "</div>"),
        )

    def test_indents_with_custom_delimiters_and_keeps_a_bom_and_crlf(self):
        self.assertEqual(
            self.formatted(
                "﻿<ul>\r\n[@ x = xs]\r\n<li>[= x]</li>\r\n[/]\r\n</ul>\r\n",
                FormatOptions(delimiters="[]"),
            ),
            "﻿<ul>\r\n  [@ x = xs]\r\n    <li>[= x]</li>\r\n  [/]\r\n</ul>\r\n",
        )

    def test_indents_only_the_lines_that_start_inside_the_range(self):
        source = lines("<ul>", "<li>a</li>", "<li>{=b}</li>", "</ul>")
        start = source.index("<li>{=b}")
        self.assertEqual(
            self.text(
                format_template(source, FormatOptions(range=(start, len(source))))
            ),
            lines("<ul>", "<li>a</li>", "  <li>{= b}</li>", "</ul>"),
        )


class HtmlError(Case):
    def html_error(self, source: str) -> tuple[int, int]:
        result = format_template(source)
        self.assertFalse(result.ok)
        self.assertEqual(result.error.reason, "html")
        self.assertIsNone(result.error.code)
        return (result.error.line, result.error.col)

    def test_reports_an_end_tag_that_does_not_match_the_open_element(self):
        self.assertEqual(self.html_error("<div>\n<p>a</div>"), (2, 5))

    def test_reports_an_element_that_is_not_closed(self):
        self.assertEqual(self.html_error("<ul>\n<li>a\n</ul>"), (3, 1))
        self.assertEqual(self.html_error("<div>\n<p>a</p>"), (1, 1))

    def test_reports_branches_that_end_with_different_elements(self):
        self.assertEqual(
            self.html_error('{? a}<div class="x">{:}<p>{/}\n</div>'), (1, 27)
        )
        self.assertEqual(self.html_error("{? a}<div>{/}\n</div>"), (1, 11))
        self.assertEqual(self.html_error("{? a}<div>{:? b}<div>{/}\n</div>"), (1, 22))

    def test_counts_the_column_in_utf8_bytes(self):
        self.assertEqual(self.html_error("<div>\n가<p>a</div>"), (2, 8))

    def test_indent_none_formats_the_same_source(self):
        self.assertEqual(
            self.text(
                format_template("<div>\n<p>{=a}</div>", FormatOptions(indent=None))
            ),
            "<div>\n<p>{= a}</div>",
        )


if __name__ == "__main__":
    unittest.main()
