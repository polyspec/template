#!/usr/bin/env python3

"""Export tests of the polyspec.template package (RT-72, RT-74).

The export list names every public function and class that the package module defines, and every name that the
documents import from polyspec.template is exported.
"""

import inspect
import re
import unittest
from pathlib import Path

import polyspec.template as template
from polyspec.template import AstProgram, EngineOptions, MapLoader, Engine
from polyspec.template import bind_operations, engine, loader
from polyspec.template.bind import BoundMap

ROOT = Path(__file__).resolve().parents[3]

DOCUMENTS = [
    "README.md",
    "README.ko.md",
    "docs/operations/guide.md",
    "docs/operations/guide.ko.md",
    "packages/python/README.md",
    "packages/python/README.ko.md",
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

    def test_every_public_class_of_the_engine_and_loader_modules_is_exported(self):
        # The program and loader interfaces live in these modules (RT-1, RT-3); a public class there is API.
        defined = [
            name
            for module in (engine, loader)
            for name, value in vars(module).items()
            if not name.startswith("_")
            and inspect.isclass(value)
            and value.__module__ == module.__name__
        ]
        unexported = sorted(set(defined) - set(template.__all__))
        self.assertEqual(
            unexported,
            [],
            f"public classes of engine.py and loader.py missing from __all__: {unexported}",
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

    def test_the_entry_points_share_one_runtime(self):
        # RT-74: the package entry re-exports the objects of the modules that define them, so a bound map that a module
        # creates is the bound map of the package entry, and a program renders it.
        self.assertIs(template.bind, bind_operations.bind)
        self.assertIs(template.merge, bind_operations.merge)
        self.assertIs(template.BoundMap, BoundMap)
        program = Engine(
            AstProgram(
                EngineOptions(
                    loader=MapLoader({"page.tpl": "{= a}{@ x = list}{= x}{/}"})
                )
            )
        )
        from_module = bind_operations.bind({"a": "x", "list": [1, 2]})
        from_entry = template.bind({"b": 1})
        self.assertIsInstance(from_module, template.BoundMap)
        for assign in (
            from_module,
            template.merge(from_module, from_entry),
            bind_operations.merge(from_entry, from_module),
        ):
            self.assertEqual(program.render("page.tpl", assign), "x12")


if __name__ == "__main__":
    unittest.main()
