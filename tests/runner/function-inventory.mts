#!/usr/bin/env node
import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { JSONSchemaType } from 'ajv';
import { jsonDocument } from '../../scripts/json-document.mts';
import { root } from './drivers.mts';

/** The part of the inventory report that the check reads; the report holds more fields. */
interface InventoryReport {
  files: number;
  symbols: { category: string; name: string }[];
}

const REPORT_SCHEMA: JSONSchemaType<InventoryReport> = {
  type: 'object',
  properties: {
    files: { type: 'integer' },
    symbols: {
      type: 'array',
      items: { type: 'object', properties: { category: { type: 'string' }, name: { type: 'string' } }, required: ['category', 'name'] },
    },
  },
  required: ['files', 'symbols'],
};

const report = jsonDocument<InventoryReport>('inventory report', REPORT_SCHEMA).parse(await new Promise<string>((resolveReport, reject) => {
  const child = process.getBuiltinModule('node:child_process').spawn(process.execPath, [
    join(root, 'scripts/inventory-template-functions.mts'),
    '--root', root,
    '--only', 'tests/fixtures/function-inventory/source.tpl',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk; });
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', code => code === 0 ? resolveReport(stdout) : reject(new Error(stderr || `inventory exited ${code}`)));
}), 'the report of scripts/inventory-template-functions.mts');

assert.equal(report.files, 1);
assert.deepEqual(report.symbols.map(symbol => `${symbol.category}:${symbol.name}`), [
  'direct:json_encode',
  'direct:visible',
  'direct:wrap',
  'instance:label',
  'qualified:\\Vendor\\dt\\format',
  'static:\\Vendor\\dt::format',
]);
assert.equal(report.symbols.find(symbol => symbol.name === 'javascriptOnly'), undefined);
assert.equal(report.symbols.find(symbol => symbol.name === 'ignored'), undefined);
assert.equal(report.symbols.find(symbol => symbol.name === 'alert'), undefined);
process.stdout.write('function inventory: template calls are separated from raw JavaScript and comments\n');
