"""Filesystem loader (RT-10): reads root/name and reports modification time and
size as the version."""

from __future__ import annotations

import os

from .loader import LoadedSource


class FsLoader:
    """A loader that reads templates from a directory and reports the modification
    time and the size of a file as its version, so that a changed file is parsed
    again (RT-10)."""

    def __init__(self, root: str):
        self.root = os.path.abspath(root)

    def load(self, name: str):
        """Returns the file of a name, or None when the name does not exist or
        leaves the directory."""
        path = os.path.abspath(os.path.join(self.root, *name.split("/")))
        if path != self.root and not path.startswith(self.root + os.sep):
            return None
        try:
            stats = os.stat(path)
        except OSError:
            return None
        if not os.path.isfile(path):
            return None
        with open(path, "rb") as handle:
            data = handle.read()
        return LoadedSource(data, f"{stats.st_mtime}:{stats.st_size}")

    def path_of(self, name: str) -> str:
        """The file system path of a template name."""
        return os.path.join(self.root, *name.split("/"))
