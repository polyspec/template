#!/usr/bin/env node
// Proves that structural compiler-interface drift is rejected.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const original = JSON.parse(readFileSync(resolve(root, 'packages/template-compiler/interface.json'), 'utf8'));
const directory = mkdtempSync(join(tmpdir(), 'template-interface-mutation-'));

try {
  const mutations = [
    ['missing Program operation', manifest => manifest.runtimeContract.Program.operations.pop()],
    ['changed Program parameter count', manifest => manifest.runtimeContract.Program.operations[0].parameters.pop()],
    ['changed Engine owner', manifest => { manifest.runtimeContract.Engine.owns = ['artifact']; }],
    ['missing RuntimeBindings operation', manifest => manifest.runtimeContract.RuntimeBindings.operations.pop()],
    ['changed RuntimeBindings parameter count', manifest => manifest.runtimeContract.RuntimeBindings.operations[1].parameters.pop()],
    ['missing RuntimeServices operation', manifest => manifest.runtimeContract.RuntimeServices.operations.pop()],
    ['missing RuntimeEnvironment field', manifest => manifest.languages.typescript.runtimeEnvironmentFields.pop()],
    ['missing RuntimeEnvironment operation', manifest => manifest.runtimeContract.RuntimeEnvironment.operations.pop()],
    ['AST field added to RenderFrame', manifest => manifest.languages.typescript.frameFields.push('ast')],
    ['missing RenderScope operation', manifest => manifest.languages.typescript.scopeOperations.pop()],
    ['added BoundMap operation', manifest => manifest.runtimeContract.BoundMap.operations.push({ name: 'entries', parameters: ['map'], returns: 'map' })],
    ['missing BoundMap mapping', manifest => { delete manifest.languages.go.boundMap; }],
    ['renamed Go BoundMap operation', manifest => { manifest.languages.go.boundMap.operations.merge = 'Combine'; }],
    ['renamed Rust bound assign operation', manifest => { manifest.languages.rust.boundMap.assign.render = 'render_map'; }],
    ['renamed PHP BoundMap operation', manifest => { manifest.languages.php.boundMap.operations.bind = 'create'; }],
  ];
  for (const [name, mutate] of mutations) {
    const manifest = structuredClone(original);
    mutate(manifest);
    const path = join(directory, `${name.replaceAll(' ', '-')}.json`);
    writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
    const result = spawnSync(process.execPath, ['scripts/check-compiler-interface.mjs'], {
      cwd: root,
      env: { ...process.env, TEMPLATE_INTERFACE_MANIFEST: path },
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    if (result.status === 0) throw new Error(`${name} was accepted`);
  }
  const backendDirectory = join(directory, 'backends');
  mkdirSync(backendDirectory);
  for (const filename of ['typescript.mjs', 'go.mjs', 'rust.mjs', 'php.mjs']) {
    copyFileSync(resolve(root, 'packages/template-compiler/backends', filename), join(backendDirectory, filename));
  }
  const rustBackend = join(backendDirectory, 'rust.mjs');
  writeFileSync(rustBackend, readFileSync(rustBackend, 'utf8').replace('export function emitEntry', 'function emitEntry'));
  const backendResult = spawnSync(process.execPath, ['scripts/check-compiler-interface.mjs'], {
    cwd: root,
    env: { ...process.env, TEMPLATE_BACKEND_DIRECTORY: backendDirectory },
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (backendResult.status === 0) throw new Error('missing backend operation was accepted');
  // VAL-22: a public operation added to the TypeScript bound map class is rejected.
  const boundSource = join(directory, 'bound.ts');
  writeFileSync(boundSource, readFileSync(resolve(root, 'packages/template-ts/src/value/bound.ts'), 'utf8').replace('  static {', '  entries(): number {\n    return 0;\n  }\n\n  static {'));
  const boundResult = spawnSync(process.execPath, ['scripts/check-compiler-interface.mjs'], {
    cwd: root,
    env: { ...process.env, TEMPLATE_TS_BOUND_SOURCE: boundSource },
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (boundResult.status === 0 || !boundResult.stderr.includes('BoundMap has the undeclared member entries')) throw new Error('a public bound map operation was accepted');
} finally {
  rmSync(directory, { recursive: true, force: true });
}

process.stdout.write('compiler interface: 17 structural mutations rejected\n');
