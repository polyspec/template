#!/usr/bin/env node
// Compiles every fixture through the product TypeScript backend and compares
// generated execution or compile diagnostics with the canonical expectations.
// tsc runs as one step without a time limit and is judged by its exit code; each case renders in a
// worker under its own deadline.
// Every step and every case prints its start and its result with its elapsed time.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileAst } from '../../packages/compiler/ast-artifact.mjs';
import { compileSource } from '../../packages/compiler/compiler.mjs';
import { deriveTypeManifest } from '../../packages/compiler/type-manifest.mjs';
import { parse } from '../../packages/ts/dist/index.mjs';
import { inWorker, runStep, seconds, stepProgress } from './bounded.mts';
import { errorField, generatedCases, type TestCase, typeDefinitions } from './cases.mts';
import { errorDifference } from './generated-errors.mts';
import type { RenderMessage } from './generated-ts-render.mts';
import { tsc } from '../../scripts/tools.mts';
import { nodeWorkspace } from '../../scripts/temporary-workspace.mts';

// The time limit of the render of one case.
const RENDER_TIMEOUT_MS = 30_000;

// The generated sources import @polyspec/template, which the workspace holds as a copy of the installed package.
const temporary = nodeWorkspace('generated-conformance-ts');
const sources = join(temporary, 'source');
const output = join(temporary, 'output');
mkdirSync(sources);

function parsedTemplates(testCase: TestCase): Map<string, ReturnType<typeof parse>> {
  const templates = new Map<string, ReturnType<typeof parse>>();
  const pending: [string, string][] = [[testCase.dir, '']];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const [directory, prefix] = next;
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

const pending: { testCase: TestCase; id: string; sourcePath: string }[] = [];
const failures: string[] = [];
let passed = 0;
const { cases } = generatedCases(process.argv.slice(2));
const progress = stepProgress();
try {
  for (const testCase of cases) {
    const id = testCase.id.replaceAll('/', '--');
    const step = `${testCase.id} › compile`;
    progress.start(step);
    try {
      const typeManifest = deriveTypeManifest(parsedTemplates(testCase), typeDefinitions(testCase));
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
      progress.pass(step);
    } catch (error) {
      const difference = errorDifference(testCase.expectedError, error, 'compile');
      if (difference) { failures.push(`${testCase.id}: compile ${difference}: ${String(errorField(error, 'message'))}`); progress.fail(step, undefined, difference); }
      else { passed++; progress.pass(step); }
    }
  }

  // tsc without input files prints its help and fails, so skip it when every case failed to compile.
  if (pending.length > 0) {
    const step = `tsc (${pending.length} files)`;
    progress.start(step);
    // The compiler runs as `node <tsc>`, started by name, by the path of its package (no bin links, T18.4).
    const result = await runStep('node', [
      tsc, '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--outDir', output,
      ...pending.map(item => item.sourcePath),
      // tsc refuses files on its command line in a directory with a tsconfig.json, such as the root of the checkout
      // (TS5112), so it runs in the workspace, which has none.
    ], { cwd: temporary });
    if (result.status !== 0) {
      const reason = `tsc exited with ${result.status}\n${result.stdout}${result.stderr}`;
      progress.fail(step, undefined, reason);
      throw new Error(reason);
    }
    progress.pass(step);
  }

  for (const { testCase, id } of pending) {
    const step = `${testCase.id} › render`;
    progress.start(step);
    const failed = failures.length;
    const result = await inWorker<RenderMessage>(new URL('./generated-ts-render.mts', import.meta.url), {
      module: join(output, `${id}.js`), dir: testCase.dir, hasData: testCase.hasData, hasDefine: testCase.hasDefine, hasEnv: testCase.hasEnv,
    }, RENDER_TIMEOUT_MS);
    if ('timedOut' in result) failures.push(`${testCase.id}: render exceeded its ${seconds(RENDER_TIMEOUT_MS)} deadline`);
    else if ('failure' in result) failures.push(`${testCase.id}: render ${result.failure}`);
    else if ('error' in result) {
      const difference = errorDifference(testCase.expectedError, result.error, 'render');
      if (difference) failures.push(`${testCase.id}: render ${difference}: ${String(result.error.message)}`);
      else passed++;
    } else if (testCase.expectedError !== null) failures.push(`${testCase.id}: expected ${testCase.expectedError.code}, generated execution succeeded`);
    else if (result.html !== testCase.expectedHtml) failures.push(`${testCase.id}: generated HTML differs`);
    else passed++;
    if (failures.length > failed) progress.fail(step, undefined, failures.slice(failed).join('\n'));
    else progress.pass(step);
  }
  progress.close('TypeScript generated conformance steps');
  assert.equal(passed + failures.length, cases.length);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

for (const failure of failures) process.stderr.write(`${failure}\n`);
process.stdout.write(`${passed}/${cases.length} TypeScript generated conformance cases passed\n`);
process.exit(failures.length === 0 ? 0 : 1);
