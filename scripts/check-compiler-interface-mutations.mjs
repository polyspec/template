#!/usr/bin/env node
// Proves that structural compiler-interface drift is rejected.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const original = JSON.parse(readFileSync(resolve(root, 'tools/compiler/interface.json'), 'utf8'));
const directory = mkdtempSync(join(tmpdir(), 'template-interface-mutation-'));

try {
  const mutations = [
    ['missing Program operation', manifest => manifest.runtimeContract.Program.operations.pop()],
    ['changed Program parameter count', manifest => manifest.runtimeContract.Program.operations[0].parameters.pop()],
    ['changed Engine owner', manifest => { manifest.runtimeContract.Engine.owns = ['artifact']; }],
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
} finally {
  rmSync(directory, { recursive: true, force: true });
}

process.stdout.write('compiler interface: 3 structural mutations rejected\n');
