// Tests that the browser test uses a server of its own run: while another server holds the port
// 127.0.0.1:4173, which the static server used for every run, the static server listens on a port that
// the system assigns and Playwright loads the page from that port.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Holds 127.0.0.1:4173 with a server that answers every request with 404; a port that another process
// holds already is the same condition, so the test then holds nothing.
function holdPort() {
  const foreign = createServer((request, response) => response.writeHead(404).end('foreign server'));
  return new Promise((resolvePromise, reject) => {
    foreign.once('error', error => (error.code === 'EADDRINUSE' ? resolvePromise(null) : reject(error)));
    foreign.listen(4173, '127.0.0.1', () => resolvePromise(foreign));
  });
}

// The test runs every browser case; `make test-browser` builds the package before this test runs.
test('the browser test runs on its own server while another server holds 127.0.0.1:4173', { timeout: 120_000 }, async () => {
  const foreign = await holdPort();
  try {
    const run = spawn(process.execPath, [path.join(ROOT, 'tests/browser/run.mjs')], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    run.stdout.on('data', data => { output += data; process.stdout.write(data); });
    run.stderr.on('data', data => { output += data; process.stderr.write(data); });
    const code = await new Promise(resolvePromise => run.on('close', resolvePromise));
    assert.equal(code, 0, output);
    const port = /\[server\] listening on http:\/\/127\.0\.0\.1:(\d+)\n/.exec(output)?.[1];
    assert.ok(port !== undefined, output);
    assert.notEqual(port, '4173');
    assert.match(output, /\d+ passed/);
  } finally {
    await new Promise(resolvePromise => (foreign ? foreign.close(resolvePromise) : resolvePromise()));
  }
});
