"""Loader interface, map loader and template name resolution (RT-7 to RT-10)."""

from __future__ import annotations

import json
from typing import Optional, Protocol, Union

from .values import Value


class LoadResult(Protocol):
    """What a loader returns for a name: the source text or a parsed template,
    with the version that the engine caches the parse under (RT-9, RT-40)."""

    source: Union[str, bytes, None]
    ast: Union[dict, None]
    version: str


class LoadedSource:
    __slots__ = ('source', 'version')

    def __init__(self, source, version: str):
        self.source = source
        self.version = version


class LoadedAst:
    __slots__ = ('ast', 'version')

    def __init__(self, ast: dict, version: str):
        self.ast = ast
        self.version = version


class Loader(Protocol):
    """Where an engine reads templates from (RT-9)."""

    def load(self, name: str) -> Union[LoadResult, None]: ...


def content_hash(text: str) -> str:
    """FNV-1a hash of a string, used as the version of in-memory sources."""
    hashed = 0x811c9dc5
    for char in text:
        hashed ^= ord(char)
        hashed = (hashed * 0x01000193) & 0xffffffff
    return f'{hashed:08x}'


class MapLoader:
    """A loader that holds names and their sources or parsed templates in memory
    and uses a hash of the content as the version (RT-10)."""

    def __init__(self, sources: Optional[dict[str, Union[str, dict]]] = None):
        self.entries: dict[str, LoadResult] = {}
        for name, value in (sources or {}).items():
            self.set(name, value)

    def set(self, name: str, value: Union[str, dict]) -> None:
        """Adds or replaces one template; a replaced template gets a new version,
        so the engine parses it again."""
        if isinstance(value, str):
            self.entries[name] = LoadedSource(value, content_hash(value))
        else:
            self.entries[name] = LoadedAst(value, content_hash(json.dumps(value)))

    def load(self, name: str) -> Union[LoadResult, None]:
        return self.entries.get(name)


class PathError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.name = 'PathError'


def resolve_path(current: str, path: str) -> str:
    """RT-8: resolves a path written in a tag against the directory of the current template."""
    base = [] if path.startswith('/') else [s for s in current.split('/')[:-1] if s != '']
    segments = list(base)
    for segment in path.split('/'):
        if segment in ('', '.'):
            continue
        if segment == '..':
            if not segments:
                raise PathError(f'{json.dumps(path)} leaves the loader root')
            segments.pop()
            continue
        segments.append(segment)
    return '/'.join(segments)
