// Tests that every workflow starts the PHP that config/toolchain.json declares (T24.27). The release workflow, a copy of kit,
// runs setup-php only when the checkout has a .php-version and otherwise keeps the PHP of the runner: without the file the
// proof of v0.0.7 ran the composer consumer with the PHP 8.3.6 of Ubuntu, which the platform check of Composer refused
// (">= 8.4.0"). .php-version holds the minimum PHP release of config/toolchain.json, and each setup-php step of the
// workflows of the repository reads it, or the PHP of a matrix that lists the releases of config/toolchain.json. The job
// platform of assets.yml is the exception: it builds the PHP extension of its platform for each PHP minor that
// phpExtension.minors of config/toolchain.json names, one setup-php step and one `make release-php-ext PHP=php` per minor in
// that order, because a PHP extension loads only into the PHP minor whose headers built it (binding GN-19d).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { JSONSchemaType } from 'ajv';
import { jsonDocument } from '../../scripts/json-document.mts';
import { isJsonObject } from '../runner/checked.mts';
import { jobs, jobsOf, ROOT, WORKFLOWS, type Job } from './workflows.mts';

const SETUP_PHP = 'shivammathur/setup-php@';
const ASSETS = '.github/workflows/assets.yml';
const BUILD_EXTENSION = 'make release-php-ext PHP=php';
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
    .filter(({ file, job }) => !(file === ASSETS && job.name === 'platform'));
  assert.ok(found.length > 0, 'no setup-php step was found in .github/workflows; the check verified nothing');
  const failures = found.flatMap(({ file, job, inputs }) => {
    if (inputs['php-version-file'] === '.php-version' && inputs['php-version'] === undefined) return [];
    if (inputs['php-version'] === '${{ matrix.php }}' && JSON.stringify(matrixReleases(job)) === JSON.stringify(releases)) return [];
    return [`${file}: the setup-php step of the job ${job.name} starts ${JSON.stringify(inputs['php-version'] ?? inputs['php-version-file'])}, not .php-version or a matrix of ${JSON.stringify(releases)}`];
  });
  assert.deepEqual(failures, []);
});

/**
 * The findings of the job platform of the assets workflow `text`: it sets up each PHP minor of `minors` with setup-php and
 * php-version and builds the extension after each with `make release-php-ext PHP=php`, in the order of `minors`, and sets
 * up no other PHP.
 */
function extensionMinorFindings(text: string, minors: string[]): string[] {
  const platform = jobsOf(text, ASSETS).find(job => job.name === 'platform');
  if (platform === undefined) return [`${ASSETS} has no job platform`];
  const set: string[] = [];
  const built: string[] = [];
  let current: string | undefined;
  for (const step of platform.steps) {
    if (step.uses?.startsWith(SETUP_PHP) === true) {
      const version = step.with['php-version'];
      current = typeof version === 'string' ? version : JSON.stringify(version ?? step.with['php-version-file']);
      set.push(current);
    }
    if (step.run === BUILD_EXTENSION && current !== undefined) built.push(current);
  }
  const found: string[] = [];
  if (set.join(' ') !== minors.join(' ')) found.push(`${ASSETS}: the job platform sets up PHP ${set.join(', ') || 'none'}, not the minors ${minors.join(', ')} of phpExtension.minors of config/toolchain.json`);
  if (built.join(' ') !== minors.join(' ')) found.push(`${ASSETS}: the job platform builds the PHP extension for PHP ${built.join(', ') || 'none'}, not for the minors ${minors.join(', ')} of phpExtension.minors of config/toolchain.json`);
  return found;
}

test('the job platform of assets.yml builds the PHP extension for each minor of phpExtension.minors and for no other', () => {
  const sample = `jobs:
  platform:
    runs-on: \${{ matrix.runner }}
    steps:
      - uses: shivammathur/setup-php@eb7c497e18156a6bbabfef1d3a82760b9eda3962
        with:
          php-version: '8.4'
      - run: ${BUILD_EXTENSION}
      - uses: shivammathur/setup-php@eb7c497e18156a6bbabfef1d3a82760b9eda3962
        with:
          php-version: '8.5'
      - run: ${BUILD_EXTENSION}
`;
  assert.deepEqual(extensionMinorFindings(sample, ['8.4', '8.5']), []);
  assert.deepEqual(extensionMinorFindings(sample, ['8.4', '8.5', '8.6']), [
    `${ASSETS}: the job platform sets up PHP 8.4, 8.5, not the minors 8.4, 8.5, 8.6 of phpExtension.minors of config/toolchain.json`,
    `${ASSETS}: the job platform builds the PHP extension for PHP 8.4, 8.5, not for the minors 8.4, 8.5, 8.6 of phpExtension.minors of config/toolchain.json`,
  ]);
  assert.deepEqual(extensionMinorFindings(sample.replace(/ {6}- run: make release-php-ext PHP=php\n$/, ''), ['8.4', '8.5']), [
    `${ASSETS}: the job platform builds the PHP extension for PHP 8.4, not for the minors 8.4, 8.5 of phpExtension.minors of config/toolchain.json`,
  ]);
  assert.deepEqual(extensionMinorFindings(readFileSync(path.join(ROOT, ASSETS), 'utf8'), extensionMinors), []);
});
