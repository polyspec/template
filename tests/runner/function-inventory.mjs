#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { root } from './drivers.mjs';

const report = JSON.parse(await new Promise((resolveReport, reject) => {
  const child = process.getBuiltinModule('node:child_process').spawn(process.execPath, [
    join(root, 'scripts/inventory-template-functions.mjs'),
    '--root', root,
    '--only', 'tests/fixtures/function-inventory/source.tpl',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', code => code === 0 ? resolveReport(stdout) : reject(new Error(stderr || `inventory exited ${code}`)));
}));

assert.equal(report.files, 1);
assert.deepEqual(report.symbols.map(symbol => `${symbol.category}:${symbol.name}`), [
  'direct:json_encode',
  'direct:visible',
  'direct:wrap',
  'instance:label',
  'qualified:\\Limepie\\dt\\format',
  'static:\\Limepie\\dt::format',
]);
assert.equal(report.symbols.find(symbol => symbol.name === 'javascriptOnly'), undefined);
assert.equal(report.symbols.find(symbol => symbol.name === 'ignored'), undefined);
assert.equal(report.symbols.find(symbol => symbol.name === 'alert'), undefined);
process.stdout.write('function inventory: template calls are separated from raw JavaScript and comments\n');
