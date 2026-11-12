// The declaration of ast-validator.mjs, which scripts/generate-ast-validator.mts generates from
// contracts/schema/ast.schema.json with ajv standalone validation code (AST-10).
import type { ValidateFunction } from 'ajv';
import type { Template } from './ast.js';

/** Validates a value against contracts/schema/ast.schema.json, recording every error in `errors`. */
export declare const validateTemplate: ValidateFunction<Template>;
