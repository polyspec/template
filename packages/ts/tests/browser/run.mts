#!/usr/bin/env node
// Runs the browser test. Starting the static server is a step without a time limit: the step
// prints its start, the output of the server and its result with the elapsed time, and ends when
// the server reports that it listens, or fails when the server exits first. The server listens on a
// port that the system assigns; Playwright receives the address of the listening line in
// TEMPLATE_BROWSER_URL, runs the cases, each with its own timeout (playwright.config.ts), and the
// server is stopped.
//
//   node packages/ts/tests/browser/run.mts [--server-command <command>] [<playwright arguments>]
//
// The server runs as `<command> packages/ts/tests/browser/server.mts`; the command is the Node.js of this process unless
// --server-command names another, such as a test's wrapper that starts the server slowly (T20.2). No command is looked
// up on PATH.
import { type ChildProcess, spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { playwright } from '../../../../scripts/tools.mts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const READY = /^listening on (http:\/\/\S+)$/m;
const seconds = (milliseconds: number): string => `${(milliseconds / 1000).toFixed(1)}s`;

/** Starts the server and resolves the server process and its address once it listens; rejects when it exits first. */
function startServer(command: string): Promise<{ server: ChildProcess; url: string }> {
  const step = 'start the static server';
  process.stdout.write(`▶ ${step}\n`);
  const started = Date.now();
  const server = spawn(command, [join(root, 'packages/ts/tests/browser/server.mts')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolvePromise, reject) => {
    let output = '';
    let ready = false;
    const print = (data: Buffer): void => {
      for (const line of String(data).split('\n').filter(Boolean)) process.stdout.write(`[server] ${line}\n`);
    };
    server.stdout.on('data', (data: Buffer) => {
      print(data);
      if (ready) return;
      output += data;
      const listening = READY.exec(output);
      if (listening) {
        ready = true;
        process.stdout.write(`✔ ${step} (${seconds(Date.now() - started)})\n`);
        const url = listening[1];
        if (url === undefined) throw new Error(`the listening line of the static server names no address: ${listening[0]}`);
        resolvePromise({ server, url });
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

const args = process.argv.slice(2);
const serverCommand = args[0] === '--server-command' ? args.splice(0, 2)[1] : process.execPath;
let server: ChildProcess | undefined;
try {
  if (!serverCommand) throw new Error('--server-command needs a command');
  const started = await startServer(serverCommand);
  server = started.server;
  // Playwright starts by its command in node_modules/.bin.
  const tests = spawn(process.execPath, [playwright, 'test', ...args], {
    cwd: join(root, 'packages/ts'),
    env: { ...process.env, TEMPLATE_BROWSER_URL: started.url },
    stdio: 'inherit',
  });
  const { code, signal } = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolvePromise => tests.on('close', (code, signal) => resolvePromise({ code, signal })));
  if (signal) process.stdout.write(`✖ playwright ended on ${signal}\n`);
  process.exitCode = code ?? 1;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  server?.kill();
}
