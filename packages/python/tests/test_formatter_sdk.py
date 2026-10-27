"""FMT-16: formatter options, results and error data are public SDK values."""

import json
import unittest
from pathlib import Path

from polyspec.template import FormatError, FormatOptions, FormatResult, format_template
from polyspec.template import formatter

FIXTURE = json.loads(
    (
        Path(__file__).resolve().parents[3] / "tests/fixtures/formatter-sdk.json"
    ).read_text(encoding="utf-8")
)


class FormatterSDK(unittest.TestCase):
    def test_preserves_shared_formatter_results(self):
        self.assertIs(FormatOptions, formatter.FormatOptions)
        self.assertIs(FormatError, formatter.FormatError)
        self.assertIs(FormatResult, formatter.FormatResult)
        self.assertIs(format_template, formatter.format_template)
        for item in FIXTURE["cases"]:
            with self.subTest(item["id"]):
                raw = item["options"]
                options = FormatOptions(
                    name=raw.get("name", "template.tpl"),
                    delimiters=raw.get("delimiters"),
                    range=(raw["range"]["start"], raw["range"]["end"])
                    if "range" in raw
                    else None,
                    indent=raw.get("indent", "  "),
                    template_blocks=raw.get("templateBlocks", "indent"),
                )
                result = format_template(item["source"], options)
                self.assertIsInstance(result, FormatResult)
                if result.ok:
                    actual = dict(ok=True, text=result.text, changed=result.changed)
                else:
                    error = result.error
                    self.assertIsInstance(error, FormatError)
                    self.assertNotEqual(error.message, "")
                    actual = dict(
                        ok=False,
                        error=dict(
                            reason=error.reason,
                            code=error.code,
                            line=error.line,
                            col=error.col,
                        ),
                    )
                self.assertEqual(actual, item["expected"])

    def test_constructs_shared_error_data(self):
        for data in FIXTURE["errors"]:
            with self.subTest(data["reason"]):
                error = FormatError(**data)
                self.assertEqual(
                    dict(
                        reason=error.reason,
                        code=error.code,
                        line=error.line,
                        col=error.col,
                        message=error.message,
                    ),
                    data,
                )
                result = FormatResult(False, error=error)
                self.assertFalse(result.ok)
                self.assertIsNone(result.text)
                self.assertFalse(result.changed)
                self.assertIs(result.error, error)
