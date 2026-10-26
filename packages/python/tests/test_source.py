"""LEX-24: public source contexts preserve UTF-8 and native-index semantics."""

import json
import unittest
from pathlib import Path

from polyspec.template import Source, TemplateError
from polyspec.template.errors import line_index_of, position_of

FIXTURE = json.loads(
    (
        Path(__file__).resolve().parents[3] / "tests/fixtures/source-context.json"
    ).read_text(encoding="utf-8")
)


class PublicSource(unittest.TestCase):
    def test_preserves_shared_source_contexts(self):
        for item in FIXTURE["valid"]:
            with self.subTest(item["id"]):
                data = bytearray.fromhex(item["rawHex"])
                contexts = [
                    Source(item["name"], data),
                    Source.from_bytes(item["name"], data),
                    Source.from_text(item["name"], item["input"]),
                ]
                data[:] = bytes(len(data))
                for source in contexts:
                    self.assertEqual(
                        (source.name, source.text, source.bytes.hex(), source.lines),
                        (item["name"], item["text"], item["hex"], item["lines"]),
                    )
                    offsets = item["offsets"]["codepoint"]
                    self.assertEqual(source.length, len(offsets) - 1)
                    for start, offset in enumerate(offsets):
                        self.assertEqual(source.byte_at(start), offset)
                        for end in range(start, len(offsets)):
                            self.assertEqual(
                                source.span(start, end), (offset, offsets[end])
                            )
                    self.assertEqual(line_index_of(source.bytes), item["lines"])
                    probe = item["probe"]
                    self.assertEqual(
                        position_of(source.lines, probe["offset"]),
                        (probe["line"], probe["col"]),
                    )
                    error = source.error(
                        "E_PARSE_UNEXPECTED_TOKEN",
                        probe["offset"],
                        probe["end"],
                        "message",
                    )
                    self.assertEqual(
                        error.to_object(),
                        dict(
                            code="E_PARSE_UNEXPECTED_TOKEN",
                            template=item["name"],
                            **probe,
                            message="message",
                        ),
                    )
                    with self.assertRaises(ValueError):
                        source.byte_at(source.length + 1)
                    with self.assertRaises(ValueError):
                        source.span(1, 0)

    def test_rejects_shared_invalid_source_bytes(self):
        for item in FIXTURE["invalid"]:
            with self.subTest(item["id"]):
                with self.assertRaises(TemplateError) as raised:
                    Source.from_bytes("invalid.tpl", bytes.fromhex(item["hex"]))
                error = raised.exception
                self.assertEqual(
                    (error.code, error.offset, error.end, error.line, error.col),
                    (
                        "E_LEX_INVALID_UTF8",
                        item["offset"],
                        item["offset"] + 1,
                        item["line"],
                        item["col"],
                    ),
                )

    def test_rejects_unpaired_text_surrogates(self):
        with self.assertRaises(TemplateError) as raised:
            Source.from_text("invalid.tpl", "a\n\ud800")
        self.assertEqual(
            (raised.exception.code, raised.exception.line, raised.exception.col),
            ("E_LEX_INVALID_UTF8", 2, 1),
        )
