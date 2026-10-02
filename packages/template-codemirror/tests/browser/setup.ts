// Bundles the test page script with the adapter and CodeMirror into dist/browser/page.js.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const directory = dirname(fileURLToPath(import.meta.url));

/** The bundled page script. */
export const pageScript = join(directory, '..', '..', 'dist', 'browser', 'page.js');

export default async function setup(): Promise<void> {
  await build({
    entryPoints: [join(directory, 'page.ts')],
    bundle: true,
    format: 'iife',
    target: 'es2022',
    outfile: pageScript,
    logLevel: 'warning',
  });
}
