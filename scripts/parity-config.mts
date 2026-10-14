// The implementations and profiles of config/parity.json, the one declaration of the language set of the repository
// (kit parity), as the scripts read them. It imports only node: modules, since make reads the environment of the Python
// package through scripts/python-venv.mts before make install-packages installs ajv, so a hand-written check validates
// the parts that the scripts read.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const parityFile = fileURLToPath(new URL('../config/parity.json', import.meta.url));

/** An implementation: its name and, when its runner does not start the tool of the checkout, its command. */
export interface ParityImplementation {
  name: string;
  command?: string;
}

/** A profile: its name and its implementations. */
export interface ParityProfile {
  name: string;
  implementations: string[];
}

/** The parts of config/parity.json that the scripts read. */
export interface ParityConfig {
  implementations: ParityImplementation[];
  profiles: ParityProfile[];
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');

function implementation(value: unknown, index: number): ParityImplementation {
  if (!isObject(value) || typeof value.name !== 'string' || (value.command !== undefined && typeof value.command !== 'string')) {
    throw new Error(`implementation ${index} of config/parity.json has no name or a command that is no string`);
  }
  return value.command === undefined ? { name: value.name } : { name: value.name, command: value.command };
}

function profile(value: unknown, index: number): ParityProfile {
  if (!isObject(value) || typeof value.name !== 'string' || !isStrings(value.implementations)) {
    throw new Error(`profile ${index} of config/parity.json has no name or no list of implementations`);
  }
  return { name: value.name, implementations: value.implementations };
}

/** The implementations and profiles of config/parity.json. */
export function readParityConfig(): ParityConfig {
  const value: unknown = JSON.parse(readFileSync(parityFile, 'utf8'));
  if (!isObject(value) || !Array.isArray(value.implementations) || !Array.isArray(value.profiles)) {
    throw new Error('config/parity.json declares no lists implementations and profiles');
  }
  return { implementations: value.implementations.map(implementation), profiles: value.profiles.map(profile) };
}

/** The implementations of the profile `name`; fails when config/parity.json declares no such profile. */
export function profileImplementations(name: string): string[] {
  const found = readParityConfig().profiles.find(item => item.name === name);
  if (found === undefined) throw new Error(`config/parity.json declares no profile ${name}`);
  return found.implementations;
}
