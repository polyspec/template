// Tests the step of the integration runner: a step has no time limit and ends by its exit code,
// and a launch whose suite has printed its result ends by that result.
import assert from 'node:assert/strict';
import test from 'node:test';

import { runStep } from './integration/step.mjs';

const SUITE_RESULT = /\[suite\] (\d+) of (\d+) checks passed/;

function collect() {
  const lines = [];
  return { lines, log: line => lines.push(line), output: () => undefined };
}

test('a step that runs longer than a small limit ends by its exit code', async () => {
  const { lines, log, output } = collect();
  const code = await runStep('slow step', process.execPath, ['-e', 'setTimeout(() => process.exit(3), 1500)'], { env: process.env, output, log, heartbeatMs: 500 });
  assert.equal(code, 3);
  assert.equal(lines[0], '[integration] start - slow step');
  assert.ok(lines.some(line => /^\[integration\] … slow step still running \(\d+\.\d s\)$/.test(line)), lines.join('\n'));
  assert.match(lines.at(-1), /^\[integration\] not ok - slow step: exit 3 \(1\.\d s\)$/);
});

test('a launch whose suite has printed its result is killed after the grace and takes that result', async () => {
  const { lines, log, output } = collect();
  const code = await runStep('launch', process.execPath, ['-e', "console.log('[suite] 2 of 2 checks passed'); setTimeout(() => {}, 600000)"], {
    env: process.env,
    output,
    log,
    graceMs: 300,
    settle: text => {
      const result = SUITE_RESULT.exec(text);
      return result ? (result[1] === result[2] ? 0 : 1) : undefined;
    },
  });
  assert.equal(code, 0);
  assert.ok(lines.includes('[integration] launch: the suite ended, VS Code did not exit within 0.3 s and was killed'), lines.join('\n'));
  assert.match(lines.at(-1), /^\[integration\] ok - launch: exit 0 \(\d+\.\d s\)$/);
});
