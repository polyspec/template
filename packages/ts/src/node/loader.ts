// Filesystem loader (RT-10): reads root/name and reports modification time and size as the version.
import { lstatSync, readFileSync, type BigIntStats } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import type { Loader, LoadResult } from '../loader.js';

// A loader that reads templates from a directory and reports the modification time and the size
// of a file as its version, so that a changed file is parsed again (RT-10). It never follows a
// symbolic link and gives each file, identified by its device and inode number, one name.
export class FsLoader implements Loader {
  readonly root: string;
  // The name of each file that the loader read, by device and inode number.
  private readonly files = new Map<string, string>();

  // Creates a loader for a directory. Every template name resolves inside it.
  constructor(root: string) {
    this.root = resolve(root);
  }

  // Returns the file of a name, or null when no regular file exists for the name or the name leaves
  // the directory. A symbolic link at any component of the name, a regular file that cannot be read
  // and a file that the loader read under another name are failures.
  load(name: string): LoadResult | null {
    const path = resolve(this.root, ...name.split('/'));
    if (path !== this.root && !path.startsWith(this.root + sep)) return null;
    const segments = name.split('/');
    let stats: BigIntStats | undefined;
    for (let index = 0; index < segments.length; index++) {
      stats = lstatSync(join(this.root, ...segments.slice(0, index + 1)), { bigint: true, throwIfNoEntry: false });
      if (stats === undefined) return null;
      if (stats.isSymbolicLink()) throw new Error(`${segments.slice(0, index + 1).join('/')} is a symbolic link`);
      if (index < segments.length - 1 && !stats.isDirectory()) return null;
    }
    if (stats === undefined || !stats.isFile()) return null;
    const identity = `${stats.dev}:${stats.ino}`;
    const owner = this.files.get(identity) ?? name;
    if (owner !== name) throw new Error(`${name} is the file of ${owner}`);
    this.files.set(identity, name);
    return { source: new Uint8Array(readFileSync(path)), version: `${stats.mtimeNs}:${stats.size}` };
  }

  // Returns the file system path of a template name.
  pathOf(name: string): string {
    return join(this.root, ...name.split('/'));
  }
}
