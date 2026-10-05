// The command line entries of the tools that this checkout installed, by the path of their packages: npm installs
// every dependency as a copy and writes no bin link (.npmrc), so `npx <tool>` finds no command (T18.4).
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

/** Returns the file of the bin entry `bin` of the package `name`, resolved from the repository root. */
function entry(name, bin) {
  const manifest = require.resolve(`${name}/package.json`);
  const bins = require(manifest).bin;
  return join(dirname(manifest), typeof bins === 'string' ? bins : bins[bin]);
}

/** The TypeScript compiler; run it as `node <tsc> <arguments>`. */
export const tsc = entry('typescript', 'tsc');
/** The Vitest command line; run it as `node <vitest> <arguments>`. */
export const vitest = entry('vitest', 'vitest');
/** The Playwright command line; run it as `node <playwright> <arguments>`. */
export const playwright = entry('@playwright/test', 'playwright');
