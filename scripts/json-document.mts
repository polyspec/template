// The JSON documents that the scripts read, each described once by its type and its JSON Schema: a document is parsed
// and validated by ajv, so a script reads a value of its type or fails with the file and the errors of the schema.
import { readFileSync } from 'node:fs';
import { Ajv, type Schema } from 'ajv';

const ajv = new Ajv({ allErrors: true });

/**
 * A JSON document of type T: `check` validates a value, such as one that an untyped module returns, `parse` a text and
 * `read` a file; each fails with the source and the errors.
 */
export interface JsonDocument<T> {
  check(value: unknown, source: string): T;
  parse(text: string, source: string): T;
  read(path: string): T;
}

/** The document `what` with the JSON Schema `schema`, which describes the type T. */
export function jsonDocument<T>(what: string, schema: Schema): JsonDocument<T> {
  const validate = ajv.compile<T>(schema);
  const check = (value: unknown, source: string): T => {
    if (validate(value)) return value;
    throw new Error(`${source} is no ${what}: ${ajv.errorsText(validate.errors)}`);
  };
  const parse = (text: string, source: string): T => check(parseJson(text, source), source);
  return { check, parse, read: path => parse(readFileSync(path, 'utf8'), path) };
}

/** The value of a JSON text whose shape the caller does not read, or an error that names `source`. */
export function parseJson(text: string, source: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch (error) {
    throw new Error(`${source} is no JSON text: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** The value of a JSON file whose shape the caller does not read. */
export function readJson(path: string): unknown {
  return parseJson(readFileSync(path, 'utf8'), path);
}
