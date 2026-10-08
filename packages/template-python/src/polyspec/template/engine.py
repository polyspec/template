"""Engine: template loading, caching, function registration and rendering
(RT-1 to RT-6, RT-40, RT-41)."""

from __future__ import annotations

import re
import time
from typing import Any, Union

from .bind import BindError, bind_data, bind_map, check_text
from .context import Frame, RenderContext, Scope
from .errors import TemplateError, error_at, internal_boundary
from .functions import Env, HostFunction
from .loader import Loader, LoadedAst, MapLoader, PathError, resolve_path
from .parser import parse_template
from .runtime_environment import RuntimeEnvironment
from .scanner import DEFAULT_DELIMITERS, parse_delimiters
from .source import Source
from .statements import Renderer

_IDENTIFIER = re.compile(r"[A-Za-z_][A-Za-z0-9_]*\Z")

# One template definition: a path, a definition entry, or ready HTML (RT-24).


class EngineOptions:
    """What an engine is created with (RT-1, RT-5, RT-6, RT-42); every field has a default."""

    def __init__(
        self,
        loader: "Loader | None" = None,
        functions: "dict[str, HostFunction] | None" = None,
        class_functions: "dict[str, HostFunction] | None" = None,
        limits: "dict | None" = None,
        delimiters: "str | None" = None,
        artifact_refresh: str = "true",
    ):
        self.loader = loader
        self.functions = functions
        self.class_functions = class_functions
        self.limits = limits
        self.delimiters = delimiters
        # dev parses on every load, true refreshes when the loader version
        # changes, false keeps the first loaded artifact for the lifetime of the
        # engine.
        self.artifact_refresh = artifact_refresh


class RenderOptions:
    """What one render call receives besides assigned variables: template
    definitions and the environment (RT-4)."""

    def __init__(
        self, define: "dict[str, Any] | None" = None, env: "dict | None" = None
    ):
        self.define = define
        self.env = env


class PreparedRender:
    """A prepared request owns exactly one render."""

    def render(self) -> str:
        raise NotImplementedError


def parse_with_lines(
    source: Union[str, bytes], name: str, delimiters: tuple[str, str]
) -> dict:
    parsed = (
        Source.from_text(name, source)
        if isinstance(source, str)
        else Source.from_bytes(name, source)
    )
    return {"ast": parse_template(parsed, delimiters), "lines": parsed.lines}


class _AstPreparedExecution:
    def __init__(
        self,
        engine: "AstProgramCore",
        root_data: dict,
        registry: dict,
        env: Env,
        target_name: str,
        template: dict,
    ):
        self.engine = engine
        self.root_data = root_data
        self.registry = registry
        self.env = env
        self.target_name = target_name
        self.template = template

    def render(self) -> str:
        context = RenderContext(self.engine, self.root_data, self.env, self.target_name)
        for id, entry in self.registry.items():
            context.registry[id] = entry
        context.enter(self.target_name, None, None)
        Renderer(context, self.engine).render_nodes(
            self.template["ast"]["body"],
            Frame(self.template["ast"]["name"], self.template["lines"], self.root_data),
            Scope(),
        )
        return context.output.text()


class _AstPreparedRender(PreparedRender):
    def __init__(self, name: str, execution: _AstPreparedExecution):
        self.name = name
        self.execution = execution

    def render(self) -> str:
        # A language runtime error during the render is E_INTERNAL (ERR-13).
        return internal_boundary(self.name, self.execution.render)


class Program:
    """Prepares and renders one complete compiled template representation."""

    def prepare(
        self, target: "str | dict", assign, options: RenderOptions
    ) -> PreparedRender:
        raise NotImplementedError

    def render(self, target: "str | dict", assign, options: RenderOptions) -> str:
        return self.prepare(target, assign, options).render()


class Engine:
    """Delegates requests to one complete program."""

    def __init__(self, program: Program):
        self.program = program

    def prepare(
        self, target: "str | dict", assign, options: "RenderOptions | None" = None
    ) -> PreparedRender:
        return self.program.prepare(target, assign, options or RenderOptions())

    def render(
        self, target: "str | dict", assign, options: "RenderOptions | None" = None
    ) -> str:
        return self.program.render(target, assign, options or RenderOptions())


class AstProgramCore(Program):
    """AST program core with template loading, host functions, limits and parsed artifacts."""

    def __init__(self, options: "EngineOptions | None" = None):
        options = options or EngineOptions()
        self.loader: Loader = options.loader or MapLoader()
        self.runtime = RuntimeEnvironment(options.limits, options.functions)
        for name, function in (options.class_functions or {}).items():
            separator = name.find("::")
            if separator <= 0 or separator == len(name) - 2:
                raise ValueError(f"{name!r} is not a class function name")
            self.runtime.register_class(
                name[:separator], name[separator + 2 :], function
            )
        self.artifact_refresh = options.artifact_refresh
        if options.delimiters is not None:
            delimiters = parse_delimiters(options.delimiters)
            if delimiters is None:
                raise ValueError(f"{options.delimiters!r} is not a delimiter pair")
            self.delimiters = delimiters
        else:
            self.delimiters = DEFAULT_DELIMITERS
        self._cache: dict[str, tuple[str, dict]] = {}

    # FUN-43, FUN-44.
    def register(self, name: str, function: HostFunction) -> None:
        self.runtime.register(name, function)

    def register_class(
        self, class_name: str, method: str, function: HostFunction
    ) -> None:
        """Registers one logical class function used by `Class::method(...)`."""
        self.runtime.register_class(class_name, method, function)

    def host_function(self, name: str) -> "HostFunction | None":
        return self.runtime.host_function(name)

    def class_function(self, class_name: str, method: str) -> "HostFunction | None":
        return self.runtime.class_function(class_name, method)

    def limits(self) -> dict:
        return self.runtime.limits()

    # RT-9, RT-40: loads a template by name through the loader and caches it by version.
    def load_template(self, name: str, from_frame: "Frame | None", span) -> dict:
        def fail(code: str, message: str) -> TemplateError:
            if from_frame is not None and span is not None:
                return error_at(code, from_frame.name, from_frame.lines, span, message)
            return TemplateError(code, name, 0, 0, 0, 0, message)

        try:
            loaded = self.loader.load(name)
        except Exception as error:  # noqa: BLE001  RT-9: every exception of the loader is a load failure
            raise fail(
                "E_LOAD_FAILED", f"template {name} cannot be loaded: {error}"
            ) from None
        if loaded is None:
            raise fail("E_LOAD_NOT_FOUND", f"template {name} does not exist")
        cached = self._cache.get(name)
        if self.artifact_refresh == "false" and cached is not None:
            return cached[1]
        if (
            self.artifact_refresh == "true"
            and cached is not None
            and cached[0] == loaded.version
        ):
            return cached[1]
        if isinstance(loaded, LoadedAst):
            template = {"ast": loaded.ast, "lines": None}
        else:
            template = parse_with_lines(loaded.source, name, self.delimiters)
        self._cache[name] = (loaded.version, template)
        return template

    def prepare(
        self, target: "str | dict", assign, options: "RenderOptions | None" = None
    ) -> PreparedRender:
        name = target if isinstance(target, str) else target["name"]
        return internal_boundary(
            name,
            lambda: self._prepare_bound(
                name, target, assign, options or RenderOptions()
            ),
        )

    def _prepare_bound(
        self, name: str, target: "str | dict", assign, options: RenderOptions
    ) -> PreparedRender:
        try:
            root_data = bind_map(assign)
            registry = self._bind_defines(options.define or {})
            env = self._bind_env(options.env or {})
        except BindError as error:
            raise TemplateError(error.code, name, 0, 0, 0, 0, str(error)) from None
        if isinstance(target, str):
            target_entry = registry.get(target)
            target_name = (
                target_entry["template"]
                if target_entry and "template" in target_entry
                else name
            )
            template = self.load_template(target_name, None, None)
        else:
            target_name = name
            template = {"ast": target, "lines": None}
        return _AstPreparedRender(
            name,
            _AstPreparedExecution(
                self, root_data, registry, env, target_name, template
            ),
        )

    def render(
        self, target: "str | dict", assign, options: "RenderOptions | None" = None
    ) -> str:
        """Renders a template name or a parsed template and returns the complete
        output (RT-3).

        It raises a TemplateError and returns no partial output when the render
        fails (RT-36).
        """
        return self.prepare(target, assign, options).render()

    def _bind_defines(self, defines: dict) -> dict:
        registry: dict[str, dict] = {}
        for id, value in defines.items():
            check_text(id)
            if (
                not isinstance(value, str)
                and isinstance(value, dict)
                and "html" in value
                and isinstance(value["html"], str)
            ):
                registry[id] = {"html": value["html"]}
            elif isinstance(value, str) or (
                isinstance(value, dict) and isinstance(value.get("template"), str)
            ):
                template = value if isinstance(value, str) else value["template"]
                try:
                    name = resolve_path("", template)
                except PathError as error:
                    raise BindError(
                        "E_DATA_UNSUPPORTED_TYPE", f"define {id}: {error}"
                    ) from None
                if isinstance(value, str) or value.get("data") is None:
                    data = None
                else:
                    data = bind_data(value["data"])
                    if not isinstance(data, dict):
                        raise BindError(
                            "E_DATA_UNSUPPORTED_TYPE", f"define {id}: data is not a map"
                        )
                registry[id] = {"template": name, "data": data}
            else:
                raise BindError(
                    "E_DATA_UNSUPPORTED_TYPE",
                    f'define {id}: entry needs "template" or "html"',
                )
        return registry

    def _bind_env(self, env: dict) -> Env:
        timezone = env.get("timezone", "Z")
        now = env.get("now", math_floor(time.time()))
        if not isinstance(timezone, str):
            raise BindError("E_DATA_UNSUPPORTED_TYPE", "env.timezone is not a string")
        if not isinstance(now, (int, float)) or isinstance(now, bool):
            raise BindError("E_DATA_UNSUPPORTED_TYPE", "env.now is not a number")
        return Env(timezone, float(now))


def math_floor(value: float) -> float:
    import math

    return math.floor(value)


class AstProgram(AstProgramCore):
    """An engine that parses the sources its loader returns."""
