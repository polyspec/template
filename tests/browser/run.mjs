#!/usr/bin/env node
// Runs the browser test. Starting the static server is a step without a time limit: the step
// prints its start, the output of the server and its result with the elapsed time, and ends when
// the server reports that it listens, or fails when the server exits first. The server listens on a
// port that the system assigns; Playwright receives the address of the listening line in
// TEMPLATE_BROWSER_URL, runs the cases, each with its own timeout (playwright.config.ts), and the
// server is stopped.
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const READY = /^listening on (http:\/\/\S+)$/m;
const seconds = milliseconds => `${(milliseconds / 1000).toFixed(1)}s`;

/** Starts the server and resolves the server process and its address once it listens; rejects when it exits first. */
function startServer() {
  const step = 'start the static server';
  process.stdout.write(`▶ ${step}\n`);
  const started = Date.now();
  // The server is started by name, as a command of PATH.
  const server = spawn('node', [join(root, 'tests/browser/server.mjs')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolvePromise, reject) => {
    let output = '';
    let ready = false;
    const print = data => {
      for (const line of String(data).split('\n').filter(Boolean)) process.stdout.write(`[server] ${line}\n`);
    };
    server.stdout.on('data', data => {
      print(data);
      if (ready) return;
      output += data;
      const listening = READY.exec(output);
      if (listening) {
        ready = true;
        process.stdout.write(`✔ ${step} (${seconds(Date.now() - started)})\n`);
        resolvePromise({ server, url: listening[1] });
      }
    });
    server.stderr.on('data', print);
    server.on('error', error => reject(error));
    server.on('exit', (code, signal) => {
      if (ready) return;
      process.stdout.write(`✖ ${step} (${seconds(Date.now() - started)})\n`);
      reject(new Error(`the static server exited ${signal ? `on ${signal}` : `with ${code}`} before it listened`));
    });
  });
}

let server;
try {
  const started = await startServer();
  server = started.server;
  const playwright = spawn(join(root, 'node_modules/.bin/playwright'), ['test', ...process.argv.slice(2)], {
    cwd: root,
    env: { ...process.env, TEMPLATE_BROWSER_URL: started.url },
    stdio: 'inherit',
  });
  const { code, signal } = await new Promise(resolvePromise => playwright.on('close', (code, signal) => resolvePromise({ code, signal })));
  if (signal) process.stdout.write(`✖ playwright ended on ${signal}\n`);
  process.exitCode = code ?? 1;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
} finally {
  server?.kill();
}
