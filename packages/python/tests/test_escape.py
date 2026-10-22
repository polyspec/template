"""The byte length of output text: a text without a UTF-8 form is an error, never a length made up for it."""

import unittest

from polyspec.template.escape import utf8_length


class Utf8Length(unittest.TestCase):
    def test_counts_the_utf8_bytes(self):
        self.assertEqual(utf8_length("a\u00e9\u4e2d\U0001f600"), 1 + 2 + 3 + 4)

    def test_a_lone_surrogate_has_no_length(self):
        with self.assertRaises(UnicodeEncodeError):
            utf8_length("a\ud800b")
