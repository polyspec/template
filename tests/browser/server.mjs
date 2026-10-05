#!/usr/bin/env node
// Static file server for the browser test: serves the repository root on a port of 127.0.0.1 that the
// system assigns, so that concurrent runs of any checkout never share a server, and prints
// `listening on http://127.0.0.1:<port>` with that port once it accepts connections.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.map': 'application/json' };

const server = createServer((request, response) => {
  const path = normalize(decodeURIComponent((request.url ?? '/').split('?')[0]));
  const file = join(root, path);
  if (!file.startsWith(root)) {
    response.writeHead(403).end();
    return;
  }
  let stats;
  try {
    stats = statSync(file);
  } catch {
    response.writeHead(404).end();
    return;
  }
  if (!stats.isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(response);
});
server.listen(0, '127.0.0.1', () => console.log(`listening on http://127.0.0.1:${server.address().port}`));
