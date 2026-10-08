"""VAL-8: conversion of a value to text."""

from __future__ import annotations

from .number import number_to_string
from .values import SafeString, Value


class StringifyError(Exception):
    def __init__(self):
        super().__init__("a list or map cannot be converted to text")
        self.name = "StringifyError"


def stringify(value: Value) -> str:
    """The text of a value, or StringifyError for a list or map."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (float, int)):
        return number_to_string(float(value))
    if isinstance(value, str):
        return value
    if isinstance(value, SafeString):
        return value.text
    raise StringifyError()
