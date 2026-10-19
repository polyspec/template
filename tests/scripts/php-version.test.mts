// Tests that every workflow starts the PHP that config/toolchain.json declares (T24.27). The release workflow, a copy of kit,
// runs setup-php only when the checkout has a .php-version and otherwise keeps the PHP of the runner: without the file the
// proof of v0.0.7 ran the composer consumer with the PHP 8.3.6 of Ubuntu, which the platform check of Composer refused
// (">= 8.4.0"). .php-version holds the minimum PHP release of config/toolchain.json, and each setup-php step of the
// workflows of the repository reads it, or the PHP of a matrix that lists the releases of config/toolchain.json.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { JSONSchemaType } from 'ajv';
import { jsonDocument } from '../../scripts/json-document.mts';
import { isJsonObject } from '../runner/checked.mts';
import { jobs, ROOT, WORKFLOWS, type Job } from './workflows.mts';

const SETUP_PHP = 'shivammathur/setup-php@';
const TOOLCHAIN_SCHEMA: JSONSchemaType<{ php: string[] }> = {
  type: 'object',
  properties: { php: { type: 'array', items: { type: 'string' }, minItems: 1 } },
  required: ['php'],
};
/** The PHP releases of config/toolchain.json, the minimum first. */
const releases = jsonDocument<{ php: string[] }>('config/toolchain.json', TOOLCHAIN_SCHEMA).read(path.join(ROOT, 'config/toolchain.json')).php;

/** The setup-php steps of the jobs of `file`, with the job that holds each. */
const setupPhp = (file: string): { job: Job; inputs: Record<string, unknown> }[] =>
  jobs(file).flatMap(job => job.steps.filter(step => step.uses?.startsWith(SETUP_PHP)).map(step => ({ job, inputs: step.with })));

/** The php releases of the matrix of `job`, or undefined when it has none. */
function matrixReleases(job: Job): unknown {
  const strategy = job.value.strategy;
  if (!isJsonObject(strategy) || !isJsonObject(strategy.matrix)) return undefined;
  return strategy.matrix.php;
}

test('.php-version holds the minimum PHP release of config/toolchain.json', () => {
  const file = path.join(ROOT, '.php-version');
  assert.ok(existsSync(file), '.php-version does not exist, so the release workflow of kit keeps the PHP of the runner');
  assert.equal(readFileSync(file, 'utf8'), `${releases[0]}\n`);
});

test('the release workflow starts the PHP of .php-version', () => {
  const steps = setupPhp('.github/workflows/release.yml');
  assert.equal(steps.length, 1, 'the release workflow has no single setup-php step');
  assert.equal(steps[0]?.inputs['php-version-file'], '.php-version');
});

test('every setup-php step of the workflows of the repository reads .php-version or the releases of config/toolchain.json', () => {
  const found = WORKFLOWS.flatMap(file => setupPhp(file).map(step => ({ file, ...step })));
  assert.ok(found.length > 0, 'no setup-php step was found in .github/workflows; the check verified nothing');
  const failures = found.flatMap(({ file, job, inputs }) => {
    if (inputs['php-version-file'] === '.php-version' && inputs['php-version'] === undefined) return [];
    if (inputs['php-version'] === '${{ matrix.php }}' && JSON.stringify(matrixReleases(job)) === JSON.stringify(releases)) return [];
    return [`${file}: the setup-php step of the job ${job.name} starts ${JSON.stringify(inputs['php-version'] ?? inputs['php-version-file'])}, not .php-version or a matrix of ${JSON.stringify(releases)}`];
  });
  assert.deepEqual(failures, []);
});
