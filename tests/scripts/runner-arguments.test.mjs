// Tests the command lines that the conformance runner passes (CNF-4): the runner passes the options of every
// subcommand before the operand FILE (POSIX utility syntax guidelines), and a `format` result that is no outcome of
// CNF-2 is reported with its reason instead of being dropped.
import assert from 'node:assert/strict';
import test from 'node:test';

import { formatArgs, formatOutcome, parseArgs, renderArgs, tokensArgs } from '../runner/cases.mjs';

const testCase = { input: 'input.tpl', dir: '/cases/g/n', hasData: true, hasDefine: true, hasEnv: true, options: { delimiters: '[]' } };

test('every subcommand passes its options before FILE', () => {
  assert.deepEqual(parseArgs(testCase), ['parse', '--root', '/cases/g/n', '--delimiters', '[]', 'input.tpl']);
  assert.deepEqual(tokensArgs(testCase), ['tokens', '--root', '/cases/g/n', '--delimiters', '[]', 'input.tpl']);
  assert.deepEqual(renderArgs(testCase), ['render', '--root', '/cases/g/n', '--data', 'data.json', '--define', 'define.json', '--env', 'env.json', '--delimiters', '[]', 'input.tpl']);
  assert.deepEqual(formatArgs(testCase, 'keep'), ['format', '--indent', 'none', '--delimiters', '[]', 'input.tpl']);
  assert.deepEqual(formatArgs({ ...testCase, options: {} }, 'indent'), ['format', 'input.tpl']);
});

test('a format result is the text, the error or the reason it is neither', () => {
  assert.deepEqual(formatOutcome({ status: 0, stdout: 'x', stderr: '' }), { text: 'x' });
  assert.deepEqual(formatOutcome({ status: 2, stdout: '', stderr: '{"reason":"html","code":null,"line":1,"col":2,"message":"m"}' }), { error: { reason: 'html', code: null, line: 1, col: 2 } });
  assert.deepEqual(formatOutcome({ status: 1, stdout: '', stderr: 'usage\n' }), { failure: 'exit 1: usage' });
  const notJson = formatOutcome({ status: 2, stdout: '', stderr: 'boom\n' });
  assert.match(notJson.failure, /^exit 2 with a standard error that is no JSON \(.+\): boom$/);
});
