#!/usr/bin/env python3

"""Package data tests of the polyspec-template distribution.

The package data keys of pyproject.toml name importable packages, so the py.typed marker of polyspec.template and the
AST schema that decode_template reads ship in the wheel under that package (RT-73).
"""

import os
import tempfile
import tomllib
import unittest

from importlib.resources import files
from pathlib import Path

from polyspec.template import AstDecodeError, decode_template

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

    def test_package_data_of_polyspec_template_is_declared(self):
        keys = self.pyproject["tool"]["setuptools"]["package-data"]
        self.assertIn("polyspec.template", keys)
        self.assertEqual(keys["polyspec.template"], ["py.typed", "ast.schema.json"])

    def test_the_schema_is_read_from_the_package_outside_the_repository(self):
        # RT-73: the schema is package data that the interpreter finds by the name of the package, so decode_template
        # reads it from a working directory that holds no file of the repository.
        echo = {"type": "Template", "name": "x.tpl", "body": [], "comments": []}
        self.assertTrue(
            files("polyspec.template").joinpath("ast.schema.json").is_file()
        )
        previous = Path.cwd()
        with tempfile.TemporaryDirectory() as directory:
            os.chdir(directory)
            try:
                self.assertEqual(
                    decode_template(str(echo).replace("'", '"'))["name"], "x.tpl"
                )
                with self.assertRaises(AstDecodeError) as raised:
                    decode_template(
                        '{"type":"Template","name":"x.tpl","body":[],"comments":1}'
                    )
            finally:
                os.chdir(previous)
        self.assertEqual(raised.exception.path, "/comments")


if __name__ == "__main__":
    unittest.main(verbosity=2)
