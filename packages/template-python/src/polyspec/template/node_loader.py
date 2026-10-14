"""Filesystem loader (RT-10): reads root/name and reports modification time and
size as the version."""

from __future__ import annotations

import os
import stat

from .loader import LoadedSource


class FsLoader:
    """A loader that reads templates from a directory and reports the modification
    time and the size of a file as its version, so that a changed file is parsed
    again (RT-10)."""

    def __init__(self, root: str):
        self.root = os.path.abspath(root)
        # The name of each file that the loader read, by device and inode number.
        self._files: dict[tuple[int, int], str] = {}

    def load(self, name: str):
        """Returns the file of a name, or None when no regular file exists for
        the name or the name leaves the directory. A symbolic link at any
        component of the name, a regular file that cannot be read and a file
        that the loader read under another name are failures (RT-10)."""
        path = os.path.abspath(os.path.join(self.root, *name.split("/")))
        if path != self.root and not path.startswith(self.root + os.sep):
            return None
        segments = name.split("/")
        current = self.root
        stats = None
        for index, segment in enumerate(segments):
            current = os.path.join(current, segment)
            try:
                stats = os.lstat(current)
            except FileNotFoundError, NotADirectoryError:
                return None
            if stat.S_ISLNK(stats.st_mode):
                raise OSError(f"{'/'.join(segments[: index + 1])} is a symbolic link")
            if index < len(segments) - 1 and not stat.S_ISDIR(stats.st_mode):
                return None
        if stats is None or not stat.S_ISREG(stats.st_mode):
            return None
        owner = self._files.setdefault((stats.st_dev, stats.st_ino), name)
        if owner != name:
            raise OSError(f"{name} is the file of {owner}")
        with open(path, "rb") as handle:
            data = handle.read()
        return LoadedSource(data, f"{stats.st_mtime}:{stats.st_size}")
