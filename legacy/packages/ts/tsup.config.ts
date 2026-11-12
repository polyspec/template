import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'tsup';

const entry = {
  index: 'src/index.ts',
  render: 'src/render.ts',
  node: 'src/node/index.ts',
  // The decode of a template AST has an entry of its own, so its modules form a chunk without the runtime that the other
  // entries share, and a bundle that imports only decodeTemplate takes no runtime code (T24.32).
  decode: 'src/decode.ts',
};

export default defineConfig((options) => ({
  entry,
  // One module format: the entries share their runtime modules through chunks, so a value that one
  // entry creates, such as a bound map (VAL-22), is an instance of the class that every other entry
  // checks.
  format: ['esm'],
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
