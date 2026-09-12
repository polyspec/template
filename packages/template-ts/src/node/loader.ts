// Filesystem loader (RT-10): reads root/name and reports modification time and size as the version.
import { readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import type { Loader, LoadResult } from '../loader.js';

// A loader that reads templates from a directory and reports the modification time and the size
// of a file as its version, so that a changed file is parsed again (RT-10).
export class FsLoader implements Loader {
  readonly root: string;

  // Creates a loader for a directory. Every template name resolves inside it.
  constructor(root: string) {
    this.root = resolve(root);
  }

  // Returns the file of a name, or null when the name does not exist or leaves the directory.
  load(name: string): LoadResult | null {
    const path = resolve(this.root, ...name.split('/'));
    if (path !== this.root && !path.startsWith(this.root + sep)) return null;
    let stats;
    try {
      stats = statSync(path);
    } catch {
      return null;
    }
    if (!stats.isFile()) return null;
    return { source: new Uint8Array(readFileSync(path)), version: `${stats.mtimeMs}:${stats.size}` };
  }

  // Returns the file system path of a template name.
  pathOf(name: string): string {
    return join(this.root, ...name.split('/'));
  }
}
