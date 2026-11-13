// T-4, T-6 and GN-6a of binding: a generated binding builds and reads the value of an enum and of a record as the Rust
// type that the unit names in `core_type`; the generator reads no Rust source and refuses a target whose unit names
// none. The test reads every enum and every record of packages/rust/interface.json and the sources of packages/rust/src:
// the unit names `polyspec_template::<Type>`, the type is one `pub enum` or `pub struct` of the core, or one `pub type`
// that names such a type, the crate root exports the name, the variants of the enum are the variants of the unit, and
// each field of the record is a `pub` field of the struct. A unit without a core type, or with a name that the core does
// not hold, fails here before a binding is generated.
// CNF-20 (GN-6i, GN-6ac, GN-6aa and T-1 of binding): the struct of a record has exactly the fields of the record, each
// in the Rust type that the contract type of the field states, because a generated crate writes a struct literal of
// those fields and passes `None` for a field with a default that was left out. The second test compares the type of
// every field, the fields of the struct with those of the record, and the lifetime parameter of a struct that holds a
// callback.
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
  for (const start of core.matchAll(new RegExp(`^pub ${kind} ${name}(?:<[^>{]*>)?\\s*\\{`, 'gmu'))) {
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
  // The arrow of a function type holds a `>` that closes nothing.
  for (const character of body.replace(/#\[[^\]]*\]/gu, '').replaceAll('->', '\u2192')) {
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

/** The Rust types of an integer of the contract, which a binding narrows to the type of the core (GN-6ac). */
const INTEGERS: Record<string, string[]> = { uint: ['usize', 'u64', 'u32', 'u16', 'u8'], int: ['isize', 'i64', 'i32', 'i16', 'i8'], int64: ['i64'] };
const SCALARS: Record<string, string> = { bool: 'bool', float: 'f64', text: 'String', bytes: 'Vec<u8>', latin1: 'Vec<u8>', path: 'PathBuf' };

/** A Rust type without spaces and without the path of a name of the core or of the standard library. */
const plain = (type: string): string => type.replaceAll(/\s+/gu, '').replaceAll(/\b(?:crate|super|std|polyspec_template)(?:::[a-z_]\w*)*::/gu, '');

/** Every combination of one text of each list. */
const combinations = (lists: string[][]): string[][] => lists.reduce<string[][]>((found, list) => found.flatMap((head) => list.map((item) => [...head, item])), [[]]);

test('every field of a record has in the core struct the type that the contract states', () => {
  const contract: unknown = JSON.parse(readFileSync(path.join(ROOT, 'packages/rust/interface.json'), 'utf8'));
  assert.ok(isObject(contract), 'packages/rust/interface.json is no object');
  const core = sources(path.join(ROOT, 'packages/rust/src')).join('\n');
  const units = new Map(list(contract['units']).map((unit) => [String(unit['id']), unit]));
  const typeNames: Json = isObject(contract['types']) ? contract['types'] : {};
  // A `pub type <Name> = <Type>;` without parameters stands for its type, on both sides of the comparison.
  const aliases = [...core.matchAll(/^pub type (\w+) = ([^;]+);/gmu)].map((alias) => ({ name: String(alias[1]), type: plain(String(alias[2])) }));
  const expanded = (type: string): string => {
    let text = plain(type);
    for (let round = 0; round < aliases.length; round += 1) {
      const next = aliases.reduce((current, alias) => current.replaceAll(new RegExp(`(?<![\\w:])${alias.name}(?![\\w<])`, 'gu'), alias.type), text);
      if (next === text) break;
      text = next;
    }
    return text;
  };
  const coreName = (unit: Json): string => String(unit['core_type'] ?? unit['core']).split('::').at(-1) ?? '';
  const holdsCallback = (type: unknown, seen: Set<string>): boolean => {
    if (!isObject(type)) return false;
    const unit = typeof type['unit'] === 'string' && type['library'] === undefined ? units.get(type['unit']) : undefined;
    if (unit !== undefined) {
      if (unit['origin'] === 'callback') return true;
      if (unit['kind'] !== 'record' || seen.has(String(unit['id']))) return false;
      seen.add(String(unit['id']));
      return list(unit['fields']).some((field) => holdsCallback(field['type'], seen));
    }
    const parts: unknown[] = Array.isArray(type['tuple']) ? type['tuple'] : [];
    return [type['list'], type['map'], type['optional'], ...parts].some((inner) => holdsCallback(inner, seen));
  };
  /** The Rust types that hold a value of a contract type, or the reason why this test states none. */
  const rust = (type: unknown): string[] | string => {
    if (typeof type === 'string') {
      const scalar = SCALARS[type];
      if (scalar !== undefined) return [scalar];
      const integers = INTEGERS[type];
      if (integers !== undefined) return integers;
      const alias = typeNames[type];
      return isObject(alias) ? rust({ unit: alias['unit'] }) : `the test states no Rust type of ${type}`;
    }
    if (!isObject(type)) return `the test states no Rust type of ${JSON.stringify(type)}`;
    const wrapped = (inner: unknown, wrap: (text: string) => string): string[] | string => {
      const found = rust(inner);
      return typeof found === 'string' ? found : found.map(wrap);
    };
    if ('list' in type) return wrapped(type['list'], (text) => `Vec<${text}>`);
    if ('map' in type) return wrapped(type['map'], (text) => `binding_core::OrderedMap<${text}>`);
    if ('optional' in type) return wrapped(type['optional'], (text) => `Option<${text}>`);
    if (Array.isArray(type['tuple'])) {
      const tuple: unknown[] = type['tuple'];
      const parts = tuple.map(rust);
      const reason = parts.find((part) => typeof part === 'string');
      if (typeof reason === 'string') return reason;
      const lists = parts.filter((part): part is string[] => typeof part !== 'string');
      const tuples = combinations(lists).map((found) => `(${found.join(',')})`);
      // GN-6ac: a tuple whose parts have one type is also the array of that type.
      const one = tuple.every((part) => JSON.stringify(part) === JSON.stringify(tuple[0]));
      return one ? [...tuples, ...(lists[0] ?? []).map((item) => `[${item};${String(lists.length)}]`)] : tuples;
    }
    const unit = typeof type['unit'] === 'string' && type['library'] === undefined ? units.get(type['unit']) : undefined;
    if (unit === undefined) return `the test states no Rust type of ${JSON.stringify(type)}`;
    // GN-6aa: a callback inside a record is a box of the core trait with the lifetime of the struct.
    if (unit['origin'] === 'callback') return [`Box<dyn${coreName(unit)}+'a>`];
    if (unit['kind'] === 'record' && holdsCallback({ unit: unit['id'] }, new Set())) return [`${coreName(unit)}<'a>`];
    if (['enum', 'record', 'variant', 'alias'].includes(String(unit['kind'])) && typeof unit['core_type'] === 'string') return [coreName(unit)];
    return `the test states no Rust type of ${JSON.stringify(type)}`;
  };
  const records = [...units.values()].filter((unit) => unit['kind'] === 'record' && typeof unit['core_type'] === 'string');
  assert.ok(records.length > 0, 'packages/rust/interface.json declares no record with a core type');
  const findings: string[] = [];
  for (const unit of records) {
    const id = String(unit['id']);
    const typeName = coreName(unit);
    const aliased = [...core.matchAll(new RegExp(`^pub type ${typeName} = (\\w+);`, 'gmu'))].map((alias) => String(alias[1]));
    const struct = aliased.length === 1 ? String(aliased[0]) : typeName;
    const body = bodies(core, 'struct', struct)[0];
    if (body === undefined) {
      findings.push(`${id} names ${String(unit['core_type'])}, and packages/rust/src declares no pub struct of that name`);
      continue;
    }
    const life = new RegExp(`^pub struct ${struct}(<[^>{]*>)?\\s*\\{`, 'mu').exec(core)?.[1] ?? '';
    const expectedLife = holdsCallback({ unit: id }, new Set()) ? "<'a>" : '';
    if (plain(life) !== expectedLife) findings.push(`${id}: the struct ${struct} has the parameters ${life === '' ? 'none' : life}, and a record ${expectedLife === '' ? 'without a callback has none' : "with a callback has <'a>"}`);
    const coreFields = new Map<string, string>();
    for (const item of items(body)) {
      const field = /^(pub(?:\([^)]*\))?\s+)?(?:r#)?(\w+)\s*:\s*([\s\S]+)$/u.exec(item);
      if (field === null) findings.push(`${id}: the struct ${struct} has the item ${item}, which is no field`);
      else if (field[1]?.trim() !== 'pub') findings.push(`${id}: the field ${String(field[2])} of ${struct} is not pub`);
      else coreFields.set(String(field[2]), String(field[3]).replaceAll('\u2192', '->'));
    }
    const fields = list(unit['fields']);
    const names = fields.map((field) => words(field['name']).join('_'));
    for (const name of coreFields.keys()) {
      if (!names.includes(name)) findings.push(`${id}: the struct ${struct} has the field ${name}, which the record does not have`);
    }
    for (const field of fields) {
      const name = words(field['name']).join('_');
      const actual = coreFields.get(name);
      if (actual === undefined) {
        findings.push(`${id}: the struct ${struct} has no pub field ${name}`);
        continue;
      }
      const type = field['type'];
      const stated = rust(type);
      if (typeof stated === 'string') {
        findings.push(`${id}.${name}: ${stated}`);
        continue;
      }
      // GN-6i: a field with a default is an Option, and a field of an optional type is the Option of that type itself.
      const optional = isObject(type) && 'optional' in type;
      const expected = (field['default'] !== undefined && !optional ? stated.map((text) => `Option<${text}>`) : stated).map(expanded);
      if (!expected.includes(expanded(actual))) findings.push(`${id}.${name} is ${actual.replaceAll(/\s+/gu, ' ')} in ${struct}, and the contract states ${expected.join(' or ')}`);
    }
  }
  assert.deepEqual(findings, []);
});
