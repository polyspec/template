// The files that a copy of tests/runner/drivers.mjs needs (T22.5-5-1): the drivers import these modules, so a copy without
// one of them fails to load. The modules import packages of node_modules (smol-toml), which the copy links to the
// node_modules of this checkout. The tests that copy the drivers into a temporary checkout use this list, and the drivers
// test checks that the list holds every module the drivers import.
import { copyFileSync, mkdirSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** The checkout-relative paths of the drivers and of the modules they import. */
export const DRIVER_FILES = [
  'tests/runner/drivers.mjs',
  'scripts/publish-build.mjs',
  'scripts/python-toolchain.mjs',
  'scripts/python-venv.mjs',
  // python-venv.mjs reads the venv of the python implementation from the parity declaration.
  'config/parity.json',
  'scripts/test-progress/step.mjs',
];

/** Copies DRIVER_FILES of this checkout into `directory`, keeping each path, and links its node_modules there. */
export function copyDriverFiles(directory) {
  for (const file of DRIVER_FILES) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    copyFileSync(path.join(ROOT, file), path.join(directory, file));
  }
  symlinkSync(path.join(ROOT, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
}
