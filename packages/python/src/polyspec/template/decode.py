"""Decoding of the AST JSON (AST-10): the canonical JSON of a template AST, validated against
contracts/schema/ast.schema.json, read as the AST that `parse` returns."""

from __future__ import annotations

import json
from functools import cache
from importlib.resources import files

from jsonschema import Draft7Validator, ValidationError


class AstDecodeError(ValueError):
    """The failure of `decode_template`: the JSON is not a template AST of the schema."""

    def __init__(self, path: str, reason: str):
        shown = "the root" if path == "" else path
        super().__init__(f"invalid template AST at {shown}: {reason}")
        self.path = path
        """The JSON Pointer (RFC 6901) of the invalid node, empty for the root (AST-10)."""


@cache
def _validator() -> Draft7Validator:
    # ast.schema.json is a copy of contracts/schema/ast.schema.json, package data of
    # the wheel, which tests/test_decode.py compares with it. The validator is made
    # on the first decode.
    schema = json.loads(
        files(__package__).joinpath("ast.schema.json").read_text(encoding="utf-8")
    )
    return Draft7Validator(schema)


def _pointer(error: ValidationError) -> str:
    return "".join(
        "/" + str(token).replace("~", "~0").replace("/", "~1")
        for token in error.absolute_path
    )


def _invalid_node(errors: list[ValidationError]) -> AstDecodeError:
    # The invalid node (AST-10): the deepest instance location of the errors, and
    # of several at that depth the least in code point order. The schema selects
    # the schema of a node by its type with if/then, so an error names a value of
    # the node itself.
    error = min(errors, key=lambda error: (-len(error.absolute_path), _pointer(error)))
    return AstDecodeError(_pointer(error), error.message)


def _not_json(name: str) -> None:
    raise ValueError(f"{name} is not JSON")


def _native(value):
    # The AST of the package holds a span as a tuple and a number literal as a float,
    # as the parser makes them.
    if isinstance(value, list):
        return [_native(item) for item in value]
    if not isinstance(value, dict):
        return value
    node = {key: _native(item) for key, item in value.items()}
    if "span" in node:
        node["span"] = tuple(node["span"])
    if node.get("type") == "Literal" and node["kind"] == "number":
        node["value"] = float(node["value"])
    return node


def decode_template(text: "str | bytes") -> dict:
    """Decodes the canonical JSON text of a template AST (AST-7) into the AST that
    `parse` returns, so a program renders it without parsing a source (RT-41).

    Raises ValueError for text that is not JSON, json.JSONDecodeError for a syntax
    error, and AstDecodeError, which names the JSON Pointer of the invalid node, for
    JSON that is not a template AST of contracts/schema/ast.schema.json (AST-10).
    """
    value = json.loads(text, parse_constant=_not_json)
    errors = list(_validator().iter_errors(value))
    if errors:
        raise _invalid_node(errors)
    return _native(value)
