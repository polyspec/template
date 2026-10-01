// Built-in function table and the host function contract (docs/spec/functions.md).
import { collectionFunctions } from './collection.js';
import { dateFunctions } from './date.js';
import { encodingFunctions } from './encoding.js';
import type { BuiltIn, FunctionContext } from './helpers.js';
import { numberFunctions } from './number.js';
import { stringFunctions } from './string.js';

export { FunctionError, toNumber, type BuiltIn, type Env, type FunctionContext } from './helpers.js';

// A function that a host registers under a name (FUN-43). It receives template values, except that a
// native object, also inside a list or map, is the original instance (VAL-18). Its return value is bound by the host
// binding rules and an error it throws becomes E_RUNTIME_HOST_FUNCTION.
export type HostFunction = (args: unknown[], context: FunctionContext) => unknown;

export const builtins: ReadonlyMap<string, BuiltIn> = new Map<string, BuiltIn>([
  ...Object.entries(encodingFunctions),
  ...Object.entries(stringFunctions),
  ...Object.entries(collectionFunctions),
  ...Object.entries(numberFunctions),
  ...Object.entries(dateFunctions),
]);
