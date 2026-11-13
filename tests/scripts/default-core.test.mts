// GN-6i, U-2 of binding: a parameter or a field of packages/rust/interface.json with a {literal} or {const} default of
// a number, bool or text type reaches the core as Option<T>, and names in `default_core` the constant of the core that
// the core uses for None, because the generator refuses such a default without it and asserts at compile time that the
// constant equals the declared value. The test reads every such default and requires `default_core` to name a
// constant `polyspec_template::<NAME>` that packages/rust/src/lib.rs declares or exports. A {literal} default of an enum
// unit names in `default_core` a constant of the core enum, which the generator asserts with `matches!` to be the variant
// of the declared value; the second test requires the constant and its declaration in packages/rust/src to be that
// variant, so a contract default that differs from the default of the core fails here before a binding is generated.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCALARS = new Set(['bool', 'int', 'int64', 'uint', 'float', 'text']);

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isObject) : []);
const name = (item: Json): string => (Array.isArray(item['name']) ? item['name'].map(String).join('_') : String(item['name']));
const pascal = (item: Json): string =>
  (Array.isArray(item['name']) ? item['name'].map(String) : [String(item['name'])]).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');

// The Rust sources of the core, read recursively from packages/rust/src.
const sources = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sources(file);
    return entry.name.endsWith('.rs') ? [readFileSync(file, 'utf8')] : [];
  });

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

test('every literal default of an enum unit names the constant of the core that is the variant of its value', () => {
  const contract: unknown = JSON.parse(readFileSync(path.join(ROOT, 'packages/rust/interface.json'), 'utf8'));
  assert.ok(isObject(contract), 'packages/rust/interface.json is no object');
  const lib = readFileSync(path.join(ROOT, 'packages/rust/src/lib.rs'), 'utf8');
  const core = sources(path.join(ROOT, 'packages/rust/src')).join('\n');
  const units = new Map(list(contract['units']).map((unit) => [String(unit['id']), unit]));
  const items: { where: string; item: Json; unit: Json }[] = [];
  const add = (where: string, item: Json): void => {
    const type = item['type'];
    const unit = isObject(type) && typeof type['unit'] === 'string' ? units.get(type['unit']) : undefined;
    const value = item['default'];
    if (unit !== undefined && unit['kind'] === 'enum' && isObject(value) && 'literal' in value) items.push({ where, item, unit });
  };
  for (const unit of list(contract['units'])) {
    for (const field of list(unit['fields'])) add(`the field ${name(field)} of ${String(unit['id'])}`, field);
    for (const member of list(unit['members'])) {
      for (const parameter of list(member['parameters'])) add(`the parameter ${name(parameter)} of ${String(member['id'])}`, parameter);
    }
  }
  assert.ok(items.length > 0, 'packages/rust/interface.json declares no literal default of an enum unit');
  const findings: string[] = [];
  for (const { where, item, unit } of items) {
    const literal = (item['default'] as Json)['literal'];
    const variant = list(unit['variants']).find((candidate) => candidate['value'] === literal);
    if (variant === undefined) {
      findings.push(`${where} declares ${JSON.stringify(literal)}, which is no value of the enum ${String(unit['id'])}`);
      continue;
    }
    const named = item['default_core'];
    if (typeof named !== 'string') {
      findings.push(`${where} has no default_core`);
      continue;
    }
    const constant = /^polyspec_template::([A-Z][A-Z0-9_]*)$/u.exec(named)?.[1];
    if (constant === undefined) {
      findings.push(`${where} names ${named}, which is no constant polyspec_template::<NAME>`);
      continue;
    }
    if (!new RegExp(`\\bpub const ${constant}\\b|\\bpub use [^;]*\\b${constant}\\b`, 'u').test(lib)) {
      findings.push(`${where} names ${named}, which packages/rust/src/lib.rs neither declares nor exports`);
      continue;
    }
    const type = typeof unit['core_type'] === 'string' ? unit['core_type'].split('::').at(-1) ?? '' : pascal(unit);
    const declared = new RegExp(`\\bpub const ${constant}: ${type} = ${type}::(\\w+);`, 'u').exec(core)?.[1];
    if (declared !== pascal(variant)) {
      findings.push(`${where} declares ${JSON.stringify(literal)}, the variant ${type}::${pascal(variant)}, and ${constant} is ${declared === undefined ? 'no constant of that type' : `${type}::${declared}`}`);
    }
  }
  assert.deepEqual(findings, []);
});
