"""Package entry: parser, engine, loaders, values and errors."""

from __future__ import annotations

from .bind import BindError, bind_data, bind_map, bind_value, check_text
from .bind import BoundMap
from .bind_operations import bind, merge
from .context import Frame, RenderContext, Scope
from .engine import AstProgram, Engine, EngineOptions, PreparedRender, RenderOptions
from .errors import ERROR_CODES, TemplateError, internal_boundary
from .functions import BUILTINS, Env, FunctionContext, HostFunction
from .json_parse import parse_json, parse_json_bytes
from .loader import LoadedAst, LoadedSource, MapLoader, PathError, resolve_path
from .number import MAX_SAFE
from .page_cache import PageCache
from .parser import PrefixAnalysis, TemplateAnalysis, analyze_template, analyze_template_prefix, \
    parse_template
from .runtime_environment import RuntimeEnvironment
from .runtime_bindings import RuntimeBindings
from .scanner import DEFAULT_DELIMITERS, parse_delimiters
from .source import Source
from .statements import Evaluator, Renderer
from .values import NativeObject, SafeString

__all__ = [
    'MAX_SAFE', 'BUILTINS', 'DEFAULT_DELIMITERS', 'ERROR_CODES',
    'AstProgram', 'BindError', 'BoundMap', 'Engine', 'EngineOptions', 'Env', 'Evaluator',
    'Frame', 'FsLoader', 'FunctionContext', 'HostFunction', 'LoadedAst', 'LoadedSource',
    'MapLoader', 'NativeObject', 'PageCache', 'ParseOptions', 'PathError', 'PreparedRender', 'PrefixAnalysis',
    'RenderContext', 'RenderOptions', 'Renderer', 'RuntimeBindings',
    'RuntimeEnvironment', 'SafeString', 'Scope', 'Source', 'TemplateAnalysis', 'TemplateError',
    'analyze', 'analyze_prefix', 'analyze_template', 'analyze_template_prefix', 'bind', 'bind_data', 'bind_map', 'bind_value',
    'check_text', 'internal_boundary', 'merge', 'parse', 'parse_delimiters', 'parse_json',
    'parse_json_bytes', 'parse_template', 'resolve_path',
]

from .node_loader import FsLoader  # noqa: E402


class ParseOptions:
    """What `parse` accepts besides the source and the name."""

    __slots__ = ('delimiters',)

    def __init__(self, delimiters: 'str | None' = None):
        self.delimiters = delimiters


def _delimiters_of(value: 'str | None') -> tuple[str, str]:
    if value is None:
        return DEFAULT_DELIMITERS
    delimiters = parse_delimiters(value)
    if delimiters is None:
        raise ValueError(f'{value!r} is not a delimiter pair')
    return delimiters


def parse(source: 'str | bytes', name: str, options: 'ParseOptions | None' = None):
    """RT-2: parses one template source without loading other templates."""
    delimiters = _delimiters_of(options.delimiters if options else None)
    return internal_boundary(
        name, lambda: _parse_with_lines(source, name, delimiters)['ast'])


def analyze(source: 'str | bytes', name: str, options: 'ParseOptions | None' = None):
    """Parses a template once and returns its AST with exact parser-owned tag ranges."""
    delimiters = _delimiters_of(options.delimiters if options else None)
    parsed = (Source.from_text(name, source) if isinstance(source, str)
              else Source.from_bytes(name, source))
    return internal_boundary(name, lambda: analyze_template(parsed, delimiters))


def analyze_prefix(source: 'str | bytes', name: str, options: 'ParseOptions | None' = None):
    """Parses a template and returns the ranges it accepted before its first error (EDT-6)."""
    delimiters = _delimiters_of(options.delimiters if options else None)
    parsed = (Source.from_text(name, source) if isinstance(source, str)
              else Source.from_bytes(name, source))
    return internal_boundary(name, lambda: analyze_template_prefix(parsed, delimiters))


def _parse_with_lines(source: 'str | bytes', name: str, delimiters: tuple[str, str]) -> dict:
    parsed = (Source.from_text(name, source) if isinstance(source, str)
              else Source.from_bytes(name, source))
    return {'ast': parse_template(parsed, delimiters), 'lines': parsed.lines}
