// Imports the copy of tests/runner/drivers.mts that copyDriverFiles of driver-fixture.mts placed in a directory. The
// import names its module by a computed path, so TypeScript knows nothing of its exports; the copy is checked against
// the exports of the drivers module, so a test reads them with their types.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** The module tests/runner/drivers.mts, of which the copy is a copy. */
type DriversModule = typeof import('../runner/drivers.mts');

/** The kind (typeof) of each export of the drivers module; the type requires an entry for every export. */
const EXPORT_KINDS: Record<keyof DriversModule, 'string' | 'object' | 'function'> = {
  root: 'string',
  build: 'function',
  drivers: 'object',
  prepare: 'function',
  invoke: 'function',
  selectLanguages: 'function',
};

/** Whether `value` is a module namespace with every export of the drivers module, each of its kind. */
function isDriversModule(value: unknown): value is DriversModule {
  return typeof value === 'object' && value !== null
    && Object.entries(EXPORT_KINDS).every(([name, kind]) => {
      const member: unknown = Reflect.get(value, name);
      return typeof member === kind && member !== null;
    });
}

/** The exports of the copy of the drivers in `directory`; a copy that lacks an export fails with its path. */
export async function importDriverCopy(directory: string): Promise<DriversModule> {
  const file = path.join(directory, 'tests/runner/drivers.mts');
  const loaded: unknown = await import(pathToFileURL(file).href);
  if (!isDriversModule(loaded)) throw new Error(`${file} does not export the drivers module: ${Object.keys(EXPORT_KINDS).join(', ')}`);
  return loaded;
}
