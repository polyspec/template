"""EDT-11: prefix analysis preserves accepted ranges and parser errors."""

import json
import unittest
from pathlib import Path

from polyspec.template import ParseOptions, Source, TemplateError, analyze_prefix

FIXTURE = json.loads(
    (
        Path(__file__).resolve().parents[3] / "tests/fixtures/prefix-analysis.json"
    ).read_text(encoding="utf-8")
)


class SharedPrefixAnalysis(unittest.TestCase):
    def test_preserves_shared_prefixes(self):
        for item in FIXTURE["cases"]:
            with self.subTest(item["id"]):
                source = Source.from_text(item["name"], item["source"])
                options = ParseOptions(delimiters=item.get("delimiters"))
                result = analyze_prefix(item["source"], item["name"], options)
                tags = [
                    dict(
                        kind=t["kind"],
                        echo=t["echo"],
                        start=source.byte_at(t["start"]),
                        end=source.byte_at(t["end"]),
                        bodyStart=source.byte_at(t["body_start"]),
                        bodyEnd=source.byte_at(t["body_end"]),
                    )
                    for t in result.tags
                ]
                tokens = [
                    dict(
                        kind=t["kind"],
                        start=source.byte_at(t["start"]),
                        end=source.byte_at(t["end"]),
                    )
                    for t in result.tokens
                ]
                error = result.error.to_object() if result.error else None
                if error is not None:
                    self.assertNotEqual(error.pop("message"), "")
                self.assertEqual(
                    dict(
                        ast=json.loads(json.dumps(result.ast)),
                        tags=tags,
                        tokens=tokens,
                        error=error,
                    ),
                    item["expected"],
                )

    def test_rejects_invalid_source_and_options(self):
        with self.assertRaises(TemplateError) as caught:
            analyze_prefix(b"\xff", "invalid.tpl")
        self.assertEqual(caught.exception.code, "E_LEX_INVALID_UTF8")
        with self.assertRaises(ValueError):
            analyze_prefix("x", "invalid.tpl", ParseOptions(delimiters="["))
