// Tests that the job release of release.yml (ci-release-release) pushes the tag of the Go module after it adds that tag
// to go-module-refs: release-go-module only records the reference, and without release-go-module-push the tag of the Go
// module of the release never reaches the remote. The test reads the recipe that make prints as a dry run, so it judges
// the order of the steps that the job runs.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(new URL('../..', import.meta.url).pathname);

test('ci-release-release pushes the Go module tag after release-go-module records it', () => {
  const result = spawnSync('make', ['-n', '--no-print-directory', 'ci-release-release', 'TAG=v0.0.30', 'VERSION=0.0.30'], {
    cwd: root,
    env: { ...process.env, GITHUB_ACTOR: 'dry-run' },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  const steps = result.stdout.split('\n');
  const record = steps.findIndex(line => line.includes("'release-go-module: TAG is required"));
  const push = steps.findIndex(line => line.includes("'release-go-module-push: TAG is required"));
  assert.ok(record >= 0, 'ci-release-release runs release-go-module');
  assert.ok(push > record, 'ci-release-release runs release-go-module-push after release-go-module');
});
