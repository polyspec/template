// The commands of the tools that this checkout installed: npm links the command of each package into node_modules/.bin
// (T24.2).
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '.bin');

/** The TypeScript compiler; run it as `node <tsc> <arguments>`. */
export const tsc = join(bin, 'tsc');
/** The Vitest command line; run it as `node <vitest> <arguments>`. */
export const vitest = join(bin, 'vitest');
/** The Playwright command line; run it as `node <playwright> <arguments>`. */
export const playwright = join(bin, 'playwright');
