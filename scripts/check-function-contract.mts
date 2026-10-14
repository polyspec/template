#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compareText } from './compare-text.mts';

const root = resolve(import.meta.dirname, '..');
const contract = JSON.parse(readFileSync(resolve(root, 'packages/compiler/functions.json'), 'utf8'));
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

function pairs(source: string, expression: RegExp, normalize = (value: string): number => Number(value)): [string, number, number][] {
  return [...source.matchAll(expression)].map(match => {
    const [, name, min, max] = match;
    if (name === undefined || min === undefined || max === undefined) throw new Error(`${expression} matched without its name, minimum and maximum`);
    return [name, normalize(min), normalize(max)];
  });
}

const files = {
  typescript: ['packages/ts/src/functions/encoding.ts', 'packages/ts/src/functions/string.ts', 'packages/ts/src/functions/collection.ts', 'packages/ts/src/functions/number.ts', 'packages/ts/src/functions/date.ts'],
  go: ['packages/go/functions/encoding.go', 'packages/go/functions/string.go', 'packages/go/functions/collection.go', 'packages/go/functions/number.go', 'packages/go/functions/date.go'],
  rust: ['packages/rust/src/functions/encoding.rs', 'packages/rust/src/functions/string.rs', 'packages/rust/src/functions/collection.rs', 'packages/rust/src/functions/number.rs', 'packages/rust/src/functions/date.rs'],
  python: ['packages/python/src/polyspec/template/functions.py'],
};
const patterns: Record<string, RegExp[]> = {
  typescript: [/([a-z][a-z0-9_]*):\s*\{\s*min:\s*(\d+),\s*max:\s*(Infinity|-?\d+)/gs],
  go: [/"([a-z][a-z0-9_]*)":\s*\{\s*(\d+)\s*,\s*(-?\d+)/gs],
  rust: [/"([a-z][a-z0-9_]*)"\s*,\s*BuiltIn\s*\{\s*min:\s*(\d+),\s*max:\s*([^,}]+)/gs],
  python: [/['"](\w+)['"]:\s*BuiltIn\(\s*(\d+),\s*(math\.inf|-?\d+)/g],
};

// PHP answers for itself: the arities come from Registry::builtins() of the package, not from a reading of its source, so
// the check follows the table whatever the formatting of the PHP files is.
const php = spawnSync('php', ['-r', `require ${JSON.stringify(resolve(root, 'packages/php/vendor/autoload.php'))}; echo json_encode(array_map(static fn (array $f): array => [$f['min'], $f['max'] === PHP_INT_MAX ? -1 : $f['max']], Polyspec\\Template\\Functions\\Registry::builtins()));`], { encoding: 'utf8' });
assert.equal(php.status, 0, `php could not list its functions: ${php.error?.message ?? php.stderr}`);
const phpFound = new Map(Object.entries(JSON.parse(php.stdout)));
assert.deepEqual([...phpFound.keys()].sort(compareText), [...expected.keys()].sort(compareText), 'php function names differ from contract');
for (const [name, arity] of expected) assert.deepEqual(phpFound.get(name), arity, `php.${name} arity differs from contract`);

for (const [language, paths] of Object.entries(files)) {
  const source = paths.map(path => readFileSync(resolve(root, path), 'utf8')).join('\n');
  const found = new Map<string, [number, number]>();
  const languagePatterns = patterns[language];
  if (!languagePatterns) throw new Error(`no arity patterns for ${language}`);
  for (const pattern of languagePatterns) {
    for (const [name, min, rawMax] of pairs(source, pattern, value => (value.trim() === 'Infinity' || (language === 'rust' && value.trim() === 'usize::MAX') || (language === 'python' && value.trim() === 'math.inf')) ? -1 : Number(value))) {
      assert.ok(!found.has(name), `${language} duplicates ${name}`);
      found.set(name, [min, rawMax]);
    }
  }
  assert.deepEqual([...found.keys()].sort(compareText), [...expected.keys()].sort(compareText), `${language} function names differ from contract`);
  for (const [name, arity] of expected) assert.deepEqual(found.get(name), arity, `${language}.${name} arity differs from contract`);
}

process.stdout.write(`function contract: ${expected.size} canonical functions, five-language registry parity passed\n`);
