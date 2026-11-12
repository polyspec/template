"""Runtime environment shared by AST and generated programs."""

from __future__ import annotations

import re
from typing import Protocol

from .context import DEFAULT_LIMITS
from .functions import BUILTINS


class RuntimeServices(Protocol):
    """The lookups that a render context needs from the runtime: the resource
    limits and the host functions. AST and generated programs expose the same
    three operations without coupling render state to an AST loader."""

    def limits(self) -> dict: ...

    def host_function(self, name: str): ...

    def class_function(self, class_name: str, method: str): ...


class RuntimeEnvironment(RuntimeServices):
    """Host functions and resource limits shared by AST and generated programs."""

    def __init__(self, limits: "dict | None" = None, functions: "dict | None" = None):
        # RT-5, RT-6: the options are checked when the program is created.
        if limits is None:
            limits = {}
        if not isinstance(limits, dict):
            raise ValueError("limits is not an object")
        for key, value in limits.items():
            if key not in DEFAULT_LIMITS:
                raise ValueError(f"limits.{key} is not a limit")
            if isinstance(value, bool) or not isinstance(value, int):
                raise ValueError(f"limits.{key} is not an integer")
        if functions is None:
            functions = {}
        if not isinstance(functions, dict):
            raise ValueError("functions is not an object")
        for name, function in functions.items():
            if not callable(function):
                raise ValueError(f"functions.{name} is not a function")
        self._limits = {**DEFAULT_LIMITS, **limits}
        self._host_functions: dict = {}
        self._class_functions: dict = {}
        for name, function in functions.items():
            self.register(name, function)

    def register(self, name: str, function) -> None:
        """Registers one host function after validating its name."""
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
            raise ValueError(f"{name!r} is not an identifier")
        if name in BUILTINS:
            raise ValueError(f"{name} is a built-in function")
        self._host_functions[name] = function

    def limits(self) -> dict:
        return self._limits

    def host_function(self, name: str):
        return self._host_functions.get(name)

    def register_class(self, class_name: str, method: str, function) -> None:
        """Registers one logical class function used by `Class::method(...)`."""
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", class_name) or not re.fullmatch(
            r"[A-Za-z_][A-Za-z0-9_]*", method
        ):
            raise ValueError("class function names must be identifiers")
        self._class_functions[f"{class_name}::{method}"] = function

    def class_function(self, class_name: str, method: str):
        return self._class_functions.get(f"{class_name}::{method}")
