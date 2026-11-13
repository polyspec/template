// T-9, GN-6v and GN-6a of binding: a generated binding builds and matches the core types of the AST and of the loader
// by the names that packages/rust/interface.json gives. A variant unit names its Rust enum in `core_type`, and each case
// is a struct variant of that enum whose fields are the fields of the case by their contract names; a record is the
// struct of the core whose fields are the fields of the record. A tuple variant or another field name does not compile
// against the generated match. The test reads the enums and structs of packages/rust/src/ast.rs and loader.rs and
// compares them with the variant units and with the records of the same name.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCES = ['packages/rust/src/ast.rs', 'packages/rust/src/loader.rs'];

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isObject) : []);
const snake = (name: unknown): string => (Array.isArray(name) ? name.map(String).join('_') : String(name));
const camel = (name: string): string => name.split(/[_\s]+/u).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');

/** The text between the brace at `open` and the brace that closes it. */
function braced(text: string, open: number): string {
  let depth = 0;
  for (let at = open; at < text.length; at += 1) {
    if (text[at] === '{') depth += 1;
    if (text[at] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, at);
    }
  }
  throw new Error(`no closing brace after ${String(open)}`);
}

/** The body of the `pub enum` or `pub struct` named `name` in the sources, without comments, or undefined. */
function body(source: string, kind: 'enum' | 'struct', name: string): string | undefined {
  const start = new RegExp(`\\bpub ${kind} ${name}\\s*\\{`, 'u').exec(source);
  return start === null ? undefined : braced(source, start.index + start[0].length - 1).replace(/\/\/.*$/gmu, '');
}

/** The names of the fields of a struct body or of a struct variant body, without `r#`. */
const fieldNames = (text: string): string[] => [...text.matchAll(/(?:^|,)\s*(?:pub\s+)?(?:r#)?(\w+)\s*:/gu)].map((match) => String(match[1]));

/** The variants of an enum body: the name, and the field names of a struct variant or `tuple` of a tuple variant. */
function variants(text: string): Map<string, string[] | 'tuple'> {
  const found = new Map<string, string[] | 'tuple'>();
  let at = 0;
  const pattern = /(\w+)\s*([{(,]|$)/gu;
  while (at < text.length) {
    pattern.lastIndex = at;
    const match = pattern.exec(text);
    if (match === null) break;
    const name = String(match[1]);
    const open = match.index + match[0].length - 1;
    if (match[2] === '{') {
      const inner = braced(text, open);
      found.set(name, fieldNames(inner));
      at = open + inner.length + 2;
    } else if (match[2] === '(') {
      found.set(name, 'tuple');
      at = text.indexOf(')', open) + 1;
    } else {
      found.set(name, []);
      at = match.index + match[0].length;
    }
  }
  return found;
}

test('the variants and records of the contract have the shapes of the core types', () => {
  const contract: unknown = JSON.parse(readFileSync(path.join(ROOT, 'packages/rust/interface.json'), 'utf8'));
  assert.ok(isObject(contract), 'packages/rust/interface.json is no object');
  const source = SOURCES.map((file) => readFileSync(path.join(ROOT, file), 'utf8')).join('\n');
  const findings: string[] = [];
  const units = list(contract['units']);
  const variantUnits = units.filter((unit) => unit['kind'] === 'variant');
  assert.ok(variantUnits.length > 0, 'packages/rust/interface.json has no variant unit');
  for (const unit of variantUnits) {
    const id = String(unit['id']);
    const coreType = unit['core_type'];
    if (typeof coreType !== 'string') {
      findings.push(`${id} names no core_type`);
      continue;
    }
    const enumBody = body(source, 'enum', coreType.split('::').at(-1) ?? '');
    if (enumBody === undefined) {
      findings.push(`${id} names ${coreType}, which ${SOURCES.join(' and ')} do not declare`);
      continue;
    }
    const core = variants(enumBody);
    for (const kase of list(unit['cases'])) {
      const name = camel(String(kase['value']));
      const fields = list(kase['fields']).map((field) => snake(field['name']));
      const shape = core.get(name);
      if (shape === undefined) findings.push(`${id} case ${name} is no variant of ${coreType}`);
      else if (shape === 'tuple') findings.push(`${coreType}::${name} is a tuple variant, and the contract names its fields ${fields.join(', ')}`);
      else if (shape.join(',') !== fields.join(',')) findings.push(`${coreType}::${name} has the fields ${shape.join(', ')}, and the contract ${fields.join(', ')}`);
    }
  }
  for (const unit of units.filter((record) => record['kind'] === 'record')) {
    const structBody = body(source, 'struct', camel(String(unit['id'])));
    if (structBody === undefined) continue;
    const core = fieldNames(structBody);
    const fields = list(unit['fields']).map((field) => snake(field['name']));
    if (core.join(',') !== fields.join(',')) findings.push(`the record ${String(unit['id'])} has the fields ${fields.join(', ')}, and the core struct ${core.join(', ')}`);
  }
  assert.deepEqual(findings, []);
});
