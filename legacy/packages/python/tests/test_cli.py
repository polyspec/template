#!/usr/bin/env python3
"""Tests of the command line of the package (docs/operations/conformance.md): an internal test of the Python
package, which runs the interpreter of the tests and the installed package."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from polyspec.template.cli import _arguments

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def command(*arguments: str, cwd: Path = FIXTURES) -> subprocess.CompletedProcess:
    """Runs the command of docs/operations/conformance.md with the interpreter of the tests, whose
    environment holds the installed package."""
    return subprocess.run(
        [sys.executable, "-m", "polyspec.template.cli", *arguments],
        cwd=cwd,
        capture_output=True,
        text=True,
        env={"PATH": "/usr/bin:/bin"},
    )


class CommandLine(unittest.TestCase):
    """The subcommands of the command line contract, each `<subcommand> [options] FILE`."""

    def test_parse_writes_the_ast_json(self):
        result = command("parse", "greeting.tpl")
        self.assertEqual(result.returncode, 0, result.stderr)
        ast = json.loads(result.stdout)
        self.assertEqual(ast["type"], "Template")
        self.assertEqual(
            [node["type"] for node in ast["body"]], ["Text", "Echo", "Text"]
        )

    def test_render_writes_the_output_and_exit_2_on_template_error(self):
        result = command("render", "--data", "greeting.json", "greeting.tpl")
        self.assertEqual((result.returncode, result.stdout), (0, "Hello, World!"))
        result = command("render", "broken.tpl")
        self.assertEqual(result.returncode, 2)
        error = json.loads(result.stderr)
        self.assertEqual(error["code"], "E_PARSE_UNTERMINATED_TAG")

    def test_tokens_writes_the_tokens_with_utf8_byte_offsets(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "t.tpl").write_text("\ufeffé[= a]", "utf-8")
            result = command(
                "tokens", "--delimiters", "[]", "t.tpl", cwd=Path(directory)
            )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            json.loads(result.stdout),
            [
                [2, 3, "delimiter"],
                [3, 4, "keyword"],
                [5, 6, "variable"],
                [6, 7, "delimiter"],
            ],
        )
        self.assertNotIn(" ", result.stdout)

    def test_tokens_exit_2_with_the_error_json(self):
        result = command("tokens", "broken.tpl")
        self.assertEqual(result.returncode, 2)
        self.assertEqual(json.loads(result.stderr)["code"], "E_PARSE_UNTERMINATED_TAG")

    def test_format_leaves_an_absent_indent_to_the_formatter(self):
        arguments = _arguments().parse_args(["format", "t.tpl"])
        self.assertNotIn("indent", vars(arguments))

    def test_format_writes_the_formatted_text_without_a_newline(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "t.tpl").write_text("<ul>\n<li>{=a}</li>\n</ul>", "utf-8")
            indented = command("format", "t.tpl", cwd=Path(directory))
            tab = command("format", "--indent", "tab", "t.tpl", cwd=Path(directory))
            kept = command("format", "--indent", "none", "t.tpl", cwd=Path(directory))
            four = command("format", "--indent", "4", "t.tpl", cwd=Path(directory))
        self.assertEqual(
            [(r.returncode, r.stdout) for r in (indented, tab, kept, four)],
            [
                (0, "<ul>\n  <li>{= a}</li>\n</ul>"),
                (0, "<ul>\n\t<li>{= a}</li>\n</ul>"),
                (0, "<ul>\n<li>{= a}</li>\n</ul>"),
                (0, "<ul>\n    <li>{= a}</li>\n</ul>"),
            ],
        )

    def test_format_with_delimiters_and_unchanged_text(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "t.tpl").write_text("[= a[0]]", "utf-8")
            changed = command(
                "format", "--delimiters", "[]", "t.tpl", cwd=Path(directory)
            )
            Path(directory, "u.tpl").write_text("{= a}\n", "utf-8")
            unchanged = command("format", "u.tpl", cwd=Path(directory))
        self.assertEqual((changed.returncode, changed.stdout), (0, "[= a[0]]"))
        self.assertEqual((unchanged.returncode, unchanged.stdout), (0, "{= a}\n"))

    def test_format_error_is_the_json_of_fmt_14(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "p.tpl").write_text("{= }", "utf-8")
            Path(directory, "b.tpl").write_bytes(b"a\nb\xff")
            Path(directory, "h.tpl").write_text("<div>\n<p>a</div>", "utf-8")
            parse = command("format", "p.tpl", cwd=Path(directory))
            utf8 = command("format", "b.tpl", cwd=Path(directory))
            html = command("format", "h.tpl", cwd=Path(directory))
        self.assertEqual(parse.returncode, 2)
        error = json.loads(parse.stderr)
        self.assertEqual(
            (error["reason"], error["code"], error["line"], error["col"]),
            ("parse", "E_PARSE_UNEXPECTED_TOKEN", 1, 4),
        )
        self.assertEqual(sorted(error), ["code", "col", "line", "message", "reason"])
        self.assertEqual(utf8.returncode, 2)
        error = json.loads(utf8.stderr)
        self.assertEqual(
            (error["reason"], error["code"], error["line"], error["col"]),
            ("parse", "E_LEX_INVALID_UTF8", 2, 2),
        )
        self.assertEqual(html.returncode, 2)
        error = json.loads(html.stderr)
        self.assertEqual(
            (error["reason"], error["code"], error["line"], error["col"]),
            ("html", None, 2, 5),
        )

    def test_usage_errors_exit_1(self):
        for arguments in (
            [],
            ["parse"],
            ["lint", "greeting.tpl"],
            ["parse", "greeting.tpl", "--root"],
            ["parse", "greeting.tpl", "--data", "greeting.json"],
            ["format", "--indent", "9", "greeting.tpl"],
            ["format", "--indent", "0", "greeting.tpl"],
            ["format", "--root", ".", "greeting.tpl"],
            ["tokens", "--delimiters", "ab", "greeting.tpl"],
            ["format", "missing.tpl"],
            ["render", "--data", "missing.json", "greeting.tpl"],
        ):
            with self.subTest(arguments=arguments):
                result = command(*arguments)
                self.assertEqual((result.returncode, result.stdout), (1, ""))
                self.assertIn("usage: template", result.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
