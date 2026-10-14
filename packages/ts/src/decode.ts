// Decoding of the AST JSON (AST-10): the canonical JSON of a template AST, validated against
// contracts/schema/ast.schema.json, read as the `Template` of the package.
import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';
import schema from '../../../contracts/schema/ast.schema.json' with { type: 'json' };
import type { Template } from './ast.js';

/** The failure of {@link decodeTemplate}: the JSON is not a template AST of the schema. */
export class AstDecodeError extends Error {
  /** The JSON Pointer (RFC 6901) of the first invalid value, `''` for the root. */
  readonly path: string;

  /** Creates the error of the invalid value at `path`, with the schema rule that it breaks. */
  constructor(path: string, reason: string) {
    super(`invalid template AST at ${path === '' ? 'the root' : path}: ${reason}`);
    this.name = 'AstDecodeError';
    this.path = path;
  }
}

// The validator compiles on the first decode, so a program that never decodes an AST does not
// compile the schema.
let validator: ValidateFunction<Template> | undefined;

function validate(): ValidateFunction<Template> {
  // verbose adds the schema and the value of each error, from which `firstInvalid` picks the
  // node type that the value names.
  validator ??= new Ajv({ strict: true, verbose: true }).compile<Template>(schema);
  return validator;
}

function depth(error: ErrorObject): number {
  return error.instancePath === '' ? 0 : error.instancePath.split('/').length;
}

// The node type that a schema of the AST declares, as its `properties.type.const`.
function declaredType(error: ErrorObject): unknown {
  const parent = error.parentSchema as { properties?: { type?: { const?: unknown } } } | undefined;
  return parent?.properties?.type?.const;
}

// A value that matches no branch of a `oneOf` fails every branch, so ajv reports an error of each
// branch. The innermost failing value is the first invalid node. An error of the schema of another
// node type than the one the value names, and a `const` (it rejects a branch, such as the kind of a
// literal whose value has another type), only reject a branch; the first other error explains the
// value, and a value that no branch explains, such as one of an unknown node type, fails the `oneOf`.
function firstInvalid(errors: readonly ErrorObject[]): ErrorObject {
  const deepest = Math.max(...errors.map(depth));
  const candidates = errors.filter(error => depth(error) === deepest);
  const rejectsBranch = (error: ErrorObject): boolean => {
    if (error.keyword === 'const') return true;
    const declared = declaredType(error);
    const data = error.data as { type?: unknown } | null;
    return declared !== undefined && typeof data === 'object' && data !== null && declared !== data.type;
  };
  return candidates.find(error => error.keyword !== 'oneOf' && !rejectsBranch(error)) ?? candidates.find(error => error.keyword === 'oneOf') ?? candidates[0]!;
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
 * @throws {@link AstDecodeError} naming the JSON Pointer of the first invalid node when the value is
 * not a template AST.
 */
export function decodeTemplate(json: unknown): Template {
  const value: unknown = typeof json === 'string' ? JSON.parse(json) : json;
  const check = validate();
  if (check(value)) return value;
  const error = firstInvalid(check.errors ?? []);
  throw new AstDecodeError(error.instancePath, reason(error));
}
