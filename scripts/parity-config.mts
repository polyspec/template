// The implementations of config/parity.json, the one declaration of the language set of the repository
// (kit parity), as the scripts read them. It imports only node: modules, since make reads the environment of the Python
// package through scripts/python-venv.mts before make install-packages installs ajv, so a hand-written check validates
// the parts that the scripts read.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const parityFile = fileURLToPath(new URL('../config/parity.json', import.meta.url));

/** An implementation: its name, the implementation whose generated programs it shares (`shares`), and, when its runner does not start the tool of the checkout, its command. */
export interface ParityImplementation {
  name: string;
  shares?: string;
  command?: string;
}

/** The parts of config/parity.json that the scripts read. */
export interface ParityConfig {
  implementations: ParityImplementation[];
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function implementation(value: unknown, index: number): ParityImplementation {
  if (!isObject(value) || typeof value.name !== 'string' || (value.shares !== undefined && typeof value.shares !== 'string') || (value.command !== undefined && typeof value.command !== 'string')) {
    throw new Error(`implementation ${index} of config/parity.json has no name, or a shares or a command that is no string`);
  }
  return {
    name: value.name,
    ...(value.shares === undefined ? {} : { shares: value.shares }),
    ...(value.command === undefined ? {} : { command: value.command }),
  };
}

/** The implementations of config/parity.json. */
export function readParityConfig(): ParityConfig {
  const value: unknown = JSON.parse(readFileSync(parityFile, 'utf8'));
  if (!isObject(value) || !Array.isArray(value.implementations)) {
    throw new Error('config/parity.json declares no list implementations');
  }
  return { implementations: value.implementations.map(implementation) };
}
