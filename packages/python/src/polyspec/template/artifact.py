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


class ArtifactLoader:
    """Serves the decoded templates of a loaded artifact by name."""

    def __init__(self, templates: dict):
        self.templates = templates

    def load(self, name: str):
        return self.templates.get(name)


def load_artifact(directory: str) -> AstProgram:
    """Loads the AST artifact in `directory` and returns the program that renders its templates (RT-56).

    Raises RuntimeError when the manifest is missing or not an AST manifest, the source graph is incomplete, or a file is
    missing or does not match its digest.
    """
    manifest_path = os.path.join(directory, "manifest.json")
    try:
        with open(manifest_path, "rb") as handle:
            manifest = json.loads(handle.read().decode("utf-8"))
    except OSError as error:
        raise RuntimeError(f"AST artifact manifest is missing: {manifest_path}") from error
    if manifest.get("mode") != "ast":
        raise RuntimeError(f"the artifact in {directory} is not an AST artifact: {manifest.get('mode')}")
    files = manifest.get("files", {})
    if manifest.get("entry") not in files:
        raise RuntimeError("AST artifact source graph is incomplete")
    templates = {}
    for name, file in files.items():
        try:
            with open(os.path.join(directory, file["path"]), "rb") as handle:
                data = handle.read()
        except OSError as error:
            raise RuntimeError(f"AST artifact is missing or corrupt: {name}") from error
        if hashlib.sha256(data).hexdigest() != file["artifactDigest"]:
            raise RuntimeError(f"AST artifact is missing or corrupt: {name}")
        templates[name] = LoadedAst(decode_template(data), file["artifactDigest"])
    return AstProgram(EngineOptions(loader=ArtifactLoader(templates)))
