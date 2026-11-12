// The one lister of the conformance cases under tests/cases, shared by the runners, the schema checks and the per-case
// tests of the TypeScript packages.
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JSONSchemaType } from 'ajv';
import { jsonDocument } from '../../scripts/json-document.mts';

export const casesDir = join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'), 'tests', 'cases');

/**
 * The cases of the legacy language packages (docs/spec/runtime.md#transition): a copy of tests/cases as the legacy
 * packages passed them when they moved, with their expected errors in the former form `{code, template, line, col}`.
 */
export const legacyCasesDir = join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'), 'legacy', 'tests', 'cases');

/** The ids `group/name` of every case directory of `directory`, sorted. */
export function caseIds(directory: string = casesDir): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter(group => group.isDirectory())
    .flatMap(group => readdirSync(join(directory, group.name), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => `${group.name}/${entry.name}`))
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

/** The content of an options.json at `path`, as a case or another template tree has it; a missing file is no options. */
export function readCaseOptions(path: string): CaseOptions {
  return existsSync(path) ? optionsDocument.read(path) : {};
}

/** The content of the options.json of a case; a case without options.json has no options. */
export function caseOptions(id: string, directory: string = casesDir): CaseOptions {
  return readCaseOptions(join(directory, id, 'options.json'));
}
