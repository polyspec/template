// A generated PHP program is one PSR-4 file per class under the directory of its namespace (T25.1). The checks and the
// conformance runner write the files that compileFiles returns into a directory and load the classes through the
// PSR-4 autoload of Composer: the class loader that vendor/autoload.php returns maps the namespace to the directory.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { phpString } from '../packages/compiler/src/backend-support.mts';

/** Writes `files`, by their paths under `directory`, and returns the path of every file. */
export function writePhpProgram(directory: string, files: Record<string, string>): string[] {
  return Object.entries(files).map(([name, source]) => {
    const path = join(directory, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
    return path;
  });
}

/**
 * PHP statements that require the Composer autoload and map `namespace` to a directory with PSR-4; `autoload` and
 * `directory` are PHP expressions, such as phpString(path) or $argv[1].
 */
export function phpProgramAutoload(autoload: string, namespace: string, directory: string): string {
  return `$loader = require ${autoload}; $loader->addPsr4(${phpString(`${namespace}\\`)}, ${directory});`;
}
