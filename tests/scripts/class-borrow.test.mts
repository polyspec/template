// GN-6h, CK-67 of binding: a parameter of packages/rust/interface.json whose type is a class unit of the contract, or an
// optional of one, names in `core` the borrow that the core takes of the instance: `&`, `&mut` or `value`. The generator
// reads no Rust source, so it takes the lock of the instance from that item and asserts at compile time that the core
// path takes that borrow. The test reads every such parameter, requires `core`, and requires each `pub fn` of
// packages/rust/src with the name of the core path to take the parameter in that form, so a borrow that differs from the
// core fails here before a binding is generated. A member of a callback unit names no borrow, because language code
// implements it.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isObject) : []);
const name = (item: Json): string => (Array.isArray(item['name']) ? item['name'].map(String).join('_') : String(item['name']));

// The Rust sources of the core, read recursively from packages/rust/src.
const sources = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sources(file);
    return entry.name.endsWith('.rs') ? [readFileSync(file, 'utf8')] : [];
  });

// The class unit that a type names: the unit itself or the unit of an optional.
const classOf = (type: unknown, classes: Map<string, Json>): Json | undefined => {
  if (!isObject(type)) return undefined;
  if (typeof type['unit'] === 'string') return classes.get(type['unit']);
  return 'optional' in type ? classOf(type['optional'], classes) : undefined;
};

test('every class parameter names the borrow that the core takes of it', () => {
  const contract: unknown = JSON.parse(readFileSync(path.join(ROOT, 'packages/rust/interface.json'), 'utf8'));
  assert.ok(isObject(contract), 'packages/rust/interface.json is no object');
  const core = sources(path.join(ROOT, 'packages/rust/src')).join('\n');
  const classes = new Map(
    list(contract['units'])
      .filter((unit) => unit['kind'] === 'class' && unit['origin'] === 'generated')
      .map((unit) => [String(unit['id']), unit]),
  );
  const findings: string[] = [];
  let checked = 0;
  for (const unit of list(contract['units'])) {
    if (unit['kind'] === 'callback') continue;
    for (const member of list(unit['members'])) {
      for (const parameter of list(member['parameters'])) {
        const where = `the parameter ${name(parameter)} of ${String(member['id'])}`;
        const unitOfType = classOf(parameter['type'], classes);
        if (unitOfType === undefined) {
          if ('core' in parameter) findings.push(`${where} is no class parameter and names core`);
          continue;
        }
        checked += 1;
        const borrow = parameter['core'];
        if (borrow !== '&' && borrow !== '&mut' && borrow !== 'value') {
          findings.push(`${where} has no core`);
          continue;
        }
        const corePath = isObject(member['core']) ? String(member['core']['path']) : '';
        const fn = corePath.split('::').at(-1) ?? '';
        const type = String(unitOfType['core_type']).split('::').at(-1) ?? '';
        const signatures = [...core.matchAll(new RegExp(`\\bpub fn ${fn}(?:<[^>]*>)?\\(([^)]*)\\)`, 'gu'))].map((found) => found[1] ?? '');
        if (signatures.length === 0) {
          findings.push(`${where}: packages/rust/src declares no pub fn ${fn}`);
          continue;
        }
        const wanted = { '&': `&${type}`, '&mut': `&mut ${type}`, value: type }[borrow];
        for (const signature of signatures) {
          const taken = new RegExp(`\\b${name(parameter)}: ((?:Option<)?(?:&(?:mut )?)?${type})\\b`, 'u').exec(signature)?.[1]?.replace('Option<', '');
          if (taken !== wanted) findings.push(`${where} names ${borrow}, and a pub fn ${fn} takes ${taken ?? 'no such parameter'}`);
        }
      }
    }
  }
  assert.ok(checked > 0, 'packages/rust/interface.json declares no class parameter');
  assert.deepEqual(findings, []);
});
