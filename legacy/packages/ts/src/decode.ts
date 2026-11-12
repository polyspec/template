// Decoding of the AST JSON (AST-10): the canonical JSON of a template AST, validated against
// contracts/schema/ast.schema.json, read as the `Template` of the package.
// The validator is ajv's standalone validation code of the schema, which scripts/generate-ast-validator.mts generates (make
// ast-validator), so the package compiles no schema at run time and imports no ajv (T25.6-2).
import type { ErrorObject } from 'ajv';
import type { Template } from './ast.js';
import { validateTemplate } from './ast-validator.mjs';

/** The failure of {@link decodeTemplate}: the JSON is not a template AST of the schema. */
export class AstDecodeError extends Error {
  /** The JSON Pointer (RFC 6901) of the invalid node, `''` for the root (AST-10). */
  readonly path: string;

  /** Creates the error of the invalid value at `path`, with the schema rule that it breaks. */
  constructor(path: string, reason: string) {
    super(`invalid template AST at ${path === '' ? 'the root' : path}: ${reason}`);
    this.name = 'AstDecodeError';
    this.path = path;
  }
}

function depth(error: ErrorObject): number {
  return error.instancePath === '' ? 0 : error.instancePath.split('/').length;
}

// Whether the error `a` is chosen over `b` as the invalid node (AST-10): a deeper instance location,
// a smaller pointer at the same depth (the pointers name properties of the schema and indexes, so
// UTF-16 order is code point order), or another keyword than an if at the same location. The schema
// selects the schema of a node by its type with if/then, so an error names a value of the node
// itself, and the errors of an enclosing if lie above it or carry no reason of their own.
function chosenOver(a: ErrorObject, b: ErrorObject): boolean {
  if (depth(a) !== depth(b)) return depth(a) > depth(b);
  if (a.instancePath !== b.instancePath) return a.instancePath < b.instancePath;
  return a.keyword !== 'if' && b.keyword === 'if';
}

function invalidNode(errors: readonly ErrorObject[]): ErrorObject {
  const [first, ...rest] = errors;
  if (first === undefined) throw new Error('ajv rejected the template AST without an error');
  return rest.reduce((found, error) => (chosenOver(error, found) ? error : found), first);
}

function reason(error: ErrorObject): string {
  const message = error.message ?? error.keyword;
  return error.keyword === 'additionalProperties' ? `${message}: ${String(error.params['additionalProperty'])}` : message;
}

/**
 * Decodes the canonical JSON of a template AST (AST-7) into the `Template` that `parse` returns. `json` is
 * the JSON text, a string, or its parsed value. Every node is validated against `contracts/schema/ast.schema.json`
 * (AST-8, AST-10), so a program renders the result without parsing a source (RT-41).
 *
 * @throws SyntaxError when `json` is a string that is not JSON text.
 * @throws {@link AstDecodeError} naming the JSON Pointer of the invalid node when the value is
 * not a template AST.
 */
export function decodeTemplate(json: unknown): Template {
  const value: unknown = typeof json === 'string' ? JSON.parse(json) : json;
  if (validateTemplate(value)) return value;
  const error = invalidNode(validateTemplate.errors ?? []);
  throw new AstDecodeError(error.instancePath, reason(error));
}
