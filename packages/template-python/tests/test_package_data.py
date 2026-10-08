#!/usr/bin/env python3

"""Package data tests of the polyspec-template distribution.

The package data keys of pyproject.toml name importable packages, so the py.typed marker of polyspec.template ships
in the wheel under the package it marks.
"""

import tomllib
import unittest

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src"


class PackageDataTest(unittest.TestCase):
    def setUp(self):
        with (ROOT / "pyproject.toml").open("rb") as file:
            self.pyproject = tomllib.load(file)

    def test_package_data_keys_name_importable_packages(self):
        keys = self.pyproject["tool"]["setuptools"]["package-data"]
        for package in keys:
            directory = SOURCE.joinpath(*package.split("."))
            self.assertTrue(
                (directory / "__init__.py").is_file()
                or (directory / "py.typed").is_file(),
                f"pyproject.toml package-data key {package!r} names no package under {SOURCE}; "
                f"write the dotted name of the package, for example polyspec.template",
            )

    def test_py_typed_marker_is_declared_for_polyspec_template(self):
        keys = self.pyproject["tool"]["setuptools"]["package-data"]
        self.assertIn("polyspec.template", keys)
        self.assertEqual(keys["polyspec.template"], ["py.typed"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
