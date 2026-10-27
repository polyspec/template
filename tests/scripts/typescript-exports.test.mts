import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { jsonDocument } from '../../scripts/json-document.mts';
import { declaredApiSymbols } from './public-api-declarations.mts';
import { typescriptExports } from '../../scripts/typescript-exports.mts';

test('a package consumer can name the types in public signatures', { timeout: 30_000 }, () => {
  const result = spawnSync('node_modules/.bin/tsc', ['-p', 'tests/fixtures/public-types/tsconfig.json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

function declarationModel(config: string) {
  // Resolve the declared tool dependency through the provider's public package
  // metadata, for both packed installs and native development links.
  const requireTool = createRequire(import.meta.resolve('@polyspec/kit/package.json'));
  const packageFile = requireTool.resolve('@microsoft/api-extractor/package.json');
  const command = join(dirname(packageFile), '..', '..', '.bin', 'api-extractor');
  return spawnSync(command, ['run', '--local', '--config', config], { encoding: 'utf8' });
}

test('the public declaration model has no inaccessible signature types', { timeout: 30_000 }, () => {
  const result = declarationModel('packages/ts/api-extractor.json');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  interface Item { canonicalReference?: string; members?: Item[] }
  const model = jsonDocument<Item>('native API model', {
    type: 'object', properties: { canonicalReference: { type: 'string' },
      members: { type: 'array', items: { $ref: '#' } } },
  }).read('var/report/public-types.api.json');
  const references = new Set<string>();
  function visit(item: Item): void {
    if (item.canonicalReference !== undefined) references.add(item.canonicalReference);
    for (const member of item.members ?? []) visit(member);
  }
  visit(model);
  assert.ok(references.has('@polyspec/template!Output:interface'), 'the type-only output export names its instance contract');
  assert.ok(!references.has('@polyspec/template!Output:constructor(1)'), 'the SDK does not publish buffer construction');
  assert.ok(!references.has('@polyspec/template!BoundMap:constructor(1)'), 'bound maps are created only by bind and merge');
  for (const symbol of declaredApiSymbols('ts')) {
    assert.ok(references.has(symbol), `${symbol} is absent from the native model`);
  }
});

test('the declaration check rejects a public class with a private implementation base', { timeout: 30_000 }, () => {
  const result = declarationModel('tests/fixtures/public-types/private-api-extractor.json');
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /\(ae-forgotten-export\)/);
});

test('star re-exports expose runtime and type names through cycles without a default export', { timeout: 1000 }, () => {
  const entry = resolve('entry.ts');
  const render = resolve('render.ts');
  const files = new Map([
    [entry, 'export * from "./render.js"; export const parse = 1;'],
    [render, 'export * from "./entry.js"; export { bind, merge } from "./bound.js"; export type { BoundMap } from "./bound.js"; export default 1;'],
  ]);
  const read = (file: string): string => {
    const source = files.get(file);
    assert.ok(source !== undefined, `unexpected source ${file}`);
    return source;
  };
  assert.deepEqual([...typescriptExports(entry, read)].sort(), ['BoundMap', 'bind', 'merge', 'parse']);
});

test('namespace re-exports expose the namespace name', { timeout: 1000 }, () => {
  assert.deepEqual([...typescriptExports(resolve('entry.ts'), () => 'export * as runtime from "./render.js";')], ['runtime']);
});
