// Reads the JSON documents of the showcase: each reader checks the shape that its caller uses and fails with an error
// that names the document and the part that is missing, instead of a cast that trusts the text.
import { readFileSync } from 'node:fs';

/** A JSON object: a value that is no array and no null. */
export type JsonObject = Record<string, unknown>;

export function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The parsed JSON text of a file, unknown until a reader checks it. */
export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** `value` as an object, or an error naming `what`. */
export function object(value: unknown, what: string): JsonObject {
  if (!isObject(value)) throw new Error(`${what} is no JSON object`);
  return value;
}

/** `value` as a list, or an error naming `what`. */
export function list(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${what} is no JSON list`);
  return value;
}

/** `value` as a string, or an error naming `what`. */
export function text(value: unknown, what: string): string {
  if (typeof value !== 'string') throw new Error(`${what} is no string`);
  return value;
}

/** `value` as a number, or an error naming `what`. */
export function number(value: unknown, what: string): number {
  if (typeof value !== 'number') throw new Error(`${what} is no number`);
  return value;
}

/** The files of a compiled AST manifest, name to the path of its artifact relative to the manifest. */
export function manifestFiles(manifest: unknown, what: string): Map<string, string> {
  const files = object(object(manifest, what).files, `${what}: files`);
  return new Map(Object.entries(files).map(([name, entry]) => [name, text(object(entry, `${what}: files.${name}`).path, `${what}: files.${name}.path`)]));
}
