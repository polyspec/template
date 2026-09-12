// Loader interface, map loader and template name resolution (RT-7 to RT-10).
import type { Template } from './ast.js';

export interface LoadedSource {
  source: string | Uint8Array;
  version: string;
}

export interface LoadedAst {
  ast: Template;
  version: string;
}

// What a loader returns for a name: the source text or a parsed template, with the version that
// the engine caches the parse under (RT-9, RT-40).
export type LoadResult = LoadedSource | LoadedAst;

// Where an engine reads templates from (RT-9). A server reads the file system, a browser reads a
// map that the page was shipped with.
export interface Loader {
  // Returns the template for a name, or null when the name does not exist.
  load(name: string): LoadResult | null;
}

// FNV-1a hash of a string, used as the version of in-memory sources.
export function contentHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

// A loader that holds names and their sources or parsed templates in memory and uses a hash of
// the content as the version (RT-10).
export class MapLoader implements Loader {
  private readonly entries = new Map<string, LoadResult>();

  // Creates a loader from names mapped to source text or parsed templates.
  constructor(sources: Record<string, string | Template> | Map<string, string | Template> = {}) {
    const items = sources instanceof Map ? sources.entries() : Object.entries(sources);
    for (const [name, value] of items) this.set(name, value);
  }

  // Adds or replaces one template. A replaced template gets a new version, so the engine parses
  // it again.
  set(name: string, value: string | Template): void {
    if (typeof value === 'string') this.entries.set(name, { source: value, version: contentHash(value) });
    else this.entries.set(name, { ast: value, version: contentHash(JSON.stringify(value)) });
  }

  // Returns the template for a name, or null when the name does not exist.
  load(name: string): LoadResult | null {
    return this.entries.get(name) ?? null;
  }
}

export class PathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathError';
  }
}

// RT-8: resolves a path written in a tag against the directory of the current template.
export function resolvePath(current: string, path: string): string {
  const base = path.startsWith('/') ? [] : current.split('/').slice(0, -1).filter(segment => segment !== '');
  const segments = [...base];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (!segments.length) throw new PathError(`${JSON.stringify(path)} leaves the loader root`);
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join('/');
}
