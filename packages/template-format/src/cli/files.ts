// Command line inputs: expands file and directory arguments into the list of template files.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Returns the files named by the arguments. A directory contributes every `.tpl` file below it in
 * sorted order; directories named `node_modules` and directories whose name starts with `.` are
 * skipped. A file argument is returned as given, whatever its extension.
 */
export function collectFiles(paths: readonly string[]): string[] {
  const files: string[] = [];
  for (const path of paths) {
    if (statSync(path).isDirectory()) walk(path, files);
    else files.push(path);
  }
  return files;
}

function walk(directory: string, files: string[]): void {
  const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) walk(path, files);
    } else if (entry.isFile() && entry.name.endsWith('.tpl')) {
      files.push(path);
    }
  }
}
