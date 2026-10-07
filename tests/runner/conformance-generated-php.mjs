#!/usr/bin/env node
// PHP generated conformance: compiles every case into PHP source, checks it with `php -l` and runs
// it in its own PHP process. Each case prints its start and its result with its elapsed time, and
// each of the two PHP processes of a case is stopped when it outlives its deadline.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileAst } from '../../packages/template-compiler/ast-artifact.mjs';
import { compileSource } from '../../packages/template-compiler/compiler.mjs';
import { deriveTypeManifest } from '../../packages/template-compiler/type-manifest.mjs';
import { parse } from '../../packages/template-ts/dist/index.mjs';
import { firstDifference, generatedCases, typeDefinitions } from './cases.mjs';
import { runBounded, seconds, stepProgress } from './bounded.mjs';
import { root } from './drivers.mjs';
import { temporaryDirectory } from '../../scripts/temporary-workspace.mjs';

// The time limit of one PHP process of a case.
const PROCESS_TIMEOUT_MS = 30_000;

const temporary = temporaryDirectory('generated-conformance-php');
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

// Every case runs in its own PHP process, so all cases share one namespace.
const namespace = 'Polyspec\\Generated\\Conformance';
writeFileSync(runner, `<?php
declare(strict_types=1);
require $argv[1];
require $argv[2];
use Polyspec\\Template\\TemplateError;
use Polyspec\\Template\\Value\\BindError;
use Polyspec\\Template\\Value\\Json;
use Polyspec\\Template\\Value\\MapValue;
// Definitions are given as PHP arrays, the form that every PHP program accepts (RT-24).
function plain(mixed $value): mixed { if ($value instanceof MapValue) { $result = []; foreach ($value->entries() as $key => $item) $result[$key] = plain($item); return $result; } return is_array($value) ? array_map('plain', $value) : $value; }
try {
    $assign = $argv[3] === '' ? [] : Json::parse(file_get_contents($argv[3]));
    $define = $argv[4] === '' ? [] : plain(Json::parse(file_get_contents($argv[4])));
    $options = ['define' => $define];
    if ($argv[5] !== '') $options['env'] = plain(Json::parse(file_get_contents($argv[5])));
    $html = (new \\${namespace}\\GeneratedProgram())->render('input.tpl', $assign, $options);
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
const { cases, filtered } = generatedCases(process.argv.slice(2));
const progress = stepProgress();

// Runs one PHP process of a case; a process that outlives its deadline fails the case.
async function php(args, step) {
  const result = await runBounded('php', args, { cwd: root, timeoutMs: PROCESS_TIMEOUT_MS });
  if (result.timedOut) throw Object.assign(new Error(`${step} exceeded its ${seconds(PROCESS_TIMEOUT_MS)} deadline`), { deadline: true });
  return result;
}

try {
  for (const testCase of cases) {
    const id = testCase.id.replaceAll('/', '--');
    const failed = failures.length;
    progress.start(testCase.id);
    try {
      const typeManifest = deriveTypeManifest(parsedTemplates(testCase), typeDefinitions(testCase));
      const typePath = join(temporary, `${id}.types.json`);
      const graphPath = join(temporary, `${id}.ast`);
      const sourcePath = join(sources, `${id}.php`);
      writeFileSync(typePath, JSON.stringify(typeManifest));
      compileAst({ root: testCase.dir, output: graphPath, entry: 'input.tpl', refresh: 'dev', typeManifest: typePath, delimiters: testCase.options.delimiters ?? null });
      writeFileSync(sourcePath, compileSource(join(graphPath, 'manifest.json'), typePath, 'php', { phpNamespace: namespace }));
      const lint = await php(['-l', sourcePath], 'php -l');
      if (lint.status !== 0) throw new Error(`${lint.stdout}${lint.stderr}`);
      const result = await php([runner, join(root, 'packages/template-php/vendor/autoload.php'), sourcePath,
        testCase.hasData ? join(testCase.dir, 'data.json') : '', testCase.hasDefine ? join(testCase.dir, 'define.json') : '', testCase.hasEnv ? join(testCase.dir, 'env.json') : ''], 'the case process');
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
      if (error.deadline) failures.push(`${testCase.id}: ${error.message}`);
      else if (difference) failures.push(`${testCase.id}: compile ${difference}: ${error.message}`); else passed++;
    }
    if (failures.length > failed) progress.fail(testCase.id, undefined, failures.slice(failed).join('\n'));
    else progress.pass(testCase.id);
  }
  progress.close('PHP generated conformance');
  if (!filtered) assert.equal(passed + failures.length, cases.length);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
for (const failure of failures) process.stderr.write(`${failure}\n`);
process.stdout.write(`${passed}/${cases.length} PHP generated conformance cases passed\n`);
process.exit(failures.length === 0 ? 0 : 1);
