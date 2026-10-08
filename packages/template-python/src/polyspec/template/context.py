"""Render state: frames, loop metas, template definitions, limits and error
creation (docs/spec/runtime.md)."""

from __future__ import annotations


from .errors import LineIndex, Span, TemplateError, error_at, error_without_position
from .output import Output
from .values import Value

# The resource limits of one render (RT-33); the engine options override single fields.
DEFAULT_LIMITS = {
    "iterations": 1_000_000,
    "depth": 32,
    "outputBytes": 16 * 1024 * 1024,
    "expressionDepth": 64,
}


class LoopMeta:
    __slots__ = ("index_", "key_", "value_", "first_", "last_", "size_")

    def __init__(self, size: int):
        self.index_ = 0.0
        self.key_: Value = None
        self.value_: Value = None
        self.first_ = True
        self.last_ = False
        self.size_ = size


class Frame:
    """One rendered template location and its context data."""

    __slots__ = ("name", "lines", "context")

    def __init__(self, name: str, lines: "LineIndex | None", context: dict):
        self.name = name
        self.lines = lines
        self.context = context


class Scope:
    """Local variables and active loops shared by an include and isolated by a block."""

    __slots__ = ("locals", "loops")

    def __init__(self):
        self.locals: dict[str, Value] = {}
        self.loops: dict[str, list[LoopMeta]] = {}

    def lookup(self, frame: Frame, name: str) -> Value:
        """Resolves a local before the current frame data."""
        if name in self.locals:
            return self.locals[name]
        return frame.context.get(name, None)

    def loop_meta(self, name: str) -> "LoopMeta | None":
        """The innermost active loop metadata for a variable."""
        stack = self.loops.get(name)
        return stack[-1] if stack else None


class RenderContext:
    """Owns the mutable state and bounded output of one render."""

    def __init__(self, services, root_data: dict, env: dict, entry_name: str):
        self.services = services
        self.root_data = root_data
        self.env = env
        self.entry_name = entry_name
        self.output = Output(
            services.limits()["outputBytes"],
            lambda: self.fail(
                "E_RUNTIME_LIMIT",
                self._current_frame,
                self._current_span,
                f"output exceeds {services.limits()['outputBytes']} bytes",
            ),
        )
        self.registry: dict[str, dict] = {}
        self.chain: list[str] = []
        self.iterations = 0
        self._current_span: Span = (0, 0)
        self._current_frame: "Frame | None" = None

    def at(self, frame: Frame, span: Span) -> None:
        """Records the node being rendered so that limit errors can point at it."""
        self._current_frame = frame
        self._current_span = span

    def fail(
        self, code: str, frame: "Frame | None", span: "Span | None", message: str
    ) -> TemplateError:
        """Creates a template error at a frame span, or an entry error without a position."""
        if frame is None or span is None:
            return error_without_position(
                code, frame.name if frame else self.entry_name, message
            )
        return error_at(code, frame.name, frame.lines, span, message)

    def enter(self, name: str, frame: "Frame | None", span: "Span | None") -> None:
        """Enters a template while enforcing cycle and nesting-depth limits."""
        if name in self.chain:
            raise self.fail(
                "E_LOAD_CYCLE", frame, span, f"{name} is already being rendered"
            )
        limits = self.services.limits()
        if len(self.chain) > limits["depth"]:
            raise self.fail(
                "E_RUNTIME_DEPTH",
                frame,
                span,
                f"nesting depth exceeds {limits['depth']}",
            )
        self.chain.append(name)

    def leave(self) -> None:
        """Leaves the current template after a direct include or block call."""
        self.chain.pop()
