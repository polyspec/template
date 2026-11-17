// Bundles the test page script with the adapter and CodeMirror into dist/browser and serves that folder to the tests.
//
// The language service parses with the Rust core through the WebAssembly entry of @polyspec/template (T28.122), which loads
// its module at its import with a top-level await and fetches each .wasm file at the URL beside the module that imports
// it. So the page is an ES module that a browser loads from an HTTP origin, with the two WebAssembly modules, that of the
// core and that of the JSON package that the core imports, beside it: a script of the format iife holds no top-level
// await, and a blank page fetches no module. The server is of this run and listens on a port that the system gives.
//
// The bundle leaves node:fs/promises external: the generated entry imports it in its branch of a file: URL, which a
// browser never takes, and esbuild cannot resolve it for a browser (binding B2.461). When the entry of binding bundles
// for a browser without it, the line leaves this file.
import { copyFileSync, createReadStream, existsSync, mkdirSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const directory = dirname(fileURLToPath(import.meta.url));
const served = join(directory, '..', '..', 'dist', 'browser');

/** The environment variable that holds the origin of the server for the tests, which run in other processes. */
export const ORIGIN = 'TEMPLATE_CODEMIRROR_ORIGIN';

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm' };
const PAGE = '<!doctype html><html><body><div id="editor"></div><script type="module" src="/page.mjs"></script></body></html>';

// The folder of the WebAssembly entry of a package, as this package resolves it.
const wasmFolder = (entry: string): string => dirname(fileURLToPath(import.meta.resolve(entry)));

function listen(server: Server): Promise<number> {
  return new Promise((done, failed) => {
    server.once('error', failed);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') failed(new Error('the server of the page listens on no port'));
      else done(address.port);
    });
  });
}

export default async function setup(): Promise<() => Promise<void>> {
  mkdirSync(served, { recursive: true });
  await build({
    entryPoints: [join(directory, 'page.ts')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    external: ['node:fs/promises'],
    outfile: join(served, 'page.mjs'),
    logLevel: 'warning',
  });
  copyFileSync(join(wasmFolder('@polyspec/template/wasm'), 'template_wasm_bg.wasm'), join(served, 'template_wasm_bg.wasm'));
  copyFileSync(join(wasmFolder('@polyspec/json/wasm'), 'json_wasm_bg.wasm'), join(served, 'json_wasm_bg.wasm'));

  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (path === '/') {
      response.writeHead(200, { 'content-type': TYPES['.html'] }).end(PAGE);
      return;
    }
    const file = resolve(served, `.${path}`);
    const type = TYPES[extname(file)];
    if (!file.startsWith(served + sep) || type === undefined || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': type });
    createReadStream(file).pipe(response);
  });
  process.env[ORIGIN] = `http://127.0.0.1:${await listen(server)}`;
  return () => new Promise<void>((done, failed) => server.close(error => (error ? failed(error) : done())));
}
