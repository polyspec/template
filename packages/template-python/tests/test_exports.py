#!/usr/bin/env python3

"""Export tests of the polyspec.template package.

The export list names every public function and class that the package module defines, and every name that the
documents import from polyspec.template is exported.
"""

import inspect

import re

import sys

import unittest

from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import polyspec.template as template  # noqa: E402

DOCUMENTS = [
    "README.md",
    "README.ko.md",
    "docs/guide.md",
    "docs/guide.ko.md",
    "packages/template-python/README.md",
    "packages/template-python/README.ko.md",
]

IMPORT = re.compile(r"^from polyspec\.template import (.+)$", re.MULTILINE)


def documented_names() -> set:
    names = set()
    for document in DOCUMENTS:
        for match in IMPORT.finditer((ROOT / document).read_text(encoding="utf-8")):
            names.update(name.strip() for name in match.group(1).split(","))
    return names


class ExportTests(unittest.TestCase):
    def test_export_list_has_no_repeated_name(self):
        repeated = sorted(
            {name for name in template.__all__ if template.__all__.count(name) > 1}
        )
        self.assertEqual(repeated, [], f"__all__ repeats {repeated}")

    def test_every_exported_name_resolves(self):
        missing = [name for name in template.__all__ if not hasattr(template, name)]
        self.assertEqual(
            missing, [], f"__all__ names attributes that the package lacks: {missing}"
        )

    def test_every_public_function_and_class_is_exported(self):
        defined = [
            name
            for name, value in vars(template).items()
            if not name.startswith("_")
            and (inspect.isfunction(value) or inspect.isclass(value))
            and value.__module__ == template.__name__
        ]
        unexported = sorted(set(defined) - set(template.__all__))
        self.assertEqual(
            unexported, [], f"public names missing from __all__: {unexported}"
        )

    def test_every_name_the_documents_import_is_exported(self):
        names = documented_names()
        self.assertTrue(
            names,
            "no document imports from polyspec.template; the check verified nothing",
        )
        unexported = sorted(names - set(template.__all__))
        self.assertEqual(
            unexported, [], f"documents import names missing from __all__: {unexported}"
        )


if __name__ == "__main__":
    unittest.main()
