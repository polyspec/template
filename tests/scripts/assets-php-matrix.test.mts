// T28.60: independent native PHP minors and one owner of each asset. Mutations cannot silently remove a matrix build.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { assetWorkflowFindings, PHP_BUILD } from './assets-workflow.mts';
import { ROOT } from './workflows.mts';
import { isJsonObject } from '../runner/checked.mts';

const configuration: unknown = JSON.parse(readFileSync(path.join(ROOT, 'config/toolchain.json'), 'utf8'));
assert.ok(isJsonObject(configuration) && isJsonObject(configuration.phpExtension) && Array.isArray(configuration.phpExtension.minors));
const minors: string[] = configuration.phpExtension.minors.map(value => { assert.equal(typeof value, 'string'); return String(value); });
const CONTINUE = '${{ !cancelled() }}';
const tuples = [
  { platform: 'linux-x64-gnu', runner: 'ubuntu-26.04' },
  { platform: 'linux-arm64-gnu', runner: 'ubuntu-26.04-arm' },
  { platform: 'darwin-arm64', runner: 'macos-15' },
];
const checkout = { uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', with: { ref: '${{ inputs.ref }}', 'fetch-depth': 0 } };
const bootstrap = { uses: './.github/actions/kit-bootstrap' };
const run = (command: string) => ({ run: command, if: command === 'make release-binding-check' ? '${{ !cancelled() && inputs.release }}' : CONTINUE });
const setup = { uses: 'shivammathur/setup-php@eb7c497e18156a6bbabfef1d3a82760b9eda3962', if: CONTINUE, with: { 'php-version': '${{ matrix.php }}', tools: 'none', coverage: 'none' } };
const upload = (name: string) => ({ uses: 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a', if: CONTINUE, with: { name, path: 'var/release/assets/', 'if-no-files-found': 'error' } });
const prepared = [checkout, bootstrap, ...['make install-tools TOOLS="rust"', 'make template-install-rust', 'make release-recipes', 'make release-binding-check'].map(run)];
type Step = { run?: string; uses?: string; if?: string; with?: Record<string, unknown> };
type Fixture = { jobs: Record<string, { 'runs-on'?: string; if?: string; strategy?: { 'fail-fast': boolean; matrix: Record<string, unknown> & { include: Record<string, string>[] } }; steps: Step[] }> };
const initial: Fixture = { jobs: {
  platform: { 'runs-on': '${{ matrix.runner }}', strategy: { 'fail-fast': false, matrix: { include: tuples } }, steps: [...prepared, run('make install-tools TOOLS="uv python"'), run('make release-go-static'), run('make release-wheel'), run('make release-npm-platform'), upload('assets-${{ matrix.platform }}')] },
  php: { 'runs-on': '${{ matrix.runner }}', strategy: { 'fail-fast': false, matrix: { include: tuples.flatMap(tuple => ['8.4', '8.5'].map(php => ({ ...tuple, php }))) } }, steps: [...prepared, run('make install-llvm'), setup, run(PHP_BUILD), upload('assets-php-${{ matrix.platform }}-${{ matrix.php }}')] },
  npm: { 'runs-on': 'ubuntu-24.04', steps: [...prepared, run('make install-wasm-bindgen'), run('make release-npm'), upload('assets-npm')] },
} };
const specimen = JSON.stringify(initial);

test('T28.60: explicit platform and PHP include rows have scoped tools and unique asset ownership', () => {
  assert.deepEqual(assetWorkflowFindings(specimen, ['8.4', '8.5']), []);
});

const changed = (edit: (workflow: Fixture) => void) => {
  const value = structuredClone(initial);
  edit(value);
  return JSON.stringify(value);
};
const php = (value: Fixture) => { const job = value.jobs.php; assert.ok(job); return job; };
const matrix = (value: Fixture) => { const strategy = php(value).strategy; assert.ok(strategy); return strategy.matrix; };
const step = (value: Fixture, predicate: (step: Step) => boolean) => { const found = php(value).steps.find(predicate); assert.ok(found); return found; };

const mutations: [string, (workflow: Fixture) => void][] = [
  ['missing PHP job', value => { delete value.jobs.php; }],
  ['extra PHP axis', value => { matrix(value).php = ['8.4', '8.5']; }],
  ['exclude hides a row', value => { matrix(value).exclude = [{ platform: 'darwin-arm64', php: '8.5' }]; }],
  ['missing minor row', value => { matrix(value).include.pop(); }],
  ['duplicate minor row', value => { const row = matrix(value).include[0]; assert.ok(row); matrix(value).include.push(row); }],
  ['wrong minor', value => { const row = matrix(value).include[0]; assert.ok(row); row.php = '8.6'; }],
  ['wrong row runner', value => { const row = matrix(value).include[0]; assert.ok(row); row.runner = 'ubuntu-24.04'; }],
  ['extra row field', value => { const row = matrix(value).include[0]; assert.ok(row); row.extra = 'hidden'; }],
  ['wrong runner selector', value => { php(value)['runs-on'] = 'ubuntu-24.04'; }],
  ['cancel another row', value => { const strategy = php(value).strategy; assert.ok(strategy); strategy['fail-fast'] = true; }],
  ['hide job with condition', value => { php(value).if = '${{ inputs.release }}'; }],
  ['wrong setup minor', value => { const found = step(value, item => item.uses?.startsWith('shivammathur/') === true); assert.ok(found.with); found.with['php-version'] = '8.4'; }],
  ['setup reads baseline file', value => { const found = step(value, item => item.uses?.startsWith('shivammathur/') === true); assert.ok(found.with); found.with['php-version-file'] = '.php-version'; }],
  ['setup after build', value => { const job = php(value); const at = job.steps.findIndex(item => item.uses?.startsWith('shivammathur/')); const found = job.steps.splice(at, 1)[0]; assert.ok(found); job.steps.push(found); }],
  ['duplicate setup', value => { php(value).steps.push(setup); }],
  ['missing expected minor', value => { step(value, item => item.run === PHP_BUILD).run = 'make release-php-ext PHP=php'; }],
  ['wrong expected minor', value => { step(value, item => item.run === PHP_BUILD).run = 'make release-php-ext PHP=php EXPECTED_PHP_MINOR=8.4'; }],
  ['inline minor builds', value => { step(value, item => item.run === PHP_BUILD).run = `${PHP_BUILD}\n${PHP_BUILD}`; }],
  ['duplicate build owner', value => { value.jobs.extra = { steps: [run(PHP_BUILD)] }; }],
  ['missing build', value => { php(value).steps = php(value).steps.filter(item => item.run !== PHP_BUILD); }],
  ['missing LLVM', value => { php(value).steps = php(value).steps.filter(item => item.run !== 'make install-llvm'); }],
  ['missing crate inputs', value => { php(value).steps = php(value).steps.filter(item => item.run !== 'make template-install-rust'); }],
  ['missing bootstrap', value => { php(value).steps = php(value).steps.filter(item => item.uses !== './.github/actions/kit-bootstrap'); }],
  ['wrong selected ref', value => { const found = step(value, item => item.uses?.startsWith('actions/checkout@') === true); assert.ok(found.with); found.with.ref = 'main'; }],
  ['missing diagnostic guard', value => { delete step(value, item => item.run === PHP_BUILD).if; }],
  ['release check ignores release input', value => { step(value, item => item.run === 'make release-binding-check').if = CONTINUE; }],
  ['artifact omits minor', value => { const found = step(value, item => item.uses?.startsWith('actions/upload-artifact@') === true); assert.ok(found.with); found.with.name = 'assets-php-${{ matrix.platform }}'; }],
  ['artifact reads another directory', value => { const found = step(value, item => item.uses?.startsWith('actions/upload-artifact@') === true); assert.ok(found.with); found.with.path = 'var/release/'; }],
  ['extra artifact owner', value => { value.jobs.extra = { steps: [upload('assets-extra')] }; }],
  ['missing non-PHP platform', value => { const strategy = value.jobs.platform?.strategy; assert.ok(strategy); strategy.matrix.include.pop(); }],
  ['duplicate non-PHP platform', value => { const strategy = value.jobs.platform?.strategy; assert.ok(strategy); const row = strategy.matrix.include[0]; assert.ok(row); strategy.matrix.include.push(row); }],
  ['global artifact collision', value => { value.jobs.extra = { steps: [upload('assets-npm')] }; }],
  ['non-PHP extra axis', value => { const strategy = value.jobs.platform?.strategy; assert.ok(strategy); strategy.matrix.extra = ['a', 'b']; }],
  ['non-PHP duplicate owner', value => { php(value).steps.push(run('make release-wheel')); }],
];
for (const [name, mutate] of mutations) test(`T28.60: refuses ${name}`, () => {
  const broken = changed(mutate);
  assert.notEqual(broken, specimen);
  assert.notDeepEqual(assetWorkflowFindings(broken, ['8.4', '8.5']), [], name);
});

test('T28.60: the tracked assets workflow isolates PHP minors and builds every asset once', () => {
  assert.deepEqual(assetWorkflowFindings(readFileSync(path.join(ROOT, '.github/workflows/assets.yml'), 'utf8'), minors), []);
});
