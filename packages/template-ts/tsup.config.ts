import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'tsup';

const entry = {
  index: 'src/index.ts',
  render: 'src/render.ts',
  node: 'src/node/index.ts',
};

export default defineConfig((options) => ({
  entry,
  // One module format: the entries share their runtime modules through chunks, so a value that one
  // entry creates, such as a bound map (VAL-22), is an instance of the class that every other entry
  // checks.
  format: ['esm'],
  dts: { compilerOptions: { types: ['node'] } },
  clean: true,
  sourcemap: true,
  platform: 'neutral',
  target: 'es2022',
  outExtension() {
    return { js: '.mjs' };
  },
  // The CommonJS file of each entry loads its ES module with `require`, which Node.js supports for
  // modules without top-level await (engines >= 26), so both formats share one runtime. It lies in the
  // output directory of the build, `--out-dir` when the package is built elsewhere.
  onSuccess: async () => {
    for (const name of Object.keys(entry)) {
      writeFileSync(join(options.outDir ?? 'dist', `${name}.cjs`), `'use strict';\nmodule.exports = require('./${name}.mjs');\n`);
    }
  },
}));
