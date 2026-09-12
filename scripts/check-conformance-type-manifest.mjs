#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from '../packages/template-ts/dist/index.mjs';
import { listCases } from '../tests/runner/cases.mjs';
import { deriveTypeManifest } from '../tools/compiler/type-manifest.mjs';

let checked = 0;
for (const testCase of listCases()) {
  if (testCase.expectedAst === null) continue;
  const templates = new Map();
  const pending = [testCase.dir];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile() && entry.name.endsWith('.tpl')) {
        const name = relative(testCase.dir, path).split('\\').join('/');
        try {
          templates.set(name, parse(readFileSync(path), name, testCase.options));
        } catch (error) {
          if (name === 'input.tpl') throw error;
        }
      }
    }
  }
  const define = testCase.hasDefine ? JSON.parse(readFileSync(join(testCase.dir, 'define.json'), 'utf8')) : {};
  const manifest = deriveTypeManifest(templates, define);
  assert.equal(manifest.schema, 3);
  assert.equal(manifest.root, 'any');
  assert.equal(manifest.entry, 'input.tpl');
  for (const definition of Object.values(manifest.defines)) {
    assert.equal(typeof definition.optional, 'boolean');
    assert.ok(typeof definition.template === 'string' || definition.html === true);
  }
  checked++;
}
assert.equal(checked, 189);
process.stdout.write(`compiler: derived dynamic type contracts for ${checked} parseable conformance cases\n`);
