// Fixture case enumeration and comparison helpers shared by the runners.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { root } from './drivers.mjs';

export const casesDir = join(root, 'tests', 'cases');

export function listCases(filter) {
  const cases = [];
  if (!existsSync(casesDir)) return cases;
  for (const group of readdirSync(casesDir, { withFileTypes: true })) {
    if (!group.isDirectory()) continue;
    for (const entry of readdirSync(join(casesDir, group.name), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(casesDir, group.name, entry.name);
      if (!existsSync(join(dir, 'input.tpl'))) continue;
      const id = `${group.name}/${entry.name}`;
      if (filter && id !== filter && group.name !== filter) continue;
      cases.push(loadCase(id, dir));
    }
  }
  return cases.sort((a, b) => a.id.localeCompare(b.id));
}

function readIf(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

function loadCase(id, dir) {
  const expectedHtml = readIf(join(dir, 'expected.html'));
  const expectedError = readIf(join(dir, 'expected.error.json'));
  const expectedAst = readIf(join(dir, 'expected.ast.json'));
  return {
    id,
    dir,
    relative: relative(root, dir),
    input: 'input.tpl',
    hasData: existsSync(join(dir, 'data.json')),
    hasDefine: existsSync(join(dir, 'define.json')),
    hasEnv: existsSync(join(dir, 'env.json')),
    options: existsSync(join(dir, 'options.json')) ? JSON.parse(readFileSync(join(dir, 'options.json'), 'utf8')) : {},
    meta: existsSync(join(dir, 'case.json')) ? JSON.parse(readFileSync(join(dir, 'case.json'), 'utf8')) : { rules: [], stage: 0 },
    expectedHtml,
    expectedError: expectedError === null ? null : JSON.parse(expectedError),
    expectedAst: expectedAst === null ? null : JSON.parse(expectedAst),
  };
}

export function renderArgs(testCase) {
  const args = ['render', testCase.input, '--root', testCase.dir];
  if (testCase.hasData) args.push('--data', 'data.json');
  if (testCase.hasDefine) args.push('--define', 'define.json');
  if (testCase.hasEnv) args.push('--env', 'env.json');
  if (testCase.options.delimiters) args.push('--delimiters', testCase.options.delimiters);
  return args;
}

export function parseArgs(testCase) {
  const args = ['parse', testCase.input, '--root', testCase.dir];
  if (testCase.options.delimiters) args.push('--delimiters', testCase.options.delimiters);
  return args;
}

// Structural JSON equality: key order is ignored, numbers compare by value.
export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  if (typeof a === 'object') {
    if (Array.isArray(b)) return false;
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key, index) => key === keysB[index] && deepEqual(a[key], b[key]));
  }
  return false;
}

export function firstDifference(a, b, path = '$') {
  if (deepEqual(a, b)) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
    return `${path}: expected ${JSON.stringify(a)}, got ${JSON.stringify(b)}`;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array and object differ`;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return `${path}: expected length ${a.length}, got ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const diff = firstDifference(a[i], b[i], `${path}[${i}]`);
      if (diff) return diff;
    }
    return null;
  }
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!(key in a)) return `${path}.${key}: unexpected key`;
    if (!(key in b)) return `${path}.${key}: missing key`;
    const diff = firstDifference(a[key], b[key], `${path}.${key}`);
    if (diff) return diff;
  }
  return null;
}

export function parseErrorOutput(stderr) {
  const text = stderr.trim();
  try {
    const parsed = JSON.parse(text);
    return { code: parsed.code, template: parsed.template, line: parsed.line, col: parsed.col };
  } catch {
    return null;
  }
}

export function describeText(expected, actual) {
  const limit = Math.min(expected.length, actual.length);
  let index = 0;
  while (index < limit && expected[index] === actual[index]) index++;
  const line = expected.slice(0, index).split('\n').length;
  return `first difference at byte ${index} (line ${line}): expected ${JSON.stringify(expected.slice(index, index + 40))}, got ${JSON.stringify(actual.slice(index, index + 40))}`;
}
