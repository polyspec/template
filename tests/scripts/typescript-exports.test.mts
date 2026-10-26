import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { typescriptExports } from '../../scripts/typescript-exports.mts';

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
