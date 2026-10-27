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
from polyspec.template import (
    bind_operations,
    engine,
    loader,
    functions,
    expr_lexer,
    expr_parser,
    format_body,
    format_expression,
    format_indent,
    format_invariant,
    statements,
    escape,
    stringify,
    cli,
    block_tag,
    scanner,
    standalone,
    parser,
)
from polyspec.template import values, number, errors
from polyspec.template.bind import (
    __all__ as binding_exports,
    BindError as NativeBindError,
    BoundMap,
    bind_value as native_bind_value,
    bind_map as native_bind_map,
    bind_data as native_bind_data,
    check_text as native_check_text,
)

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
    def test_the_package_exports_the_shared_prefix_analysis(self):
        # EDT-11: this public operation has the same contract in every SDK.
        self.assertIn("analyze_prefix", template.__all__)
        result = template.analyze_prefix("{? x}", "prefix.tpl")
        self.assertIsInstance(result, template.PrefixAnalysis)
        self.assertEqual(result.error.code, "E_PARSE_UNCLOSED_BLOCK")

    def test_builtin_and_interpreter_implementations_are_not_sdk_exports(self):
        for name in ("BUILTINS", "Evaluator", "Renderer"):
            self.assertNotIn(name, template.__all__)
            self.assertFalse(hasattr(template, name), name)
        internal = (
            expr_lexer,
            expr_parser,
            format_body,
            format_expression,
            format_indent,
            format_invariant,
            statements,
            escape,
            stringify,
            cli,
        )
        for module in internal:
            with self.subTest(module.__name__):
                self.assertEqual(getattr(module, "__all__", None), [])
        self.assertEqual(
            set(functions.__all__), {"Env", "FunctionContext", "HostFunction"}
        )
        for name in functions.__all__:
            self.assertIs(getattr(functions, name), getattr(template, name))

    def test_parser_helpers_are_not_sdk_exports(self):
        # LEX-24 / EDT-10/11 publish Source and analysis, not parser machinery.
        self.assertEqual(getattr(block_tag, "__all__", None), [])
        self.assertEqual(getattr(standalone, "__all__", None), [])
        self.assertEqual(
            set(getattr(scanner, "__all__", [])),
            {"DEFAULT_DELIMITERS", "parse_delimiters"},
        )
        self.assertEqual(
            set(getattr(parser, "__all__", [])),
            {
                "TemplateAnalysis",
                "PrefixAnalysis",
                "parse_template",
                "analyze_template",
                "analyze_template_prefix",
            },
        )
        self.assertIs(template.Source, parser.Source)
        self.assertIs(template.parse_delimiters, scanner.parse_delimiters)
        self.assertEqual(template.parse_delimiters("[]"), ("[", "]"))
        self.assertEqual(template.DEFAULT_DELIMITERS, ("{", "}"))

    def test_value_and_engine_helpers_are_not_sdk_exports(self):
        # RT-74 / VAL-1: stable carriers remain public; numeric machinery is internal.
        modules = {
            "values": values,
            "number": number,
            "errors": errors,
            "engine": engine,
        }
        self.assertIsInstance(binding_exports, list)
        for module in modules.values():
            self.assertIsInstance(getattr(module, "__all__", None), list)
        for name in (
            "type_of",
            "is_number",
            "is_string",
            "text_of",
            "code_points",
            "compare_code_points",
            "combine_surrogate_pairs",
            "is_truthy",
            "parse_numeric_string",
            "loose_equals",
            "strict_equals",
            "compare_values",
        ):
            self.assertNotIn(name, modules["values"].__all__)
        for name in (
            "number_to_string",
            "positional",
            "round_decimal",
            "format_number",
            "round_number",
        ):
            self.assertNotIn(name, modules["number"].__all__)
        for name in (
            "check_number",
            "check_level",
            "depth_within",
            "host_argument",
            "number_to_text",
        ):
            self.assertNotIn(name, binding_exports)
        for name in ("parse_with_lines", "math_floor"):
            self.assertNotIn(name, modules["engine"].__all__)
        self.assertNotIn("RUNTIME_ERRORS", modules["errors"].__all__)
        for name in ("SafeString", "NativeObject"):
            self.assertIs(getattr(template, name), getattr(modules["values"], name))
        for name, native in (
            ("BindError", NativeBindError),
            ("BoundMap", BoundMap),
            ("bind_value", native_bind_value),
            ("bind_map", native_bind_map),
            ("bind_data", native_bind_data),
            ("check_text", native_check_text),
        ):
            self.assertIs(getattr(template, name), native)
        self.assertIs(template.MAX_SAFE, modules["number"].MAX_SAFE)
        self.assertIs(template.TemplateError, modules["errors"].TemplateError)

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

    def test_ast_program_has_only_exported_package_base_types(self):
        for base in AstProgram.__mro__[1:]:
            if base.__module__.startswith(template.__name__):
                self.assertIn(base.__name__, template.__all__)
                self.assertIs(getattr(template, base.__name__), base)

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
