#!/usr/bin/env node
// Proves that an install project run removes its workspace, including a Go module cache, and that a
// failed removal fails with the path of the workspace. Each command is a step without a time limit
// that prints its start and its result with its elapsed time on standard error.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { createWorkspace, goModuleEnvironment, removeWorkspace } from './install-workspace.mjs';
import { runStepSync } from './test-progress/step.mjs';

function run(command, args, cwd, env = {}) {
  runStepSync('install workspace', command, args, { cwd, env: { ...process.env, ...env } });
}

/** Returns the directories in the temporary directory whose names start with the workspace name. */
function leftovers(workspace) {
  return readdirSync(dirname(workspace)).filter(name => name.startsWith(basename(workspace))).map(name => join(dirname(workspace), name));
}

/** Removes the directories of a failed case after making every directory writable. */
function discard(workspace) {
  for (const path of leftovers(workspace)) {
    run('chmod', ['-R', 'u+w', path], dirname(path));
    rmSync(path, { recursive: true });
  }
}

function removesGoModuleCache() {
  const workspace = createWorkspace();
  try {
    const module = 'example.com/install-cleanup';
    const version = 'v0.0.1';
    const proxy = join(workspace, 'go-proxy');
    const endpoint = join(proxy, module, '@v');
    const source = join(workspace, 'go-zip', `${module}@${version}`);
    mkdirSync(endpoint, { recursive: true });
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, 'go.mod'), `module ${module}\n`);
    writeFileSync(join(source, 'cleanup.go'), 'package cleanup\n');
    writeFileSync(join(endpoint, `${version}.mod`), `module ${module}\n`);
    writeFileSync(join(endpoint, `${version}.info`), JSON.stringify({ Version: version, Time: '2026-10-02T00:00:00Z' }));
    writeFileSync(join(endpoint, 'list'), `${version}\n`);
    run('zip', ['-q', '-r', join(endpoint, `${version}.zip`), `${module}@${version}`], join(workspace, 'go-zip'));
    const environment = { ...goModuleEnvironment(workspace), GOPROXY: `file://${proxy}`, GONOSUMDB: module, GOTOOLCHAIN: 'local' };
    run('go', ['mod', 'download', `${module}@${version}`], workspace, environment);
    assert.ok(existsSync(join(environment.GOMODCACHE, `${module}@${version}`, 'cleanup.go')), 'the Go module cache holds the module');
    removeWorkspace(workspace);
    assert.deepEqual(leftovers(workspace), [], 'an install project run leaves no directory');
  } finally {
    discard(workspace);
  }
}

// The removal fails on a workspace that no longer exists; a directory without write permission would not make it fail
// for root, which removes it anyway (T19.11).
function failedRemovalNamesPath() {
  const workspace = createWorkspace();
  discard(workspace);
  assert.throws(() => removeWorkspace(workspace), error => error instanceof Error && error.message.includes(workspace), 'a failed removal names the workspace');
}

let failed = 0;
for (const [name, test] of [['a run removes its Go module cache', removesGoModuleCache], ['a failed removal fails with its path', failedRemovalNamesPath]]) {
  try {
    test();
    process.stdout.write(`[install workspace] pass: ${name}\n`);
  } catch (error) {
    failed += 1;
    process.stdout.write(`[install workspace] fail: ${name}\n${error.stack}\n`);
  }
}
if (failed) process.exit(1);
