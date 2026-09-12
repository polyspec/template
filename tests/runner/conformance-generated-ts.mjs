#!/usr/bin/env node
// Compiles every fixture through the product TypeScript backend and compares
// generated execution or compile diagnostics with the canonical expectations.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileAst } from '../../tools/compiler/ast-artifact.mjs';
import { compileSource } from '../../tools/compiler/compiler.mjs';
import { deriveTypeManifest } from '../../tools/compiler/type-manifest.mjs';
import { parse, parseJsonBytes } from '../../packages/template-ts/dist/index.mjs';
import { firstDifference, listCases } from './cases.mjs';
import { root } from './drivers.mjs';

const temporary = mkdtempSync(join(root, '.generated-conformance-ts-'));
const sources = join(temporary, 'source');
const output = join(temporary, 'output');
mkdirSync(sources);

function plain(value) {
  if (value instanceof Map) return Object.fromEntries([...value].map(([key, item]) => [key, plain(item)]));
  if (Array.isArray(value)) return value.map(plain);
  return value;
}

function errorObject(error, template = null) {
  if (typeof error?.code !== 'string') return null;
  return {
    code: error.code,
    template: error.template ?? template,
    line: error.line ?? 0,
    col: error.col ?? 0,
  };
}

function parsedTemplates(testCase) {
  const templates = new Map();
  const pending = [[testCase.dir, '']];
  while (pending.length > 0) {
    const [directory, prefix] = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) pending.push([path, name]);
      else if (entry.isFile() && entry.name.endsWith('.tpl')) {
        templates.set(name, parse(readFileSync(path), name, testCase.options));
      }
    }
  }
  return templates;
}

const pending = [];
const failures = [];
let passed = 0;
try {
  for (const testCase of listCases()) {
    const id = testCase.id.replaceAll('/', '--');
    try {
      const define = testCase.hasDefine ? JSON.parse(readFileSync(join(testCase.dir, 'define.json'), 'utf8')) : {};
      const typeManifest = deriveTypeManifest(parsedTemplates(testCase), define);
      const typePath = join(temporary, `${id}.types.json`);
      const graphPath = join(temporary, `${id}.ast`);
      const sourcePath = join(sources, `${id}.ts`);
      writeFileSync(typePath, JSON.stringify(typeManifest));
      compileAst({
        root: testCase.dir,
        output: graphPath,
        entry: 'input.tpl',
        refresh: 'dev',
        typeManifest: typePath,
        delimiters: testCase.options.delimiters ?? null,
      });
      writeFileSync(sourcePath, compileSource(join(graphPath, 'manifest.json'), typePath, 'ts'));
      pending.push({ testCase, id, sourcePath });
    } catch (error) {
      const actual = errorObject(error);
      const difference = testCase.expectedError === null || actual === null ? 'unexpected compile failure' : firstDifference(testCase.expectedError, actual);
      if (difference) failures.push(`${testCase.id}: compile ${difference}: ${error.message}`);
      else passed++;
    }
  }

  execFileSync('npx', [
    'tsc', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--outDir', output,
    ...pending.map(item => item.sourcePath),
  ], { cwd: root, stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 });

  for (const { testCase, id } of pending) {
    try {
      const { GeneratedProgram } = await import(pathToFileURL(join(output, `${id}.js`)).href);
      const assign = testCase.hasData ? parseJsonBytes(readFileSync(join(testCase.dir, 'data.json'))) : new Map();
      const define = testCase.hasDefine ? plain(parseJsonBytes(readFileSync(join(testCase.dir, 'define.json')))) : {};
      const env = testCase.hasEnv ? plain(parseJsonBytes(readFileSync(join(testCase.dir, 'env.json')))) : undefined;
      const actual = new GeneratedProgram().render('input.tpl', assign, { define, env });
      if (testCase.expectedError !== null) failures.push(`${testCase.id}: expected ${testCase.expectedError.code}, generated execution succeeded`);
      else if (actual !== testCase.expectedHtml) failures.push(`${testCase.id}: generated HTML differs`);
      else passed++;
    } catch (error) {
      const actual = errorObject(error, 'input.tpl');
      const difference = testCase.expectedError === null || actual === null ? 'unexpected render failure' : firstDifference(testCase.expectedError, actual);
      if (difference) failures.push(`${testCase.id}: render ${difference}: ${error.message}`);
      else passed++;
    }
  }
  assert.equal(passed + failures.length, 211);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

for (const failure of failures) process.stderr.write(`${failure}\n`);
process.stdout.write(`${passed}/211 TypeScript generated conformance cases passed\n`);
process.exit(failures.length === 0 ? 0 : 1);
