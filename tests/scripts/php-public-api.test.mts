// Native PHPDoc visibility is part of PHP's public SDK, just as module
// visibility is part of the Go and Rust SDKs. Keep implementation helpers out
// while retaining nameable callback and compiler-runtime types.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { jsonDocument } from '../../scripts/json-document.mts';

const symbols = jsonDocument<string[]>('PHP SDK symbols', { type: 'array', items: { type: 'string' } });
const tools = dirname(fileURLToPath(import.meta.resolve('@polyspec/kit/run-tests')));

function extract(entry: string, leaks = false): string[] {
  const result = spawnSync('php', [
    join(tools, 'symbols/php/extract.php'), resolve('var/tools/symbols-php/vendor/autoload.php'),
    entry, ...(leaks ? ['--leaks'] : []),
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  return symbols.parse(result.stdout, 'PHP SDK extraction');
}

function classSymbols(found: string[], classes: string[]): string[] {
  return found.filter(symbol => classes.some(name => {
    const qualified = `Polyspec\\Template\\${name}`;
    return symbol === qualified || symbol.startsWith(`${qualified}::`);
  }));
}

for (const entry of ['packages/php/src', 'packages/php-ext/src/polyspec_template.stub.php']) {
test(`${entry}: built-in implementation groups are outside the public SDK`, { timeout: 30_000 }, () => {
  const helpers = extract(entry).filter(symbol => symbol.startsWith('Polyspec\\Template\\Functions\\'));
  assert.deepEqual(helpers, []);
});

test(`${entry}: scanner and expression implementations are outside the public SDK`, { timeout: 30_000 }, () => {
  const helpers = extract(entry).filter(symbol =>
    symbol.startsWith('Polyspec\\Template\\Parser\\') || symbol.startsWith('Polyspec\\Template\\Expr\\'));
  assert.deepEqual(helpers, []);
  const found = new Set(extract(entry));
  for (const name of ['Polyspec\\Template\\AstProgram::parse', 'Polyspec\\Template\\AstProgram::analyze']) {
    assert.ok(found.has(name), `${name} is not public`);
  }
});

test(`${entry}: formatter and renderer implementation helpers are internal`, { timeout: 30_000 }, () => {
  const found = extract(entry);
  const internal = ['Format\\Body', 'Format\\Expression', 'Format\\Indent', 'Format\\Invariant', 'Render\\Evaluator', 'Render\\Renderer'];
  assert.deepEqual(classSymbols(found, internal), []);
  assert.ok(found.includes('Polyspec\\Template\\Format\\Formatter::format'));
});

test(`${entry}: Unicode, value and AST construction helpers are internal`, { timeout: 30_000 }, () => {
  const found = extract(entry);
  const internal = ['Utf8', 'Escape', 'Value\\Value', 'Value\\Number', 'Value\\HostArgument'];
  assert.deepEqual(classSymbols(found, internal), []);
  for (const name of ['node', 'isLoopMetaField', 'LOOP_META_FIELDS']) {
    assert.ok(!found.includes(`Polyspec\\Template\\Ast::${name}`), name);
  }
  for (const name of ['Ast::toJson', 'Value\\SafeString', 'Value\\MapValue', 'Value\\Bind::map']) {
    assert.ok(found.includes(`Polyspec\\Template\\${name}`), name);
  }
});

test(`${entry}: source metadata and factories are public with a private constructor`, { timeout: 30_000 }, () => {
  const found = new Set(extract(entry));
  for (const name of ['$name', '$text', '$lines', 'fromBytes', 'fromText', 'bytes', 'length',
    'byteAt', 'span', 'lineIndex', 'position', 'error']) {
    assert.ok(found.has(`Polyspec\\Template\\Source::${name}`), name);
  }
  assert.ok(!found.has('Polyspec\\Template\\Source::__construct'));
});

test(`${entry}: host registration and compiler-runtime types remain public`, { timeout: 30_000 }, () => {
  const found = new Set(extract(entry));
  for (const name of [
    'Polyspec\\Template\\AstProgram', 'Polyspec\\Template\\Program',
    'Polyspec\\Template\\PreparedRender::render', 'Polyspec\\Template\\Render\\RuntimeEnvironment::register',
    'Polyspec\\Template\\Render\\Context', 'Polyspec\\Template\\Render\\RuntimeBindings::truthy',
  ]) assert.ok(found.has(name), `${name} is not public`);
});

test(`${entry}: SDK signatures expose no internal implementation types`, { timeout: 30_000 }, () => {
  assert.deepEqual(extract(entry, true), []);
});
}
