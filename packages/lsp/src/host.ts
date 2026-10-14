// The host of root resolution over the file system (EDT-21): the language service reaches files only through it.
import { lstatSync, readFileSync } from 'node:fs';
import type { EntryType, RootHost } from '@polyspec/template-language';

/** Reads entries with `lstat`, which never follows a link; a missing path and a path under a file name nothing. */
export const fileHost: RootHost = {
  entryType(path: string): EntryType | null {
    let stats;
    try {
      stats = lstatSync(path);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return null;
      throw error;
    }
    return stats.isSymbolicLink() ? 'symlink' : stats.isFile() ? 'file' : stats.isDirectory() ? 'directory' : 'other';
  },
  readText(path: string): string {
    return readFileSync(path, 'utf8');
  },
};
