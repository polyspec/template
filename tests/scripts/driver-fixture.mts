// The files that a copy of tests/runner/drivers.mts needs (T22.5-5-1): the drivers and every module they import,
// reached by walking the relative static imports that oxc-parser records for each module, so a module that the drivers
// come to import is copied with no list to keep. The modules import packages of node_modules (smol-toml), which the copy
// links to the node_modules of this checkout. The tests that copy the drivers into a temporary checkout use these files.
import { copyFileSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from 'oxc-parser';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** The data files that the driver modules read at run time: python-venv.mts reads the venv of the python
 * implementation from the parity declaration through parity-config.mts. */
const DRIVER_DATA_FILES = ['config/parity.json'];

/** The checkout-relative paths of tests/runner/drivers.mts and of every module that it imports, directly or through
 * another module; a module that does not parse fails. */
export function driverModules(): string[] {
  const pending = ['tests/runner/drivers.mts'];
  const reached = new Set<string>();
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (reached.has(file)) continue;
    reached.add(file);
    const parsed = parseSync(file, readFileSync(path.join(ROOT, file), 'utf8'));
    if (parsed.errors.length > 0) throw new Error(`${file} does not parse: ${parsed.errors.map(error => error.message).join('; ')}`);
    for (const { moduleRequest } of parsed.module.staticImports) {
      if (moduleRequest.value.startsWith('.')) pending.push(path.normalize(path.join(path.dirname(file), moduleRequest.value)));
    }
  }
  return [...reached];
}

/** The checkout-relative paths of the drivers, of the modules they import and of the data files they read. */
const DRIVER_FILES = [...driverModules(), ...DRIVER_DATA_FILES];

/** Copies DRIVER_FILES of this checkout into `directory`, keeping each path, and links its node_modules there. */
export function copyDriverFiles(directory: string) {
  for (const file of DRIVER_FILES) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    copyFileSync(path.join(ROOT, file), path.join(directory, file));
  }
  symlinkSync(path.join(ROOT, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
}
