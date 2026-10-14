// Tests the waits of the integration suite (T20.1-7): a wait for the format of a typed line has no time limit of its
// own, so a format that the language server applies after 5 s on a loaded machine is still seen, and only the time
// limit of the check ends a wait, with an error that names the expected and the actual text.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { bounded, eventually, textBecomes } = require('./integration/suite/wait.cjs');

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

test('the time limit of a check ends its wait and names the expected and the actual text', async () => {
  const document = delayedDocument('<ul>\n{@ x = xs}', '<ul>\n{@ x = xs}', 0);
  await assert.rejects(bounded('format on type', () => textBecomes(document, '<ul>\n  {@ x = xs}'), 300), {
    message: 'format on type exceeded its 0.3 s timeout while it waited for the text "<ul>\\n  {@ x = xs}"; the document has "<ul>\\n{@ x = xs}"',
  });
});

test('a wait whose check has ended stops polling', async () => {
  let polls = 0;
  await assert.rejects(bounded('never', () => eventually(() => { polls += 1; return false; }), 200), /exceeded its 0.2 s timeout while it waited for a condition of the check$/);
  const after = polls;
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.ok(polls <= after + 1, `the wait polled ${polls - after} more times after its check ended`);
});
