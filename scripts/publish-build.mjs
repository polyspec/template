#!/usr/bin/env node
// Publishes a built executable or shared library to the path that the checks run, and only when its bytes changed
// (T19.6-1):
//
//   node scripts/publish-build.mjs <source> <destination>
//
// cargo links target/release/<binary> again on every build, also when nothing changed, and go build rewrites its
// output: each build leaves a new file. macOS checks a new executable file on its first run, which took 29.8 s for
// the Rust CLI on a loaded machine and failed the 10 s limit of a conformance call. The destination keeps its file
// while the bytes are equal; changed bytes are written to <destination>.next-<pid> with the mode of the source and
// renamed, so a reader never finds the file missing or half written.
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Publishes `source` to `destination`; returns whether the destination changed. */
export function publishBuild(source, destination) {
  if (!existsSync(source)) throw new Error(`${source} does not exist; build it first`);
  if (existsSync(destination) && readFileSync(source).equals(readFileSync(destination))) return false;
  mkdirSync(dirname(destination), { recursive: true });
  const next = `${destination}.next-${process.pid}`;
  copyFileSync(source, next);
  chmodSync(next, statSync(source).mode & 0o777);
  renameSync(next, destination);
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [source, destination, ...rest] = process.argv.slice(2);
  if (!source || !destination || rest.length) {
    console.error('usage: node scripts/publish-build.mjs <source> <destination>');
    process.exit(2);
  }
  const changed = publishBuild(source, destination);
  console.log(`publish-build: ${destination} ${changed ? `now holds the build of ${source}` : `is current with ${source}`}`);
}
