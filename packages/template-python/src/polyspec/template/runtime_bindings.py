"""Shared runtime value, function and error semantics for AST and generated programs."""

from __future__ import annotations

import math

from .context import Frame, RenderContext
from .errors import Span, TemplateError
from .escape import escape_html
from .functions import BUILTINS, Env, FunctionContext, FunctionError, HostFunction, to_number
from .stringify import StringifyError, stringify
from .values import (NativeObject, SafeString, Value, compare_values, is_number, is_string,
                     is_truthy, loose_equals, strict_equals, text_of, type_of)
from .bind import BindError, MAX_DEPTH, bind_value, depth_within, host_argument

_INDEX_TEXT = '(0|[1-9][0-9]*)'


def _is_integer(value: float) -> bool:
    return isinstance(value, float) and value == int(value) and abs(value) < 2 ** 53


def _js_mod(dividend: float, divisor: float) -> float:
    # The JavaScript remainder keeps the sign of the dividend.
    return math.fmod(dividend, divisor)


class RuntimeBindings:
    """One implementation of the observable value semantics used by both compiler modes."""

    def __init__(self, context: RenderContext):
        self.context = context

    def truthy(self, value: Value) -> bool:
        """Applies template truthiness."""
        return is_truthy(value)

    def unary(self, operator: str, operand: Value, frame: Frame, span: Span) -> Value:
        """Applies an eager unary operator at its source span."""
        if operator == '!':
            return not self.truthy(operand)
        if operator == '-':
            return self.finite(-self.number(operand, frame, span), frame, span)
        raise self.error(frame, span, 'E_RUNTIME_TYPE', f'unknown operator {operator}')

    def binary(self, operator: str, left: Value, right: Value, frame: Frame, span: Span) -> Value:
        """Applies an eager binary operator at its source span."""
        if operator == '+':
            if isinstance(left, (list, dict)) or isinstance(right, (list, dict)):
                raise self.error(frame, span, 'E_RUNTIME_STRINGIFY',
                                 'a list or map cannot be converted to text')
            if is_string(left) or is_string(right):
                return self.stringify(left, frame, span) + self.stringify(right, frame, span)
            return self.finite(self.number(left, frame, span) + self.number(right, frame, span),
                               frame, span)
        if operator == '-':
            return self.finite(self.number(left, frame, span) - self.number(right, frame, span),
                               frame, span)
        if operator == '*':
            return self.finite(self.number(left, frame, span) * self.number(right, frame, span),
                               frame, span)
        if operator == '/':
            divisor = self.number(right, frame, span)
            if divisor == 0:
                raise self.error(frame, span, 'E_RUNTIME_DIV_ZERO', 'division by zero')
            return self.finite(self.number(left, frame, span) / divisor, frame, span)
        if operator == '%':
            dividend = self.number(left, frame, span)
            divisor = self.number(right, frame, span)
            if not _is_integer(dividend) or not _is_integer(divisor):
                raise self.error(frame, span, 'E_RUNTIME_TYPE', '% requires integer operands')
            if divisor == 0:
                raise self.error(frame, span, 'E_RUNTIME_DIV_ZERO', 'division by zero')
            return _js_mod(dividend, divisor)
        if operator == '==':
            return self.equal(left, right, False)
        if operator == '!=':
            return not self.equal(left, right, False)
        if operator == '===':
            return self.equal(left, right, True)
        if operator == '!==':
            return not self.equal(left, right, True)
        if operator in ('<', '>', '<=', '>='):
            order = self.compare(left, right, frame, span)
            return (order < 0 if operator == '<' else order > 0 if operator == '>'
                    else order <= 0 if operator == '<=' else order >= 0)
        if operator == 'in':
            if isinstance(right, list):
                return any(self.equal(item, left, False) for item in right)
            if isinstance(right, dict):
                return self.stringify(left, frame, span) in right
            if is_string(right):
                return self.stringify(left, frame, span) in text_of(right)
            raise self.error(frame, span, 'E_RUNTIME_TYPE',
                             'in requires a list, map or string on the right')
        raise self.error(frame, span, 'E_RUNTIME_TYPE', f'unknown operator {operator}')

    def stringify(self, value: Value, frame: Frame, span: Span) -> str:
        """Converts a template scalar to text and reports collection failures at the span."""
        try:
            return stringify(value)
        except StringifyError as error:
            raise self.error(frame, span, 'E_RUNTIME_STRINGIFY', str(error)) from None

    def escape(self, value: Value, frame: Frame, span: Span) -> str:
        """Escapes an echo value while preserving explicitly safe text."""
        return value.text if isinstance(value, SafeString) else escape_html(
            self.stringify(value, frame, span))

    def number(self, value: Value, frame: Frame, span: Span) -> float:
        """Converts a template value to a number using the common numeric rules."""
        try:
            return to_number(value)
        except FunctionError as error:
            raise self.error(frame, span, error.code, str(error)) from None

    def finite(self, value: float, frame: Frame, span: Span) -> float:
        """Rejects a non-finite arithmetic result."""
        if not math.isfinite(value):
            raise self.error(frame, span, 'E_RUNTIME_TYPE', 'arithmetic result is not finite')
        return value

    def equal(self, left: Value, right: Value, strict: bool) -> bool:
        """Applies loose or strict template equality."""
        return strict_equals(left, right) if strict else loose_equals(left, right)

    def compare(self, left: Value, right: Value, frame: Frame, span: Span) -> float:
        """Orders two compatible template values or reports a positioned comparison error."""
        order = compare_values(left, right)
        if order is None:
            raise self.error(frame, span, 'E_RUNTIME_COMPARE',
                             f'{type_of(left)} and {type_of(right)} have no order')
        return order

    def member(self, container: Value, key: str, frame: Frame, span: Span) -> Value:
        """Reads a fixed member name (EXP-18, VAL-19)."""
        return self.index(container, key, frame, span)

    def member_call(self, container: Value, method: str, args: list, frame: Frame,
                    span: Span) -> Value:
        """Calls a public method on an assigned native object and binds its result (VAL-19)."""
        candidate = None
        if isinstance(container, NativeObject):
            attribute = getattr(container.target, method, None)
            if callable(attribute) and not method.startswith('_'):
                candidate = attribute
        if candidate is None:
            raise self.error(frame, span, 'E_RUNTIME_UNKNOWN_FUNCTION',
                             f'{method} is not a function')
        return self._host_result(method,
                                 lambda: candidate(*[host_argument(arg) for arg in args]),
                                 frame, span)

    def class_call(self, class_name: str, method: str, args: list, frame: Frame,
                   span: Span) -> Value:
        """Calls a registered logical class function and binds its result."""
        function = self.context.services.class_function(class_name, method)
        if function is None:
            raise self.error(frame, span, 'E_RUNTIME_UNKNOWN_FUNCTION',
                             f'{class_name}::{method} is not a function')
        return self._host_result(
            f'{class_name}::{method}',
            lambda: function([host_argument(arg) for arg in args],
                             FunctionContext(self.context.env)),
            frame, span)

    def index(self, container: Value, key: Value, frame: Frame, span: Span) -> Value:
        """Reads a dynamic list position, a map key or a public field of a native
        object (EXP-19, VAL-19)."""
        if isinstance(container, dict):
            if is_string(key):
                return container.get(text_of(key), None)
            if is_number(key) and _is_integer(float(key)):
                return container.get(_int_text(int(key)), None)
            return None
        if isinstance(container, list):
            position = None
            if is_number(key) and _is_integer(float(key)):
                position = int(key)
            elif is_string(key):
                import re
                if re.fullmatch(_INDEX_TEXT, text_of(key)):
                    position = int(text_of(key))
            if position is None or position < 0 or position >= len(container):
                return None
            return container[position]
        if isinstance(container, NativeObject) and is_string(key):
            name = text_of(key)
            if name.startswith('_'):
                return None
            try:
                field = getattr(container.target, name, None)
            except Exception as error:  # noqa: BLE001  the host object decides
                raise self.error(frame, span, 'E_RUNTIME_HOST_FUNCTION',
                                 f'{name} failed: {error}') from None
            if field is None or callable(field):
                return None
            return self._bound(field, frame, span)
        return None

    def depth(self, value: Value, frame: Frame, span: Span) -> Value:
        """Checks the depth of a value that a list or map literal built (VAL-20)."""
        if not depth_within(value, MAX_DEPTH):
            raise self.error(frame, span, 'E_RUNTIME_LIMIT',
                             f'a list or map literal nests deeper than {MAX_DEPTH} levels')
        return value

    def entries(self, value: Value, frame: Frame, span: Span) -> list:
        """Converts a nullable list or map into ordered loop entries."""
        if value is None:
            return []
        if isinstance(value, list):
            return [(float(index), item) for index, item in enumerate(value)]
        if isinstance(value, dict):
            return list(value.items())
        raise self.error(frame, span, 'E_RUNTIME_TYPE', 'loop requires a list, a map or null')

    def list_spread(self, value: Value, frame: Frame, span: Span) -> list:
        """Validates and expands one list spread operand."""
        if not isinstance(value, list):
            raise self.error(frame, span, 'E_RUNTIME_TYPE', 'spread in a list requires a list')
        return value

    def map_spread(self, value: Value, frame: Frame, span: Span) -> dict:
        """Validates and expands one map spread operand."""
        if not isinstance(value, dict):
            raise self.error(frame, span, 'E_RUNTIME_TYPE', 'spread in a map requires a map')
        return value

    def call(self, name: str, args: list, frame: Frame, span: Span) -> Value:
        """Calls a built-in or registered host function with shared arity and
        binding behavior."""
        function_context = FunctionContext(self.context.env)
        builtin = BUILTINS.get(name)
        if builtin is not None:
            if len(args) < builtin.minimum or len(args) > builtin.maximum:
                accepts = (str(builtin.minimum) if builtin.minimum == builtin.maximum
                           else f'{builtin.minimum} to {int(builtin.maximum)}')
                raise self.error(frame, span, 'E_RUNTIME_ARITY',
                                 f'{name} accepts {accepts} arguments, got {len(args)}')
            try:
                return builtin.call(args, function_context)
            except FunctionError as error:
                raise self.error(frame, span, error.code, str(error)) from None
        host = self.context.services.host_function(name)
        if host is None:
            raise self.error(frame, span, 'E_RUNTIME_UNKNOWN_FUNCTION',
                             f'{name} is not a function')
        return self._host_result(
            name, lambda: host([host_argument(arg) for arg in args], function_context),
            frame, span)

    def limit(self, kind: str, count: int, frame: Frame, span: Span) -> None:
        """Enforces an expression-depth or loop-iteration limit."""
        limits = self.context.services.limits()
        maximum = limits['expressionDepth'] if kind == 'expression' else limits['iterations']
        if count <= maximum:
            return
        message = (f'expression nesting exceeds {maximum}' if kind == 'expression'
                   else f'loop iterations exceed {maximum}')
        raise self.error(frame, span, 'E_RUNTIME_LIMIT', message)

    def error(self, frame: Frame, span: Span, code: str, message: str) -> TemplateError:
        """Creates one positioned runtime error through the active render context."""
        return self.context.fail(code, frame, span, message)

    def _host_result(self, name: str, run, frame: Frame, span: Span) -> Value:
        """Runs host code and binds its result; a failure is E_RUNTIME_HOST_FUNCTION
        at the call (FUN-46)."""
        try:
            result = run()
        except TemplateError:
            raise
        except Exception as error:  # noqa: BLE001  the host function decides
            raise self.error(frame, span, 'E_RUNTIME_HOST_FUNCTION',
                             f'{name} failed: {error}') from None
        return self._bound(result, frame, span)

    def _bound(self, value, frame: Frame, span: Span) -> Value:
        """Binds a host value; a value that cannot be bound fails with its data
        code at the expression (ERR-5)."""
        try:
            return bind_value(value)
        except BindError as error:
            raise self.error(frame, span, error.code, str(error)) from None


def _int_text(value: int) -> str:
    from .number import number_to_string
    return number_to_string(float(value))
