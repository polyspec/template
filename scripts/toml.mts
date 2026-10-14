// The TOML files that the scripts read (Cargo.toml, Cargo.lock, rust-toolchain.toml, pyproject.toml, mise.toml), parsed
// with smol-toml; each accessor names the value that it requires and fails when the file holds another kind of value.
import { readFileSync } from 'node:fs';
import { parse, TomlDate, type TomlTable, type TomlValue } from 'smol-toml';

export type { TomlTable, TomlValue };

/** The TOML file `path` as its root table. */
export function readToml(path: string): TomlTable {
  return parse(readFileSync(path, 'utf8'));
}

/** `value` as a table; fails with `what` when it is missing or no table. */
export function tomlTable(value: TomlValue | undefined, what: string): TomlTable {
  if (typeof value !== 'object' || Array.isArray(value) || value instanceof TomlDate) throw new Error(`${what} is no TOML table`);
  return value;
}

/** `value` as a string; fails with `what` when it is missing or no string. */
export function tomlString(value: TomlValue | undefined, what: string): string {
  if (typeof value !== 'string') throw new Error(`${what} is no TOML string`);
  return value;
}

/** `value` as an array; fails with `what` when it is missing or no array. */
export function tomlArray(value: TomlValue | undefined, what: string): TomlValue[] {
  if (!Array.isArray(value)) throw new Error(`${what} is no TOML array`);
  return value;
}
