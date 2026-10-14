// The canonical function contract packages/compiler/functions.json (FUN), described once: its type and its JSON Schema.
import { join } from 'node:path';
import { jsonDocument } from './json-document.mts';

/** The support of a function in one language: the result in the AST and in the generated mode. */
export interface FunctionSupport {
  ast: string;
  gen: string;
}

/** A canonical function: its name, its arity (maxArgs -1 for no maximum), its return type, effects and support. */
export interface CanonicalFunction {
  name: string;
  minArgs: number;
  maxArgs: number;
  returns: string;
  effects: string;
  support: Record<string, FunctionSupport>;
}

/** The function contract. */
export interface FunctionContract {
  schema: number;
  contractVersion: string;
  syntax: Record<string, unknown>;
  canonical: CanonicalFunction[];
}

export const functionContractDocument = jsonDocument<FunctionContract>('function contract', {
  type: 'object',
  required: ['schema', 'contractVersion', 'syntax', 'canonical'],
  properties: {
    schema: { type: 'integer' },
    contractVersion: { type: 'string' },
    syntax: { type: 'object' },
    canonical: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'minArgs', 'maxArgs', 'returns', 'effects', 'support'],
        properties: {
          name: { type: 'string' },
          minArgs: { type: 'integer' },
          maxArgs: { type: 'integer' },
          returns: { type: 'string' },
          effects: { type: 'string' },
          support: {
            type: 'object',
            additionalProperties: { type: 'object', required: ['ast', 'gen'], properties: { ast: { type: 'string' }, gen: { type: 'string' } } },
          },
        },
      },
    },
  },
});

/** The path of the contract under the root of the repository. */
export const functionContractPath = (root: string): string => join(root, 'packages/compiler/functions.json');
