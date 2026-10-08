#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const contract = JSON.parse(readFileSync(resolve(root, 'packages/template-compiler/functions.json'), 'utf8'));
assert.equal(contract.schema, 1, 'function contract schema must be 1');
assert.equal(contract.contractVersion, '0.0.1', 'function contract version must be 0.0.1');
assert.deepEqual(Object.keys(contract), ['schema', 'contractVersion', 'syntax', 'canonical'], 'the function contract holds only its schema, version, syntax and canonical functions');

const expected = new Map();
for (const fn of contract.canonical) {
  assert.match(fn.name, /^[a-z][a-z0-9_]*$/, `invalid canonical function name ${fn.name}`);
  assert.ok(!expected.has(fn.name), `duplicate canonical function ${fn.name}`);
  assert.ok(Number.isInteger(fn.minArgs) && fn.minArgs >= 0, `${fn.name} has invalid minArgs`);
  assert.ok(Number.isInteger(fn.maxArgs) && (fn.maxArgs === -1 || fn.maxArgs >= fn.minArgs), `${fn.name} has invalid maxArgs`);
  for (const language of ['typescript', 'go', 'rust', 'php', 'python']) {
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
  python: ['packages/template-python/src/polyspec/template/functions.py'],
};
const patterns = {
  typescript: [/([a-z][a-z0-9_]*):\s*\{\s*min:\s*(\d+),\s*max:\s*(Infinity|-?\d+)/gs],
  go: [/"([a-z][a-z0-9_]*)":\s*\{\s*(\d+)\s*,\s*(-?\d+)/gs],
  rust: [/"([a-z][a-z0-9_]*)"\s*,\s*BuiltIn\s*\{\s*min:\s*(\d+),\s*max:\s*([^,}]+)/gs],
  php: [/'([a-z][a-z0-9_]*)'\s*=>\s*\['min'\s*=>\s*(\d+),\s*'max'\s*=>\s*(PHP_INT_MAX|-?\d+)/gs],
  python: [/['"](\w+)['"]:\s*BuiltIn\(\s*(\d+),\s*(math\.inf|-?\d+)/g],
};

for (const [language, paths] of Object.entries(files)) {
  const source = paths.map(path => readFileSync(resolve(root, path), 'utf8')).join('\n');
  const found = new Map();
  for (const pattern of patterns[language]) {
    for (const [name, min, rawMax] of pairs(source, pattern, value => (value.trim() === 'Infinity' || (language === 'rust' && value.trim() === 'usize::MAX') || (language === 'php' && (value.trim() === 'PHP_INT_MAX' || Number(value) > 1000000)) || (language === 'python' && value.trim() === 'math.inf')) ? -1 : Number(value))) {
      assert.ok(!found.has(name), `${language} duplicates ${name}`);
      found.set(name, [min, rawMax]);
    }
  }
  assert.deepEqual([...found.keys()].sort(), [...expected.keys()].sort(), `${language} function names differ from contract`);
  for (const [name, arity] of expected) assert.deepEqual(found.get(name), arity, `${language}.${name} arity differs from contract`);
}

process.stdout.write(`function contract: ${expected.size} canonical functions, five-language registry parity passed\n`);
