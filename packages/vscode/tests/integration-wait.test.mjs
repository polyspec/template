// Tests the waits of the integration suite (T20.1-7, T28.146): a wait for the format of a typed line has no time limit,
// so a format that the language server applies after 5 s on a loaded machine is still seen, and a wait that does not
// see its condition at once logs what it waits for, with the expected and the actual text.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { eventually, textBecomes } = require('./integration/suite/wait.cjs');

// A document whose text becomes `after` once `delayMs` have passed, as an on-type format applied late.
function delayedDocument(before, after, delayMs) {
  let text = before;
  const timer = setTimeout(() => { text = after; }, delayMs);
  return { getText: () => text, stop: () => clearTimeout(timer) };
}

test('a wait sees a format that is applied after 5 s', async () => {
  const document = delayedDocument('<ul>\n{@ x = xs}', '<ul>\n  {@ x = xs}', 5_500);
  try {
    await textBecomes(document, '<ul>\n  {@ x = xs}');
    assert.equal(document.getText(), '<ul>\n  {@ x = xs}');
  } finally {
    document.stop();
  }
});

test('a wait that does not see its condition at once logs the expected and the actual text', async () => {
  const document = delayedDocument('<ul>\n{@ x = xs}', '<ul>\n  {@ x = xs}', 300);
  const lines = [];
  try {
    await textBecomes(document, '<ul>\n  {@ x = xs}', line => lines.push(line));
  } finally {
    document.stop();
  }
  assert.deepEqual(lines, ['[suite] waiting for the text "<ul>\\n  {@ x = xs}"; the document has "<ul>\\n{@ x = xs}"']);
});

test('a wait that sees its condition at once logs nothing', async () => {
  const lines = [];
  assert.equal(await eventually(() => 'ready', undefined, line => lines.push(line)), 'ready');
  assert.deepEqual(lines, []);
});
