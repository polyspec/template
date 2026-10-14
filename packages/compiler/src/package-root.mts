import { readdirSync } from 'node:fs';
import { findPackageJSON } from 'node:module';
import { dirname, join, relative } from 'node:path';

/** The directory of the package of a module specifier, resolved from `base`, or of the file URL `specifier`. */
export function packageDirectory(specifier: string, base?: string): string {
  const manifest = findPackageJSON(specifier, base);
  if (manifest === undefined) throw new Error(`${specifier} is in no package`);
  return dirname(manifest);
}

/**
 * The directory of this package, which holds interface.json, functions.json and the Go of the Go backend: the
 * repository runs the modules of src/ and the published package the build of dist/, both directories of it.
 */
export const packageRoot = packageDirectory(import.meta.url);

/** The files under a directory, as paths relative to it with `/`, sorted. */
export function filesUnder(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => relative(directory, join(entry.parentPath, entry.name)).split('\\').join('/'))
    .sort();
}
