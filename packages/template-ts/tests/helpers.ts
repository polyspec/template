// Shared test helpers: fixture paths and value serialization.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SafeString, type Value } from '../src/value/value.js';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const casesDir = join(repoRoot, 'tests', 'cases');
export const exprFixture = join(repoRoot, 'tests', 'fixtures', 'expr', 'cases.json');

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Converts a template value into plain JSON data for comparison.
export function toJsonValue(value: Value): unknown {
  if (value instanceof SafeString) return value.text;
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (value instanceof Map) return Object.fromEntries([...value].map(([k, v]) => [k, toJsonValue(v)]));
  if (typeof value === 'number' && Object.is(value, -0)) return 0;
  return value;
}
