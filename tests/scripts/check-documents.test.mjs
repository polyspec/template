// Tests the checklist rules of scripts/check-documents.mjs (T13.1-1): the checklist holds only headings, its title
// included, and task tables; a state marker of AGENTS, or a task list marker `[x]` or `[X]`, stands
// only at the start of the last cell of a task row, derived sub-items included; every other line and marker fails with
// its file, line and column. Each case runs a copy of the checker in a temporary repository that holds the documents
// the checker requires; the last case runs the checker on this repository.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHECKER = 'scripts/check-documents.mjs';
const FILES = ['docs/plans/execution-checklist.md', 'docs/plans/execution-checklist.ko.md'];

const FEATURES = `# Features

| ID | Feature | Status | Support | Evidence |
| --- | --- | --- | --- | --- |
| parse | Parse templates | implemented | typescript: parse | [guide](guide.md) |
`;

// A checklist with state markers and task list markers in a legend, in prose, in the text of a task, in inline code and
// in the cause of a bypassed task. Its task states, the one of the derived sub-item T1.2-1 included, are valid.
const STRAY = `# Execution checklist

- The last column of every task row is its state: \`[ ]\` waiting, \`[~]\` in progress.

Dependencies: none. A task row that is [o] is done, and a task list writes [x] or [X].

| ID | Task | Verification | Done |
| --- | --- | --- | --- |
| T1.1 | Write the parser | \`make test-ts\` | [o] |
| T1.2 | Print the state \`[~]\` of a task | \`make test-ts\` | [ ] |
| T1.2-1 | Name the union members | \`make test-ts\` | [~] |
| T1.3 | Remove the old runner | \`make test-scripts\` | [!] cause: blocked by [~] T1.2; retry: T1.2 done |
| T1.4 | Mark a task list item \`[x]\` | \`make test-ts\` | [ ] |
`;

// A checklist of only a title, a heading and a task table, with every state written in words
// outside the state cells.
const CLEAN = `# Execution checklist

## Wave 1 — Parser

| ID | Task | Verification | Done |
| --- | --- | --- | --- |
| T1.1 | Write the parser | \`make test-ts\` | [o] |
| T1.2 | Print the state of a task in progress | \`make test-ts\` | [ ] |
| T1.2-1 | Name the union members | \`make test-ts\` | [~] |
| T1.3 | Remove the old runner | \`make test-scripts\` | [!] cause: blocked by T1.2 in progress; retry: T1.2 done |
`;

// Runs a copy of the checker in a temporary repository whose English and Korean checklist is `checklist`.
function check(t, checklist) {
  const directory = mkdtempSync(path.join(tmpdir(), 'template-check-documents-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(path.join(directory, 'scripts'));
  mkdirSync(path.join(directory, 'docs/plans'), { recursive: true });
  copyFileSync(path.join(ROOT, CHECKER), path.join(directory, CHECKER));
  for (const document of ['README', 'AGENTS', 'CHANGELOG', 'docs/index', 'docs/guide']) {
    for (const suffix of ['.md', '.ko.md']) writeFileSync(path.join(directory, document + suffix), `# ${path.basename(document)}\n`);
  }
  for (const suffix of ['.md', '.ko.md']) writeFileSync(path.join(directory, `docs/features${suffix}`), FEATURES);
  for (const file of FILES) writeFileSync(path.join(directory, file), checklist);
  return spawnSync(process.execPath, [CHECKER], { cwd: directory, encoding: 'utf8' });
}

test('a marker outside a task state fails with its file, line and column', (t) => {
  const run = check(t, STRAY);
  assert.equal(run.status, 1, run.stdout + run.stderr);
  const locations = [
    ['3:52', '[ ]'], ['3:67', '[~]'], ['5:40', '[o]'], ['5:76', '[x]'], ['5:83', '[X]'], ['10:27', '[~]'], ['12:78', '[~]'],
    ['13:33', '[x]'],
  ];
  for (const file of FILES) {
    for (const [at, marker] of locations) {
      assert.ok(run.stderr.includes(`[docs] ${file}:${at}: state marker ${marker} is not the state of a task;`), run.stderr);
    }
  }
  assert.equal(run.stderr.match(/is not the state of a task/g).length, 16, run.stderr);
});

test('a line that is not a heading or a task table row fails with its location', (t) => {
  const run = check(t, STRAY);
  assert.equal(run.status, 1, run.stdout + run.stderr);
  for (const file of FILES) {
    for (const line of [3, 5]) {
      assert.ok(run.stderr.includes(`[docs] ${file}:${line}:1: the line is not a heading or a task table row;`), run.stderr);
    }
  }
  assert.equal(run.stderr.match(/the line is not a heading/g).length, 4, run.stderr);
  const paragraph = check(t, CLEAN.replace('## Wave 1 — Parser\n', '## Wave 1 — Parser\n\nDependencies: none.\n'));
  assert.equal(paragraph.status, 1, paragraph.stdout + paragraph.stderr);
  assert.match(paragraph.stderr, /\[docs\] docs\/plans\/execution-checklist\.md:5:1: the line is not a heading/);
});

test('a checklist of headings and task rows whose markers are task states passes, derived sub-items included', (t) => {
  const run = check(t, CLEAN);
  assert.equal(run.status, 0, run.stdout + run.stderr);
});

test('a derived sub-item with an invalid state fails', (t) => {
  const run = check(t, CLEAN.replace('| T1.2-1 | Name the union members | `make test-ts` | [~] |', '| T1.2-1 | Name the union members | `make test-ts` | done |'));
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /\[docs\] docs\/plans\/execution-checklist\.md: invalid task state for T1\.2-1: done/);
});

test('the documents of this repository pass', () => {
  const run = spawnSync(process.execPath, [CHECKER], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});

test('a translation link line fails with its location', (t) => {
  const run = check(t, CLEAN.replace('# Execution checklist\n\n', '# Execution checklist\n\n[한국어](/ko/plans/execution-checklist).\n\n'));
  assert.equal(run.status, 1, run.stdout + run.stderr);
  for (const file of FILES) {
    assert.ok(run.stderr.includes(`[docs] ${file}:3:1: the line is not a heading or a task table row;`), run.stderr);
  }
});
