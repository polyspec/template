// Shared test paths and template file discovery.
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const repositoryRoot = resolve(packageRoot, '..', '..');
export const fixtures = join(packageRoot, 'tests', 'fixtures');

/** Lists every `.tpl` file below a directory in sorted order. */
export function templateFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'vendor' && !entry.name.startsWith('.')) walk(path);
      } else if (entry.name.endsWith('.tpl')) {
        files.push(path);
      }
    }
  };
  walk(directory);
  return files;
}
