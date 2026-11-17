// T28.60: independent native PHP minors and one owner of each asset. Mutations cannot silently remove a matrix build. Each job
// runs its recipe ci-assets-<job> in one run step (T28.61), so a mutation changes the workflow or the recipes of the Makefile.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { assetWorkflowFindings, NPM_BUILD, NPM_INSTALL_CHECK, PHP_BUILD, PLATFORM_BUILD, RELEASE_CHECK, RUNS } from './assets-workflow.mts';
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
const run = (name: string) => ({ run: RUNS[name] ?? '' });
const setup = { uses: 'shivammathur/setup-php@eb7c497e18156a6bbabfef1d3a82760b9eda3962', with: { 'php-version': '${{ matrix.php }}', tools: 'none', coverage: 'none' } };
const upload = (name: string) => ({ uses: 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a', if: CONTINUE, with: { name, path: 'var/release/assets/', 'if-no-files-found': 'error' } });
type Step = { run?: string; uses?: string; if?: string; with?: Record<string, unknown> };
type Fixture = { jobs: Record<string, { 'runs-on'?: string; if?: string; strategy?: { 'fail-fast': boolean; matrix: Record<string, unknown> & { include: Record<string, string>[] } }; steps: Step[] }> };
const initial: Fixture = { jobs: {
  platform: { 'runs-on': '${{ matrix.runner }}', strategy: { 'fail-fast': false, matrix: { include: tuples } }, steps: [checkout, bootstrap, run('platform'), upload('assets-${{ matrix.platform }}')] },
  php: { 'runs-on': '${{ matrix.runner }}', strategy: { 'fail-fast': false, matrix: { include: tuples.flatMap(tuple => ['8.4', '8.5'].map(php => ({ ...tuple, php }))) } }, steps: [checkout, bootstrap, setup, run('php'), upload('assets-php-${{ matrix.platform }}-${{ matrix.php }}')] },
  npm: { 'runs-on': 'ubuntu-24.04', steps: [checkout, bootstrap, run('npm'), upload('assets-npm')] },
} };
const specimen = JSON.stringify(initial);
// The recipes of the jobs, as the Makefile writes them.
const recipe = (target: string, lines: string[]) => `${target}: ## the job\n${lines.map(line => `\t${line.replace(/^make /, '$(MAKE) --no-print-directory ').replace(',make ', ',$(MAKE) --no-print-directory ')}\n`).join('')}`;
const prepared = ['make install-tools TOOLS="rust go"', 'make template-install-rust', 'make template-install-go'];
const recipes = {
  platform: [...prepared, 'make install-tools TOOLS="uv python"', 'make release-recipes', RELEASE_CHECK, PLATFORM_BUILD],
  php: ['@test -n "$(EXPECTED_PHP_MINOR)" || exit 2', ...prepared, 'make release-recipes', RELEASE_CHECK, PHP_BUILD],
  npm: [...prepared, 'make release-recipes', 'make install-wasm-bindgen', RELEASE_CHECK, NPM_BUILD, NPM_INSTALL_CHECK],
};
type Recipes = typeof recipes & { extra?: string[] };
const makefileOf = (value: Recipes) => Object.entries(value).map(([name, lines]) => recipe(`ci-assets-${name}`, lines)).join('');
const makefile = makefileOf(recipes);

test('T28.60: explicit platform and PHP include rows have scoped tools and unique asset ownership', () => {
  assert.deepEqual(assetWorkflowFindings(specimen, ['8.4', '8.5'], makefile), []);
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
  ['missing expected minor', value => { step(value, item => item.run === RUNS.php).run = 'make ci-assets-php RELEASE=${{ inputs.release }}'; }],
  ['wrong expected minor', value => { step(value, item => item.run === RUNS.php).run = 'make ci-assets-php EXPECTED_PHP_MINOR=8.4 RELEASE=${{ inputs.release }}'; }],
  ['release input dropped', value => { step(value, item => item.run === RUNS.php).run = 'make ci-assets-php EXPECTED_PHP_MINOR=${{ matrix.php }}'; }],
  ['condition on the run step', value => { step(value, item => item.run === RUNS.php).if = CONTINUE; }],
  ['second run step', value => { php(value).steps.splice(2, 0, { run: 'make release-recipes' }); }],
  ['missing run step', value => { php(value).steps = php(value).steps.filter(item => item.run === undefined); }],
  ['missing bootstrap', value => { php(value).steps = php(value).steps.filter(item => item.uses !== './.github/actions/kit-bootstrap'); }],
  ['wrong selected ref', value => { const found = step(value, item => item.uses?.startsWith('actions/checkout@') === true); assert.ok(found.with); found.with.ref = 'main'; }],
  ['artifact omits minor', value => { const found = step(value, item => item.uses?.startsWith('actions/upload-artifact@') === true); assert.ok(found.with); found.with.name = 'assets-php-${{ matrix.platform }}'; }],
  ['artifact reads another directory', value => { const found = step(value, item => item.uses?.startsWith('actions/upload-artifact@') === true); assert.ok(found.with); found.with.path = 'var/release/'; }],
  ['extra artifact owner', value => { value.jobs.extra = { steps: [upload('assets-extra')] }; }],
  ['missing non-PHP platform', value => { const strategy = value.jobs.platform?.strategy; assert.ok(strategy); strategy.matrix.include.pop(); }],
  ['duplicate non-PHP platform', value => { const strategy = value.jobs.platform?.strategy; assert.ok(strategy); const row = strategy.matrix.include[0]; assert.ok(row); strategy.matrix.include.push(row); }],
  ['global artifact collision', value => { value.jobs.extra = { steps: [upload('assets-npm')] }; }],
  ['non-PHP extra axis', value => { const strategy = value.jobs.platform?.strategy; assert.ok(strategy); strategy.matrix.extra = ['a', 'b']; }],
  ['PHP build outside its recipe', value => { value.jobs.extra = { steps: [{ run: PHP_BUILD }] }; }],
];
for (const [name, mutate] of mutations) test(`T28.60: refuses ${name}`, () => {
  const broken = changed(mutate);
  assert.notEqual(broken, specimen);
  assert.notDeepEqual(assetWorkflowFindings(broken, ['8.4', '8.5'], makefile), [], name);
});

const without = (lines: string[], line: string) => lines.filter(each => each !== line);
const recipeMutations: [string, (value: Recipes) => void][] = [
  ['missing build', value => { value.php = without(value.php, PHP_BUILD); }],
  ['missing crate inputs', value => { value.php = without(value.php, 'make template-install-rust'); }],
  ['missing release recipes', value => { value.npm = without(value.npm, 'make release-recipes'); }],
  ['missing install check of the npm archives', value => { value.npm = without(value.npm, NPM_INSTALL_CHECK); }],
  ['install check of the npm archives before the build', value => { value.npm = [NPM_INSTALL_CHECK, ...without(value.npm, NPM_INSTALL_CHECK)]; }],
  ['release check ignores release input', value => { value.php = value.php.map(line => line === RELEASE_CHECK ? 'make release-binding-check' : line); }],
  ['release check after the build', value => { value.php = [...without(value.php, RELEASE_CHECK), RELEASE_CHECK]; }],
  ['install after the build', value => { value.platform = [...without(value.platform, 'make install-tools TOOLS="uv python"'), 'make install-tools TOOLS="uv python"']; }],
  ['wrong expected minor in the recipe', value => { value.php = value.php.map(line => line === PHP_BUILD ? 'make release-php-ext PHP=php EXPECTED_PHP_MINOR=8.4' : line); }],
  ['inline minor builds', value => { value.php = [...value.php, PHP_BUILD]; }],
  ['platform assets stop at the first failure', value => { value.platform = value.platform.flatMap(line => line === PLATFORM_BUILD ? ['make release-go-static', 'make release-wheel', 'make release-npm-platform'] : [line]); }],
  ['missing platform asset', value => { value.platform = value.platform.map(line => line === PLATFORM_BUILD ? 'make ci-targets TARGETS="release-go-static release-wheel"' : line); }],
  ['non-PHP duplicate owner', value => { value.php = [...value.php, 'make release-wheel']; }],
  ['duplicate build owner', value => { value.npm = [...value.npm, PHP_BUILD]; }],
  ['missing recipe', value => { value.npm = []; }],
];
for (const [name, mutate] of recipeMutations) test(`T28.61: refuses a recipe with ${name}`, () => {
  const value: Recipes = structuredClone(recipes);
  mutate(value);
  const broken = makefileOf(value);
  assert.notEqual(broken, makefile);
  assert.notDeepEqual(assetWorkflowFindings(specimen, ['8.4', '8.5'], broken), [], name);
});

test('T28.60: the tracked assets workflow isolates PHP minors and builds every asset once', () => {
  assert.deepEqual(assetWorkflowFindings(readFileSync(path.join(ROOT, '.github/workflows/assets.yml'), 'utf8'), minors), []);
});
