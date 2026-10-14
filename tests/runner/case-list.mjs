// The one lister of the conformance cases under tests/cases, shared by the runners, the schema checks and the per-case
// tests of the TypeScript packages.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const casesDir = join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'), 'tests', 'cases');

/** The ids `group/name` of every case directory, sorted. */
export function caseIds() {
  return readdirSync(casesDir, { withFileTypes: true })
    .filter(group => group.isDirectory())
    .flatMap(group => readdirSync(join(casesDir, group.name), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => `${group.name}/${entry.name}`))
    .sort((a, b) => a.localeCompare(b));
}

/** The content of the options.json of a case, or {} when the case has none. */
export function caseOptions(id) {
  const path = join(casesDir, id, 'options.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
}
