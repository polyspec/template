#!/usr/bin/env node
// The environment of the Python package (T23.2), legacy/packages/python/.venv, and the python of its bin. The Makefile reads it
// with `node scripts/python-venv.mts` and scripts/python-toolchain.mts imports it, so the path is written once. It imports
// only node: modules, so make reads it before make install-packages.
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The environment of the Python package relative to the root. */
export function pythonPackageEnvironment(): string {
  return 'legacy/packages/python/.venv';
}

/** The python of the environment of the Python package relative to the root. */
export function pythonPackageCommandPath(): string {
  return posix.join(pythonPackageEnvironment(), 'bin', 'python');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.stdout.write(`${pythonPackageEnvironment()}\n`);
