#!/usr/bin/env node
// Proves that structural compiler-interface drift is rejected.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
interface Operation {
  name: string;
  parameters: string[];
  returns?: string;
}

interface BoundMapping {
  operations: Record<string, string>;
  assign: Record<string, string>;
}

interface LanguageMapping {
  runtimeEnvironmentFields: string[];
  runtimeEnvironmentOperations: string[];
  frameFields: string[];
  scopeOperations: string[];
  boundMap?: BoundMapping;
}

// The parts of packages/compiler/interface.json that the mutations change.
interface Manifest {
  runtimeContract: Record<'Program' | 'RuntimeBindings' | 'RuntimeServices' | 'RuntimeEnvironment' | 'BoundMap', { operations: Operation[] }> & {
    Engine: { owns: string[] };
  };
  languages: Partial<Record<string, LanguageMapping>>;
}

/** The mapping of `name` in `manifest`; fails when the manifest maps no such language. */
function language(manifest: Manifest, name: string): LanguageMapping {
  const mapping = manifest.languages[name];
  if (!mapping) throw new Error(`interface.json maps no language ${name}`);
  return mapping;
}

/** The bound map mapping of the language `name`; fails when it is missing. */
function boundMap(manifest: Manifest, name: string): BoundMapping {
  const mapping = language(manifest, name).boundMap;
  if (!mapping) throw new Error(`interface.json maps no BoundMap for ${name}`);
  return mapping;
}

/** The operation at `index` of `operations`; fails when there is none. */
function operationAt(operations: Operation[], index: number): Operation {
  const operation = operations[index];
  if (!operation) throw new Error(`interface.json has no operation ${index}`);
  return operation;
}

const original = JSON.parse(readFileSync(resolve(root, 'packages/compiler/interface.json'), 'utf8')) as Manifest;
let rejected = 0;
const directory = mkdtempSync(join(tmpdir(), 'template-interface-mutation-'));

try {
  const mutations: [string, (manifest: Manifest) => void][] = [
    ['missing Program operation', manifest => manifest.runtimeContract.Program.operations.pop()],
    ['changed Program parameter count', manifest => operationAt(manifest.runtimeContract.Program.operations, 0).parameters.pop()],
    ['changed Engine owner', manifest => { manifest.runtimeContract.Engine.owns = ['artifact']; }],
    ['missing RuntimeBindings operation', manifest => manifest.runtimeContract.RuntimeBindings.operations.pop()],
    ['changed RuntimeBindings parameter count', manifest => operationAt(manifest.runtimeContract.RuntimeBindings.operations, 1).parameters.pop()],
    ['missing RuntimeServices operation', manifest => manifest.runtimeContract.RuntimeServices.operations.pop()],
    ['missing RuntimeEnvironment field', manifest => language(manifest, 'typescript').runtimeEnvironmentFields.pop()],
    ['missing RuntimeEnvironment operation', manifest => manifest.runtimeContract.RuntimeEnvironment.operations.pop()],
    ['AST field added to RenderFrame', manifest => language(manifest, 'typescript').frameFields.push('ast')],
    ['missing RenderScope operation', manifest => language(manifest, 'typescript').scopeOperations.pop()],
    ['added BoundMap operation', manifest => manifest.runtimeContract.BoundMap.operations.push({ name: 'entries', parameters: ['map'], returns: 'map' })],
    ['missing BoundMap mapping', manifest => { delete language(manifest, 'go').boundMap; }],
    ['renamed Go BoundMap operation', manifest => { boundMap(manifest, 'go').operations.merge = 'Combine'; }],
    ['renamed Rust bound assign operation', manifest => { boundMap(manifest, 'rust').assign.render = 'render_map'; }],
    ['renamed PHP BoundMap operation', manifest => { boundMap(manifest, 'php').operations.bind = 'create'; }],
    ['missing Python mapping', manifest => { delete manifest.languages.python; }],
    ['missing Python RuntimeEnvironment field', manifest => language(manifest, 'python').runtimeEnvironmentFields.pop()],
    ['renamed Python RuntimeEnvironment operation', manifest => { language(manifest, 'python').runtimeEnvironmentOperations[1] = 'get_limits'; }],
    ['renamed Python Scope operation', manifest => { language(manifest, 'python').scopeOperations[1] = 'loopMeta'; }],
    ['renamed Python BoundMap operation', manifest => { boundMap(manifest, 'python').operations.merge = 'combine'; }],
  ];
  for (const [name, mutate] of mutations) {
    const manifest = structuredClone(original);
    mutate(manifest);
    const path = join(directory, `${name.replaceAll(' ', '-')}.json`);
    writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
    const result = spawnSync(process.execPath, ['scripts/check-compiler-interface.mts'], {
      cwd: root,
      env: { ...process.env, TEMPLATE_INTERFACE_MANIFEST: path },
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    if (result.status === 0) throw new Error(`${name} was accepted`);
    rejected++;
  }
  const backendDirectory = join(directory, 'backends');
  mkdirSync(backendDirectory);
  for (const filename of ['typescript.mjs', 'go.mjs', 'rust.mjs', 'php.mjs', 'python.mjs']) {
    copyFileSync(resolve(root, 'packages/compiler/backends', filename), join(backendDirectory, filename));
  }
  const rustBackend = join(backendDirectory, 'rust.mjs');
  writeFileSync(rustBackend, readFileSync(rustBackend, 'utf8').replace('export function emitEntry', 'function emitEntry'));
  const backendResult = spawnSync(process.execPath, ['scripts/check-compiler-interface.mts'], {
    cwd: root,
    env: { ...process.env, TEMPLATE_BACKEND_DIRECTORY: backendDirectory },
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (backendResult.status === 0) throw new Error('missing backend operation was accepted');
  rejected++;
  // VAL-22: a public operation added to the TypeScript bound map class is rejected.
  const boundSource = join(directory, 'bound.ts');
  writeFileSync(boundSource, readFileSync(resolve(root, 'packages/ts/src/value/bound.ts'), 'utf8').replace('  static {', '  entries(): number {\n    return 0;\n  }\n\n  static {'));
  const boundResult = spawnSync(process.execPath, ['scripts/check-compiler-interface.mts'], {
    cwd: root,
    env: { ...process.env, TEMPLATE_TS_BOUND_SOURCE: boundSource },
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (boundResult.status === 0 || !boundResult.stderr.includes('BoundMap has the undeclared member entries')) throw new Error('a public bound map operation was accepted');
  rejected++;
} finally {
  rmSync(directory, { recursive: true, force: true });
}

process.stdout.write(`compiler interface: ${rejected} structural mutations rejected\n`);
