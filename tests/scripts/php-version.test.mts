// Tests that every workflow starts the PHP that config/toolchain.json declares (T24.27). The release workflow, a copy of kit,
// runs setup-php only when the checkout has a .php-version and otherwise keeps the PHP of the runner: without the file the
// proof of v0.0.7 ran the composer consumer with the PHP 8.3.6 of Ubuntu, which the platform check of Composer refused
// (">= 8.4.0"). .php-version holds the minimum PHP release of config/toolchain.json, and each setup-php step of the
// workflows of the repository reads it, or the PHP of a matrix that lists the releases of config/toolchain.json. The job
// php of assets.yml is the exception: one native platform/minor row sets up matrix.php and builds with the expected
// minor guard. A minor setup in another job cannot establish the headers of this build (T28.60).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { JSONSchemaType } from 'ajv';
import { jsonDocument } from '../../scripts/json-document.mts';
import { isJsonObject } from '../runner/checked.mts';
import { jobs, ROOT, WORKFLOWS, type Job } from './workflows.mts';
import { assetWorkflowFindings } from './assets-workflow.mts';

const SETUP_PHP = 'shivammathur/setup-php@';
const ASSETS = '.github/workflows/assets.yml';
interface Toolchain {
  php: string[];
  phpExtension: { minors: string[] };
}
const MINORS = { type: 'array', items: { type: 'string', pattern: '^[0-9]+\\.[0-9]+$' }, minItems: 1 } as const;
const TOOLCHAIN_SCHEMA: JSONSchemaType<Toolchain> = {
  type: 'object',
  properties: {
    php: MINORS,
    phpExtension: { type: 'object', properties: { minors: MINORS }, required: ['minors'] },
  },
  required: ['php', 'phpExtension'],
};
const toolchain = jsonDocument<Toolchain>('config/toolchain.json', TOOLCHAIN_SCHEMA).read(path.join(ROOT, 'config/toolchain.json'));
/** The PHP releases of config/toolchain.json, the minimum first. */
const releases = toolchain.php;
/** The PHP minors for which the release builds the PHP extension (phpExtension.minors of config/toolchain.json). */
const extensionMinors = toolchain.phpExtension.minors;

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

test('every setup-php step of the workflows of the repository reads .php-version or the releases of config/toolchain.json', () => {
  const found = WORKFLOWS.flatMap(file => setupPhp(file).map(step => ({ file, ...step })))
    .filter(({ file, job }) => !(file === ASSETS && job.name === 'php'));
  assert.ok(found.length > 0, 'no setup-php step was found in .github/workflows; the check verified nothing');
  const failures = found.flatMap(({ file, job, inputs }) => {
    if (inputs['php-version-file'] === '.php-version' && inputs['php-version'] === undefined) return [];
    if (inputs['php-version'] === '${{ matrix.php }}' && JSON.stringify(matrixReleases(job)) === JSON.stringify(releases)) return [];
    return [`${file}: the setup-php step of the job ${job.name} starts ${JSON.stringify(inputs['php-version'] ?? inputs['php-version-file'])}, not .php-version or a matrix of ${JSON.stringify(releases)}`];
  });
  assert.deepEqual(failures, []);
});

test('the php asset job builds every declared minor independently with matching setup and expected-minor guard (T28.60)', () => {
  const text = readFileSync(path.join(ROOT, ASSETS), 'utf8');
  assert.deepEqual(assetWorkflowFindings(text, extensionMinors), []);
  assert.ok(assetWorkflowFindings(text, [...extensionMinors, '8.6']).some(finding => finding.includes('every native platform and PHP minor')));
});
