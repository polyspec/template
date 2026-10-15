// Tests that every job of a workflow of the repository declares timeout-minutes (T24.21). Without it a job that stops
// making progress runs until GitHub's limit of 360 minutes, and the concurrency group of CI keeps every later run of main
// waiting behind it: the editor job of run 38648904745 ran for 1h50m until it was cancelled by hand. A job that fails
// the test is named with its file.
import assert from 'node:assert/strict';
import test from 'node:test';
import { jobs, WORKFLOWS } from './workflows.mts';

test('every job of a workflow declares timeout-minutes', () => {
  const found = WORKFLOWS.flatMap(file => jobs(file).map(job => ({ file, job })));
  assert.ok(found.length > 0, 'no job was found in .github/workflows; the check verified nothing');
  const failures = found.flatMap(({ file, job }) => {
    const minutes = job.value['timeout-minutes'];
    if (minutes === undefined) return [`${file}: the job ${job.name} declares no timeout-minutes`];
    if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes <= 0) {
      return [`${file}: the job ${job.name} declares timeout-minutes ${JSON.stringify(minutes)}, not a positive whole number`];
    }
    return [];
  });
  assert.deepEqual(failures, []);
});
