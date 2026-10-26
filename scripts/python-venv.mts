#!/usr/bin/env node
// The environment of the Python package (T23.2). config/parity.json declares the command of the implementation python,
// the python of that environment, which make parity-check of kit runs; the environment is the directory of its bin. The
// Makefile reads it with `node scripts/python-venv.mts` and scripts/python-toolchain.mts imports it, so the path is
// written once. It imports only node: modules and parity-config.mts, which imports only node: modules too, so make reads
// it before make install-packages.
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readParityConfig } from './parity-config.mts';

/** The command of the implementation python of config/parity.json, relative to the root, such as `packages/python/.venv/bin/python`. */
export function pythonPackageCommandPath(): string {
  const command = readParityConfig().implementations.find(implementation => implementation.name === 'python')?.command;
  if (command === undefined || posix.basename(posix.dirname(command)) !== 'bin' || posix.basename(command) !== 'python') {
    throw new Error('config/parity.json declares no command <environment>/bin/python for the implementation python');
  }
  return command;
}

/** The environment of the Python package relative to the root, such as `packages/python/.venv`. */
export function pythonPackageEnvironment(): string {
  return posix.dirname(posix.dirname(pythonPackageCommandPath()));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.stdout.write(`${pythonPackageEnvironment()}\n`);
