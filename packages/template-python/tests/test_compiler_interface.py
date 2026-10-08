#!/usr/bin/env python3
"""Compares the public runtime declarations of the package with the Python mapping of
the compiler manifest (packages/template-compiler/interface.json): Program, Engine,
AstProgram, RuntimeBindings, RuntimeServices, RuntimeEnvironment, Frame, Scope and the
bound map (VAL-22)."""

import importlib
import inspect
import json
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import polyspec.template as template
from polyspec.template.engine import Program

MANIFEST_PATH = Path(
    os.environ.get("TEMPLATE_INTERFACE_MANIFEST")
    or (
        Path(__file__).resolve().parents[3]
        / "packages"
        / "template-compiler"
        / "interface.json"
    )
)
MANIFEST = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
MAPPING = MANIFEST["languages"]["python"]
CONTRACT = MANIFEST["runtimeContract"]
BINDING_NAMES = MAPPING.get("runtimeBindingOperationNames", {})


def public_methods(cls):
    """The public methods that the class itself defines, in definition order."""
    return [
        name
        for name, member in vars(cls).items()
        if not name.startswith("_") and inspect.isfunction(member)
    ]


def parameter_count(cls, name):
    """The parameters of a method without self."""
    return len(inspect.signature(getattr(cls, name)).parameters) - 1


def instance_attributes(instance):
    return (
        list(vars(instance))
        if hasattr(instance, "__dict__")
        else list(type(instance).__slots__)
    )


class CompilerInterface(unittest.TestCase):
    def test_the_mapping_names_the_python_declarations(self):
        self.assertEqual(MAPPING["program"], ["AstProgram", "GeneratedProgram"])
        self.assertIs(getattr(template, MAPPING["error"]), template.TemplateError)
        self.assertTrue(inspect.isclass(getattr(template, MAPPING["runtimeServices"])))
        self.assertTrue(inspect.isclass(getattr(template, MAPPING["boundMap"]["type"])))

    def test_program_and_engine(self):
        operations = CONTRACT["Program"]["operations"]
        self.assertEqual(public_methods(Program), [item["name"] for item in operations])
        for item in operations:
            self.assertEqual(
                parameter_count(Program, item["name"]), len(item["parameters"])
            )
        engine = template.Engine(template.AstProgram())
        self.assertEqual(instance_attributes(engine), CONTRACT["Engine"]["owns"])
        self.assertEqual(
            public_methods(template.Engine), CONTRACT["Engine"]["operations"]
        )
        self.assertTrue(issubclass(template.AstProgram, Program))
        self.assertIn("runtime", instance_attributes(template.AstProgram()))
        self.assertEqual(CONTRACT["AstProgram"]["owns"], ["runtime"])

    def test_runtime_bindings(self):
        operations = CONTRACT["RuntimeBindings"]["operations"]
        names = [BINDING_NAMES.get(item["name"], item["name"]) for item in operations]
        self.assertEqual(public_methods(template.RuntimeBindings), names)
        for item, name in zip(operations, names):
            self.assertEqual(
                parameter_count(template.RuntimeBindings, name),
                len(item["parameters"]),
                name,
            )

    def test_runtime_services_and_environment(self):
        service_names = MAPPING["runtimeServiceOperationNames"]
        services = [
            service_names[item["name"]]
            for item in CONTRACT["RuntimeServices"]["operations"]
        ]
        services_class = getattr(template, MAPPING["runtimeServices"])
        self.assertEqual(public_methods(services_class), services)
        for item, name in zip(CONTRACT["RuntimeServices"]["operations"], services):
            self.assertEqual(
                parameter_count(services_class, name), len(item["parameters"])
            )
        environment = template.RuntimeEnvironment
        self.assertIn(services_class, environment.__mro__)
        self.assertEqual(
            instance_attributes(environment()), MAPPING["runtimeEnvironmentFields"]
        )
        self.assertEqual(
            public_methods(environment), MAPPING["runtimeEnvironmentOperations"]
        )
        for item, name in zip(
            CONTRACT["RuntimeEnvironment"]["operations"],
            MAPPING["runtimeEnvironmentOperations"],
        ):
            self.assertEqual(
                parameter_count(environment, name), len(item["parameters"]), name
            )

    def test_frame_and_scope(self):
        self.assertEqual(list(template.Frame.__slots__), MAPPING["frameFields"])
        self.assertEqual(list(template.Scope.__slots__), MAPPING["scopeFields"])
        self.assertEqual(public_methods(template.Scope), MAPPING["scopeOperations"])
        self.assertEqual(MAPPING["frameFields"], CONTRACT["RenderFrame"]["fields"])
        self.assertEqual(MAPPING["scopeFields"], CONTRACT["RenderScope"]["fields"])

    def test_bound_map(self):
        bound = MAPPING["boundMap"]
        self.assertEqual(list(bound["operations"]), ["bind", "merge"])
        for operation in bound["operations"].values():
            self.assertTrue(inspect.isfunction(getattr(template, operation)), operation)
        first = getattr(template, bound["operations"]["bind"])({"a": 1})
        self.assertIsInstance(first, getattr(template, bound["type"]))
        self.assertEqual(public_methods(getattr(template, bound["type"])), [])
        for name in bound["assign"].values():
            self.assertTrue(callable(getattr(template.AstProgram, name)), name)
        self.assertEqual(
            sorted(bound["assign"]), sorted(CONTRACT["BoundMap"]["acceptedBy"])
        )
        bind_module = importlib.import_module("polyspec.template.bind")
        for name in bound["generatedOperations"]:
            self.assertTrue(inspect.isfunction(getattr(bind_module, name)), name)


if __name__ == "__main__":
    unittest.main()
