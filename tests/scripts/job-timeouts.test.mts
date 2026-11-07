// Builds, downloads and full runs keep their own progress reporting and exit
// status. A short deadline on the whole job must not cancel successful tests
// or a normal installation.
import assert from 'node:assert/strict';
import test from 'node:test';
import { jobs, WORKFLOWS } from './workflows.mts';

test('template-owned workflow jobs impose no deadline on whole operations', () => {
  const found = WORKFLOWS.flatMap(file => jobs(file).map(job => ({ file, job })));
  assert.ok(found.length > 0, 'no template-owned workflow job was checked');
  const failures = found.flatMap(({ file, job }) => job.value['timeout-minutes'] === undefined ? [] : [
    `${file}: ${job.name} imposes a whole-job deadline of ${JSON.stringify(job.value['timeout-minutes'])} minutes`,
  ]);
  assert.deepEqual(failures, []);
});
