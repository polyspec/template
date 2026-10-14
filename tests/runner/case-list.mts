// The one lister of the conformance cases under tests/cases, shared by the runners, the schema checks and the per-case
// tests of the TypeScript packages.
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JSONSchemaType } from 'ajv';
import { jsonDocument } from '../../scripts/json-document.mts';

export const casesDir = join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'), 'tests', 'cases');

/** The ids `group/name` of every case directory, sorted. */
export function caseIds(): string[] {
  return readdirSync(casesDir, { withFileTypes: true })
    .filter(group => group.isDirectory())
    .flatMap(group => readdirSync(join(casesDir, group.name), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => `${group.name}/${entry.name}`))
    .sort((a, b) => a.localeCompare(b));
}

/** The options of a case: the delimiters of its parse and render. */
export interface CaseOptions {
  delimiters?: string;
}

const OPTIONS_SCHEMA: JSONSchemaType<CaseOptions> = {
  type: 'object', properties: { delimiters: { type: 'string', nullable: true } }, required: [], additionalProperties: false,
};
const optionsDocument = jsonDocument<CaseOptions>('options of a case', OPTIONS_SCHEMA);

/** The content of the options.json of a case; a case without options.json has no options. */
export function caseOptions(id: string): CaseOptions {
  const path = join(casesDir, id, 'options.json');
  return existsSync(path) ? optionsDocument.read(path) : {};
}
