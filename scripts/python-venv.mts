#!/usr/bin/env node
// The environment of the Python package (T23.2). config/parity.json declares the command of the implementation python,
// the python of that environment, which make parity-check of kit runs; the environment is the directory of its bin. The
// Makefile reads it with `node scripts/python-venv.mts` and scripts/python-toolchain.mts imports it, so the path is
// written once. It imports only node: modules, so make reads it before make install-packages.
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const parityFile = fileURLToPath(new URL('../config/parity.json', import.meta.url));

interface Parity {
  implementations?: { name?: unknown; command?: unknown }[];
}

/** The command of the implementation python of config/parity.json, relative to the root, such as `var/python/venv/bin/python`. */
export function pythonPackageCommandPath(): string {
  const parity = JSON.parse(readFileSync(parityFile, 'utf8')) as Parity;
  const python = parity.implementations?.find(implementation => implementation.name === 'python');
  const command = python?.command;
  if (typeof command !== 'string' || posix.basename(posix.dirname(command)) !== 'bin' || posix.basename(command) !== 'python') {
    throw new Error('config/parity.json declares no command <environment>/bin/python for the implementation python');
  }
  return command;
}

/** The environment of the Python package relative to the root, such as `var/python/venv`. */
export function pythonPackageEnvironment(): string {
  return posix.dirname(posix.dirname(pythonPackageCommandPath()));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.stdout.write(`${pythonPackageEnvironment()}\n`);
