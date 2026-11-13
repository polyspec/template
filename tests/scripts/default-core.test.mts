// GN-6i, U-2 of binding: a parameter or a field of packages/rust/interface.json with a {literal} or {const} default of
// a number, bool or text type reaches the core as Option<T>, and names in `default_core` the constant of the core that
// the core uses for None, because the generator refuses such a default without it and asserts at compile time that the
// constant equals the declared value. The test reads every such default and requires `default_core` to name a
// constant `polyspec_template::<NAME>` that packages/rust/src/lib.rs declares or exports.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCALARS = new Set(['bool', 'int', 'int64', 'uint', 'float', 'text']);

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isObject) : []);
const name = (item: Json): string => (Array.isArray(item['name']) ? item['name'].map(String).join('_') : String(item['name']));

test('every literal or const default of a scalar names the constant of the core in default_core', () => {
  const contract: unknown = JSON.parse(readFileSync(path.join(ROOT, 'packages/rust/interface.json'), 'utf8'));
  assert.ok(isObject(contract), 'packages/rust/interface.json is no object');
  const lib = readFileSync(path.join(ROOT, 'packages/rust/src/lib.rs'), 'utf8');
  const items: { where: string; item: Json }[] = [];
  for (const unit of list(contract['units'])) {
    for (const field of list(unit['fields'])) items.push({ where: `the field ${name(field)} of ${String(unit['id'])}`, item: field });
    for (const member of list(unit['members'])) {
      for (const parameter of list(member['parameters'])) items.push({ where: `the parameter ${name(parameter)} of ${String(member['id'])}`, item: parameter });
    }
  }
  const declared = items.filter(({ item }) => {
    const value = item['default'];
    return typeof item['type'] === 'string' && SCALARS.has(item['type']) && isObject(value) && ('literal' in value || 'const' in value);
  });
  assert.ok(declared.length > 0, 'packages/rust/interface.json declares no literal or const default of a scalar');
  const findings: string[] = [];
  for (const { where, item } of declared) {
    const core = item['default_core'];
    if (typeof core !== 'string') {
      findings.push(`${where} has no default_core`);
      continue;
    }
    const constant = /^polyspec_template::([A-Z][A-Z0-9_]*)$/u.exec(core)?.[1];
    if (constant === undefined) findings.push(`${where} names ${core}, which is no constant polyspec_template::<NAME>`);
    else if (!new RegExp(`\\bpub const ${constant}\\b|\\bpub use [^;]*\\b${constant}\\b`, 'u').test(lib)) {
      findings.push(`${where} names ${core}, which packages/rust/src/lib.rs neither declares nor exports`);
    }
  }
  assert.deepEqual(findings, []);
});
