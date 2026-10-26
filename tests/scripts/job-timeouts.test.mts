// Builds, downloads and full runs keep their own progress reporting and exit
// status. A short deadline on the whole job must not cancel successful tests
// or a normal installation. Shared workflows remain owned by their package.
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { jsonDocument } from '../../scripts/json-document.mts';
import { jobs, WORKFLOWS } from './workflows.mts';

const metadata = jsonDocument<{ kit: { copies: Record<string, string> } }>('shared workflow ownership', {
  type: 'object', required: ['kit'], properties: { kit: {
    type: 'object', required: ['copies'], properties: { copies: {
      type: 'object', required: [], additionalProperties: { type: 'string' },
    } },
  } },
}).read(fileURLToPath(import.meta.resolve('@polyspec/kit/package.json')));
const shared = new Set(Object.keys(metadata.kit.copies));

test('template-owned workflow jobs impose no deadline on whole operations', () => {
  const owned = WORKFLOWS.filter(file => !shared.has(file));
  const found = owned.flatMap(file => jobs(file).map(job => ({ file, job })));
  assert.ok(found.length > 0, 'no template-owned workflow job was checked');
  const failures = found.flatMap(({ file, job }) => job.value['timeout-minutes'] === undefined ? [] : [
    `${file}: ${job.name} imposes a whole-job deadline of ${JSON.stringify(job.value['timeout-minutes'])} minutes`,
  ]);
  assert.deepEqual(failures, []);
});
