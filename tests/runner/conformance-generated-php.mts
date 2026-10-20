#!/usr/bin/env node
// PHP generated conformance: compiles every case into PHP source, checks it with `php -l` and runs
// it in its own PHP process. Each case prints its start and its result with its elapsed time, and
// each of the two PHP processes of a case is stopped when it outlives its deadline.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileAst } from '../../packages/compiler/src/ast-artifact.mts';
import { compileFiles } from '../../packages/compiler/src/compiler.mts';
import { phpProgramAutoload, writePhpProgram } from '../../scripts/php-program.mts';
import { caseTypeManifest, runProcessCases } from './generated-cases.mts';
import { parsedCaseResult } from './generated-errors.mts';
import { runBoundedStep } from './bounded.mts';
import { root } from './drivers.mts';
import { temporaryDirectory } from '../../scripts/temporary-workspace.mts';

// The time limit of one PHP process of a case.
const PROCESS_TIMEOUT_MS = 30_000;

const temporary = temporaryDirectory('generated-conformance-php');
const sources = join(temporary, 'source');
const runner = join(temporary, 'runner.php');
mkdirSync(sources);

// Every case runs in its own PHP process, so all cases share one namespace.
const namespace = 'Polyspec\\Generated\\Conformance';
// The runner loads the program of a case, one PSR-4 file per class (T25.1), through the Composer autoload of argv[1] with
// the directory of argv[2].
writeFileSync(runner, `<?php
declare(strict_types=1);
${phpProgramAutoload('$argv[1]', namespace, '$argv[2]')}
use Polyspec\\Template\\TemplateError;
use Polyspec\\Template\\Value\\BindError;
use Polyspec\\Template\\Value\\Json;
use Polyspec\\Template\\Value\\MapValue;
// Definitions are given as PHP arrays, the form that every PHP program accepts (RT-24).
function plain(mixed $value): mixed { if ($value instanceof MapValue) { $result = []; foreach ($value->entries() as [$key, $item]) $result[$key] = plain($item); return $result; } return is_array($value) ? array_map('plain', $value) : $value; }
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

await runProcessCases('PHP', temporary, async (testCase, id) => {
  const typePath = join(temporary, `${id}.types.json`);
  const graphPath = join(temporary, `${id}.ast`);
  const programDirectory = join(sources, id);
  writeFileSync(typePath, JSON.stringify(caseTypeManifest(testCase)));
  compileAst({ root: testCase.dir, output: graphPath, entry: 'input.tpl', refresh: 'dev', typeManifest: typePath, delimiters: testCase.options.delimiters ?? null });
  const programFiles = writePhpProgram(programDirectory, compileFiles(join(graphPath, 'manifest.json'), typePath, 'php', { phpNamespace: namespace }));
  const lint = await runBoundedStep('php', ['-l', ...programFiles], { cwd: root, timeoutMs: PROCESS_TIMEOUT_MS }, 'php -l');
  if (lint.status !== 0) throw new Error(`${lint.stdout}${lint.stderr}`);
  const result = await runBoundedStep('php', [runner, join(root, 'vendor/autoload.php'), programDirectory,
    testCase.hasData ? join(testCase.dir, 'data.json') : '', testCase.hasDefine ? join(testCase.dir, 'define.json') : '', testCase.hasEnv ? join(testCase.dir, 'env.json') : ''],
  { cwd: root, timeoutMs: PROCESS_TIMEOUT_MS }, 'the case process');
  if (result.status !== 0) throw new Error(result.stderr || `PHP exited with ${result.status}`);
  const actual = parsedCaseResult(result.stdout, 'PHP');
  // The runner prints the HTML in base64, so that its bytes reach the comparison unchanged.
  return actual.html === undefined ? actual : { ...actual, html: Buffer.from(actual.html, 'base64').toString('utf8') };
});
