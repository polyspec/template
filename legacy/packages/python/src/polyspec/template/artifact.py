"""The artifact-runtime (RT-56, docs/spec/runtime.md): loads an AST artifact that the build compiler wrote. It checks the
manifest and the digest of every file, and returns the program that renders its templates. Each file's digest is the
version of its template (RT-10)."""

from __future__ import annotations

import hashlib
import json
import os

from .decode import decode_template
from .engine import AstProgram, EngineOptions
from .loader import LoadedAst


class ArtifactStaleError(RuntimeError):
    """The artifact is missing or stale: its manifest or one of its files is absent, or a file does not match its digest.

    It is the one failure that a build fixes, so load_or_refresh rebuilds on it under "true" and on nothing else.
    """


class ArtifactLoader:
    """Serves the decoded templates of a loaded artifact by name."""

    def __init__(self, templates: dict):
        self.templates = templates

    def load(self, name: str):
        return self.templates.get(name)


def _read(path: str, what: str) -> bytes:
    """Reads one file of an artifact: an absent file raises ArtifactStaleError, any other OSError propagates as it is."""
    try:
        with open(path, "rb") as handle:
            return handle.read()
    except FileNotFoundError as error:
        raise ArtifactStaleError(f"{what} is missing: {path}") from error


def load_artifact(directory: str) -> AstProgram:
    """Loads the AST artifact in `directory` and returns the program that renders its templates (RT-56).

    Raises ArtifactStaleError when the manifest or a file is missing or a file does not match its digest. Every other
    failure raises its own error: an OSError for a file that cannot be read, a ValueError (json.JSONDecodeError,
    UnicodeDecodeError) for a manifest that is not JSON, the decoder's error for an AST that does not decode, and a
    RuntimeError for a manifest that is not an AST manifest or a source graph that is incomplete.
    """
    manifest = json.loads(
        _read(os.path.join(directory, "manifest.json"), "AST artifact manifest").decode(
            "utf-8"
        )
    )
    if not isinstance(manifest, dict) or manifest.get("mode") != "ast":
        mode = manifest.get("mode") if isinstance(manifest, dict) else None
        raise RuntimeError(
            f"the artifact in {directory} is not an AST artifact: {mode}"
        )
    files = manifest.get("files", {})
    if manifest.get("entry") not in files:
        raise RuntimeError("AST artifact source graph is incomplete")
    templates = {}
    for name, file in files.items():
        data = _read(
            os.path.join(directory, file["path"]), f"AST artifact file of {name}"
        )
        if hashlib.sha256(data).hexdigest() != file["artifactDigest"]:
            raise ArtifactStaleError(
                f"AST artifact file of {name} does not match its digest"
            )
        templates[name] = LoadedAst(decode_template(data), file["artifactDigest"])
    return AstProgram(EngineOptions(loader=ArtifactLoader(templates)))


def load_or_refresh(directory: str, refresh: str, build) -> AstProgram:
    """ArtifactStore.loadOrRefresh (docs/spec/runtime.md): returns the program of the artifact in `directory`, building it
    first when the policy asks. `build` writes the AST artifact of the sources; the build compiler is passed in by the host.
    "dev" builds on every call, "true" reuses an artifact that loads and rebuilds only a missing or stale one
    (ArtifactStaleError), letting every other error through, and "false" loads the artifact that exists and never builds.
    """
    if refresh == "false":
        return load_artifact(directory)
    if refresh == "dev":
        build(directory)
        return load_artifact(directory)
    if refresh != "true":
        raise ValueError(f"{refresh} is not an artifact refresh policy")
    try:
        return load_artifact(directory)
    except ArtifactStaleError:
        build(directory)
        return load_artifact(directory)
