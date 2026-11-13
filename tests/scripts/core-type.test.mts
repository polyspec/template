// T-4, T-6 and GN-6a of binding: a generated binding builds and reads the value of an enum and of a record as the Rust
// type that the unit names in `core_type`; the generator reads no Rust source and refuses a target whose unit names
// none. The test reads every enum and every record of packages/rust/interface.json and the sources of packages/rust/src:
// the unit names `polyspec_template::<Type>`, the type is one `pub enum` or `pub struct` of the core, or one `pub type`
// that names such a type, the crate root exports the name, the variants of the enum are the variants of the unit, and
// each field of the record is a `pub` field of the struct. A unit without a core type, or with a name that the core does
// not hold, fails here before a binding is generated.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CRATE = 'polyspec_template';

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isObject) : []);
const words = (name: unknown): string[] => (Array.isArray(name) ? name.map(String) : [String(name)]);
const upperCamel = (name: unknown): string => words(name).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('');

// The Rust sources of the core without their comments, read recursively from packages/rust/src.
const sources = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sources(file);
    return entry.name.endsWith('.rs') ? [readFileSync(file, 'utf8').replace(/\/\/.*$/gmu, '')] : [];
  });

/** The texts between the brace of each `pub <kind> <name> {` at the start of a line and the brace that closes it. */
function bodies(core: string, kind: 'enum' | 'struct', name: string): string[] {
  const found: string[] = [];
  for (const start of core.matchAll(new RegExp(`^pub ${kind} ${name}\\s*\\{`, 'gmu'))) {
    let depth = 0;
    for (let at = start.index + start[0].length - 1; at < core.length; at += 1) {
      if (core[at] === '{') depth += 1;
      if (core[at] === '}') depth -= 1;
      if (depth === 0) {
        found.push(core.slice(start.index + start[0].length, at));
        break;
      }
    }
  }
  return found;
}

/** The parts of a body between the commas that no brace, bracket or parenthesis holds, without attributes. */
function items(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let part = '';
  for (const character of body.replace(/#\[[^\]]*\]/gu, '')) {
    if ('{[(<'.includes(character)) depth += 1;
    if ('}])>'.includes(character)) depth -= 1;
    if (character === ',' && depth === 0) {
      parts.push(part.trim());
      part = '';
    } else {
      part += character;
    }
  }
  return [...parts, part.trim()].filter((text) => text !== '');
}

test('every enum and record names a core type that the core holds', () => {
  const contract: unknown = JSON.parse(readFileSync(path.join(ROOT, 'packages/rust/interface.json'), 'utf8'));
  assert.ok(isObject(contract), 'packages/rust/interface.json is no object');
  const core = sources(path.join(ROOT, 'packages/rust/src')).join('\n');
  const root = readFileSync(path.join(ROOT, 'packages/rust/src/lib.rs'), 'utf8').replace(/\/\/.*$/gmu, '');
  const exported = new Set([...root.matchAll(/^pub use [^;]*;/gmu)].flatMap((use) => use[0].match(/\b[A-Z]\w*/gu) ?? []));
  for (const declared of root.matchAll(/^pub (?:enum|struct|type) (\w+)/gmu)) exported.add(String(declared[1]));
  const units = list(contract['units']).filter((unit) => unit['kind'] === 'enum' || unit['kind'] === 'record');
  assert.ok(units.length > 0, 'packages/rust/interface.json declares no enum and no record');
  const findings: string[] = [];
  for (const unit of units) {
    const id = String(unit['id']);
    const kind = unit['kind'] === 'enum' ? 'enum' : 'struct';
    const coreType = unit['core_type'];
    if (typeof coreType !== 'string') {
      findings.push(`${id} names no core_type`);
      continue;
    }
    const named = new RegExp(`^${CRATE}::(\\w+)$`, 'u').exec(coreType)?.[1];
    if (named === undefined) {
      findings.push(`${id} names ${coreType}, which is no ${CRATE}::<Type>`);
      continue;
    }
    if (!exported.has(named)) findings.push(`${id} names ${coreType}, which packages/rust/src/lib.rs does not export`);
    // A `pub type <named> = <Type>;` gives the name of the type that holds the values.
    const aliased = [...core.matchAll(new RegExp(`^pub type ${named} = (\\w+);`, 'gmu'))].map((alias) => String(alias[1]));
    const declared = bodies(core, kind, aliased.length === 1 ? String(aliased[0]) : named);
    const body = declared[0];
    if (body === undefined || declared.length !== 1) {
      findings.push(`${id} names ${coreType}, and packages/rust/src declares ${String(declared.length)} pub ${kind} of that name`);
      continue;
    }
    if (kind === 'enum') {
      const coreVariants = items(body).map((item) => /^\w+/u.exec(item)?.[0] ?? item);
      const variants = list(unit['variants']).map((variant) => upperCamel(variant['name']));
      if (variants.length === 0) findings.push(`${id} declares no variant`);
      if (variants.toSorted().join(',') !== coreVariants.toSorted().join(',')) {
        findings.push(`${id} has the variants ${variants.join(', ')}, and ${coreType} ${coreVariants.join(', ')}`);
      }
    } else {
      const coreFields = items(body).map((item) => /^pub (?:r#)?(\w+)\s*:/u.exec(item)?.[1] ?? '');
      const fields = list(unit['fields']).map((field) => words(field['name']).join('_'));
      if (fields.length === 0) findings.push(`${id} declares no field`);
      for (const field of fields) {
        if (!coreFields.includes(field)) findings.push(`${id} has the field ${field}, and ${coreType} the pub fields ${coreFields.join(', ')}`);
      }
    }
  }
  assert.deepEqual(findings, []);
});
