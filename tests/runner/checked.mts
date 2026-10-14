// The JSON objects and the YAML documents that the runners and the tool tests read without a schema of their own,
// beside the JSON documents, the required values and the TOML files of scripts/json-document.mts, scripts/required.mts
// and scripts/toml.mts: a value of another kind fails with an error that names it instead of going on with a default.
import { parse as parseYaml } from 'yaml';
import { parseJson } from '../../scripts/json-document.mts';

/** Whether `value` is a JSON object, with string keys and values of any JSON type. */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The JSON text `text` parsed as an object, or an error that names `source`. */
export function parsedJsonObject(text: string, source: string): Record<string, unknown> {
  const value = parseJson(text, source);
  if (!isJsonObject(value)) throw new Error(`${source} is no JSON object`);
  return value;
}

/** The YAML document `text` as a mapping; `source` names the text in the error. */
export function yamlObject(text: string, source: string): Record<string, unknown> {
  const value: unknown = parseYaml(text);
  if (!isJsonObject(value)) throw new Error(`${source} is no YAML mapping`);
  return value;
}
