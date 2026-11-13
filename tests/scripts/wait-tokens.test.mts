// I-2 (4), B-5 and GN-6m of binding: a member of packages/rust/interface.json whose wait is `blocking_io` or
// `process_wait` calls a core function that takes the wait token `binding_core::Io` or `binding_core::ProcessWait` as
// its first argument after the receiver, because the generated binding passes the token there and the core then
// proves that its blocking runs only where the binding allows it (RT-77). The test reads the core path of every such
// member and requires the function in packages/rust/src to declare the token in that place.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TOKENS: Record<string, string> = { blocking_io: 'Io', process_wait: 'ProcessWait' };

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isObject) : []);

test('every member that waits calls a core function that takes the wait token first', () => {
  const contract: unknown = JSON.parse(readFileSync(path.join(ROOT, 'packages/rust/interface.json'), 'utf8'));
  assert.ok(isObject(contract), 'packages/rust/interface.json is no object');
  const source = readdirSync(path.join(ROOT, 'packages/rust/src'), { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.rs'))
    .map((file) => readFileSync(path.join(ROOT, 'packages/rust/src', file), 'utf8'))
    .join('\n');
  const waiting = list(contract['units']).flatMap((unit) => list(unit['members']).filter((member) => typeof member['wait'] === 'string' && member['wait'] in TOKENS));
  assert.ok(waiting.length > 0, 'packages/rust/interface.json has no member that waits');
  const findings: string[] = [];
  for (const member of waiting) {
    const token = TOKENS[String(member['wait'])];
    const core = isObject(member['core']) ? member['core'] : {};
    const name = String(core['path']).split('::').at(-1);
    const receiver = typeof core['receiver'] === 'string' ? `${core['receiver'].replace(/\s+/gu, '')},\\s*` : '';
    const declared = new RegExp(`\\bpub fn ${name}(<[^>]*>)?\\(\\s*${receiver.replace('&', '&\\s*')}\\w+:\\s*(binding_core::)?${token}\\b`, 'u');
    if (!declared.test(source)) findings.push(`${String(member['id'])} (${String(member['wait'])}) calls ${String(core['path'])}, which does not take ${token} first`);
  }
  assert.deepEqual(findings, []);
});
