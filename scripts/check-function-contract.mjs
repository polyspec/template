#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const contract = JSON.parse(readFileSync(resolve(root, 'contracts/functions.json'), 'utf8'));
assert.equal(contract.schema, 1, 'function contract schema must be 1');
assert.equal(contract.contractVersion, '0.0.1', 'function contract version must be 0.0.1');

const expected = new Map();
for (const fn of contract.canonical) {
  assert.match(fn.name, /^[a-z][a-z0-9_]*$/, `invalid canonical function name ${fn.name}`);
  assert.ok(!expected.has(fn.name), `duplicate canonical function ${fn.name}`);
  assert.ok(Number.isInteger(fn.minArgs) && fn.minArgs >= 0, `${fn.name} has invalid minArgs`);
  assert.ok(Number.isInteger(fn.maxArgs) && (fn.maxArgs === -1 || fn.maxArgs >= fn.minArgs), `${fn.name} has invalid maxArgs`);
  for (const language of ['typescript', 'go', 'rust', 'php']) {
    assert.deepEqual(fn.support?.[language], { ast: 'pass', gen: 'pass' }, `${fn.name} lacks complete ${language} support`);
  }
  expected.set(fn.name, [fn.minArgs, fn.maxArgs]);
}

function pairs(source, expression, normalize = value => Number(value)) {
  return [...source.matchAll(expression)].map(match => [match[1], normalize(match[2]), normalize(match[3])]);
}

const files = {
  typescript: ['packages/template-ts/src/functions/encoding.ts', 'packages/template-ts/src/functions/string.ts', 'packages/template-ts/src/functions/collection.ts', 'packages/template-ts/src/functions/number.ts', 'packages/template-ts/src/functions/date.ts'],
  go: ['packages/template-go/functions/encoding.go', 'packages/template-go/functions/string.go', 'packages/template-go/functions/collection.go', 'packages/template-go/functions/number.go', 'packages/template-go/functions/date.go'],
  rust: ['packages/template-rust/src/functions/encoding.rs', 'packages/template-rust/src/functions/string.rs', 'packages/template-rust/src/functions/collection.rs', 'packages/template-rust/src/functions/number.rs', 'packages/template-rust/src/functions/date.rs'],
  php: ['packages/template-php/src/Functions/Encoding.php', 'packages/template-php/src/Functions/Strings.php', 'packages/template-php/src/Functions/Collection.php', 'packages/template-php/src/Functions/Numbers.php', 'packages/template-php/src/Functions/Dates.php'],
};
const patterns = {
  typescript: [/([a-z][a-z0-9_]*):\s*\{\s*min:\s*(\d+),\s*max:\s*(Infinity|-?\d+)/gs],
  go: [/"([a-z][a-z0-9_]*)":\s*\{\s*(\d+)\s*,\s*(-?\d+)/gs],
  rust: [/"([a-z][a-z0-9_]*)"\s*,\s*BuiltIn\s*\{\s*min:\s*(\d+),\s*max:\s*([^,}]+)/gs],
  php: [/'([a-z][a-z0-9_]*)'\s*=>\s*\['min'\s*=>\s*(\d+),\s*'max'\s*=>\s*(PHP_INT_MAX|-?\d+)/gs],
};

for (const [language, paths] of Object.entries(files)) {
  const source = paths.map(path => readFileSync(resolve(root, path), 'utf8')).join('\n');
  const found = new Map();
  for (const pattern of patterns[language]) {
    for (const [name, min, rawMax] of pairs(source, pattern, value => (value.trim() === 'Infinity' || (language === 'rust' && value.trim() === 'usize::MAX') || (language === 'php' && (value.trim() === 'PHP_INT_MAX' || Number(value) > 1000000))) ? -1 : Number(value))) {
      assert.ok(!found.has(name), `${language} duplicates ${name}`);
      found.set(name, [min, rawMax]);
    }
  }
  assert.deepEqual([...found.keys()].sort(), [...expected.keys()].sort(), `${language} function names differ from contract`);
  for (const [name, arity] of expected) assert.deepEqual(found.get(name), arity, `${language}.${name} arity differs from contract`);
}

const observed = new Set();
for (const entry of contract.observed) {
  assert.ok(!observed.has(`${entry.category}:${entry.name}`), `duplicate observed symbol ${entry.category}:${entry.name}`);
  observed.add(`${entry.category}:${entry.name}`);
  assert.ok(['canonical', 'rewrite', 'context-bound', 'rejected'].includes(entry.status), `invalid status for ${entry.name}`);
  if (entry.status === 'canonical') assert.ok(expected.has(entry.name), `${entry.name} is not canonical`);
  if (entry.status === 'rewrite') assert.ok(expected.has(entry.target), `${entry.name} rewrite target is not canonical`);
  if (entry.status === 'rejected') assert.notEqual(entry.category, 'direct', `${entry.name} direct call cannot be rejected without a reason`);
}

process.stdout.write(`function contract: ${expected.size} canonical functions, ${observed.size} observed symbols, four-language registry parity passed\n`);
