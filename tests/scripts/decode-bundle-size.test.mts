// Tests the size of the code that a browser bundle takes for decodeTemplate (T24.32). hyper decodes each template that its
// board client fetches with decodeTemplate, and an esbuild bundle of that import alone from @polyspec/template/render 0.0.8
// was 127,057 bytes minified, 13,479 gzip: the standalone validator of the AST schema with every $ref inlined (110,656
// bytes) and the runtime chunk that every entry shares (15.5 KB). With each definition of the schema as one function (ajv
// inlineRefs: false) and the decode entry in a chunk without the runtime, the bundle of either entry is 86,538 bytes
// minified, 7,490 gzip. The budget is about 4 % and 5 % above those numbers; it fails a change that brings the runtime or
// the inlined copies back. The package is the build of packages/ts, which make build-ts writes.
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MINIFIED_BUDGET = 90_000;
const GZIP_BUDGET = 7_900;

/** The minified and gzip sizes of a browser bundle that imports only decodeTemplate from `specifier`. */
async function bundleOf(specifier: string): Promise<{ minified: number; gzip: number }> {
  const result = await build({
    stdin: { contents: `import { decodeTemplate } from ${JSON.stringify(specifier)};\nglobalThis.decodeTemplate = decodeTemplate;\n`, resolveDir: ROOT, loader: 'js' },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    minify: true,
    write: false,
    logLevel: 'error',
  });
  const [output] = result.outputFiles;
  assert.ok(output !== undefined, `esbuild wrote no bundle of ${specifier}`);
  return { minified: output.contents.byteLength, gzip: gzipSync(output.contents, { level: 9 }).byteLength };
}

for (const specifier of ['@polyspec/template/decode', '@polyspec/template/render']) {
  test(`a browser bundle of decodeTemplate from ${specifier} stays within ${MINIFIED_BUDGET} bytes minified and ${GZIP_BUDGET} gzip`, async () => {
    const size = await bundleOf(specifier);
    assert.ok(size.minified <= MINIFIED_BUDGET && size.gzip <= GZIP_BUDGET, `${specifier}: ${size.minified} bytes minified, ${size.gzip} gzip`);
  });
}
