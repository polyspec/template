#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileAst } from '../../tools/compiler/ast-artifact.mjs';
import { compileSource } from '../../tools/compiler/compiler.mjs';
import { deriveTypeManifest } from '../../tools/compiler/type-manifest.mjs';
import { parse } from '../../packages/template-ts/dist/index.mjs';
import { firstDifference, listCases } from './cases.mjs';
import { root } from './drivers.mjs';

const temporary = mkdtempSync(join(root, '.generated-conformance-php-'));
const sources = join(temporary, 'source');
const runner = join(temporary, 'runner.php');
mkdirSync(sources);

function errorObject(error) {
  if (typeof error?.code !== 'string') return null;
  return { code: error.code, template: error.template ?? 'input.tpl', line: error.line ?? 0, col: error.col ?? 0 };
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
      else if (entry.isFile() && entry.name.endsWith('.tpl')) templates.set(name, parse(readFileSync(path), name, testCase.options));
    }
  }
  return templates;
}

writeFileSync(runner, `<?php
declare(strict_types=1);
require $argv[1];
require $argv[2];
use Polyspec\\Template\\TemplateError;
use Polyspec\\Template\\Value\\BindError;
use Polyspec\\Template\\Value\\Json;
try {
    $assign = $argv[3] === '' ? [] : Json::parse(file_get_contents($argv[3]));
    $define = [];
    if ($argv[4] !== '') foreach (Json::parse(file_get_contents($argv[4]))->entries() as $name => $entry) $define[$name] = $entry;
    $options = ['define' => $define];
    if ($argv[5] !== '') $options['env'] = json_decode(file_get_contents($argv[5]), true, flags: JSON_THROW_ON_ERROR);
    $html = (new GeneratedProgram())->render('input.tpl', $assign, $options);
    echo json_encode(['html' => base64_encode($html)], JSON_THROW_ON_ERROR);
} catch (TemplateError $error) {
    echo json_encode(['error' => ['code' => $error->errorCode, 'template' => $error->template, 'line' => $error->errorLine, 'col' => $error->errorCol]], JSON_THROW_ON_ERROR);
} catch (BindError $error) {
    echo json_encode(['error' => ['code' => $error->errorCode, 'template' => 'input.tpl', 'line' => 0, 'col' => 0]], JSON_THROW_ON_ERROR);
} catch (Throwable $error) {
    echo json_encode(['failure' => get_class($error) . ': ' . $error->getMessage()], JSON_THROW_ON_ERROR);
}
`);

const failures = [];
let passed = 0;
const cases = listCases(process.argv[2]);
try {
  for (const testCase of cases) {
    const id = testCase.id.replaceAll('/', '--');
    try {
      const define = testCase.hasDefine ? JSON.parse(readFileSync(join(testCase.dir, 'define.json'), 'utf8')) : {};
      const typeManifest = deriveTypeManifest(parsedTemplates(testCase), define);
      const typePath = join(temporary, `${id}.types.json`);
      const graphPath = join(temporary, `${id}.ast`);
      const sourcePath = join(sources, `${id}.php`);
      writeFileSync(typePath, JSON.stringify(typeManifest));
      compileAst({ root: testCase.dir, output: graphPath, entry: 'input.tpl', refresh: 'dev', typeManifest: typePath, delimiters: testCase.options.delimiters ?? null });
      writeFileSync(sourcePath, compileSource(join(graphPath, 'manifest.json'), typePath, 'php'));
      execFileSync('php', ['-l', sourcePath], { cwd: root, stdio: 'pipe' });
      const result = spawnSync('php', [runner, join(root, 'packages/template-php/vendor/autoload.php'), sourcePath,
        testCase.hasData ? join(testCase.dir, 'data.json') : '', testCase.hasDefine ? join(testCase.dir, 'define.json') : '', testCase.hasEnv ? join(testCase.dir, 'env.json') : ''],
      { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      if (result.status !== 0) throw new Error(result.stderr || `PHP exited with ${result.status}`);
      let actual;
      try { actual = JSON.parse(result.stdout); }
      catch { throw new Error(`invalid PHP result: ${result.stdout}`); }
      if (actual.failure) failures.push(`${testCase.id}: ${actual.failure}`);
      else if (actual.error) {
        const difference = testCase.expectedError === null ? 'unexpected render failure' : firstDifference(testCase.expectedError, actual.error);
        if (difference) failures.push(`${testCase.id}: render ${difference}`); else passed++;
      } else if (testCase.expectedError !== null) failures.push(`${testCase.id}: expected ${testCase.expectedError.code}, generated execution succeeded`);
      else if (Buffer.from(actual.html, 'base64').toString('utf8') !== testCase.expectedHtml) failures.push(`${testCase.id}: generated HTML differs`);
      else passed++;
    } catch (error) {
      const actual = errorObject(error);
      const difference = testCase.expectedError === null || actual === null ? 'unexpected compile failure' : firstDifference(testCase.expectedError, actual);
      if (difference) failures.push(`${testCase.id}: compile ${difference}: ${error.message}`); else passed++;
    }
  }
  if (process.argv[2] === undefined) assert.equal(passed + failures.length, cases.length);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
for (const failure of failures) process.stderr.write(`${failure}\n`);
process.stdout.write(`${passed}/${cases.length} PHP generated conformance cases passed\n`);
process.exit(failures.length === 0 ? 0 : 1);
