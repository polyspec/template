// The native asset job contract: matrix cardinality, scoped tools and one owner of each build and uploaded artifact. Each job
// runs its recipe ci-assets-<job> of the Makefile in its one run step (T28.61), so the installs, the release check and the
// builds of a job are the lines of that recipe.
import { isJsonObject } from '../runner/checked.mts';
import { commandsOf, jobsOf, type Job } from './workflows.mts';

const ASSET_PLATFORMS = [
  { platform: 'linux-x64-gnu', runner: 'ubuntu-26.04' },
  { platform: 'linux-arm64-gnu', runner: 'ubuntu-26.04-arm' },
  { platform: 'darwin-arm64', runner: 'macos-15' },
];
// The run step of each job, and the lines of its recipe that build: the PHP extension of the minor of the job, the native
// assets of a platform each to its end, and the npm package.
export const RUNS: Record<string, string> = {
  platform: 'make ci-assets-platform RELEASE=${{ inputs.release }}',
  php: 'make ci-assets-php EXPECTED_PHP_MINOR=${{ matrix.php }} RELEASE=${{ inputs.release }}',
  npm: 'make ci-assets-npm RELEASE=${{ inputs.release }}',
};
export const PHP_BUILD = 'make release-php-ext PHP=php EXPECTED_PHP_MINOR=$(EXPECTED_PHP_MINOR)';
export const PLATFORM_BUILD = 'make ci-targets TARGETS="release-go-static release-wheel release-npm-platform"';
export const NPM_BUILD = 'make release-npm';
// The release check runs only when the workflow release calls assets.yml with release true.
export const RELEASE_CHECK = '$(if $(filter true,$(RELEASE)),make release-binding-check)';
const BUILDS: Record<string, string> = { platform: PLATFORM_BUILD, php: PHP_BUILD, npm: NPM_BUILD };
const CONTINUE = '${{ !cancelled() }}';
const SETUP = 'shivammathur/setup-php@';
const UPLOAD = 'actions/upload-artifact@';
const TARGETS = ['release-go-static', 'release-wheel', 'release-npm-platform', 'release-php-ext', 'release-npm'];
const OWNERS = ['platform', 'platform', 'platform', 'php', 'npm'];

/** Only explicit include rows choose builds; additional matrix syntax changes the native job count. */
export function assetMatrixFindings(job: Job, minors: readonly string[]): string[] {
  const failures: string[] = [];
  const strategy = job.value.strategy;
  if (!isJsonObject(strategy) || strategy['fail-fast'] !== false) failures.push(`${job.name}: fail-fast must be false`);
  const matrix = isJsonObject(strategy) ? strategy.matrix : undefined;
  if (!isJsonObject(matrix) || Object.keys(matrix).join(',') !== 'include' || !Array.isArray(matrix.include)) {
    return [...failures, `${job.name}: matrix must contain only explicit include rows`];
  }
  const expected = job.name === 'php' ? ASSET_PLATFORMS.flatMap(platform => minors.map(php => ({ ...platform, php }))) : ASSET_PLATFORMS;
  const keys = job.name === 'php' ? ['php', 'platform', 'runner'] : ['platform', 'runner'];
  const tuples = (values: unknown[]) => values.map(value => {
    if (!isJsonObject(value) || Object.keys(value).sort().join(',') !== keys.join(',')) return 'invalid row';
    return keys.map(key => JSON.stringify(value[key])).join(':');
  }).sort();
  if (JSON.stringify(tuples(matrix.include)) !== JSON.stringify(tuples(expected))) failures.push(`${job.name}: include rows must match every native platform${job.name === 'php' ? ' and PHP minor' : ''} exactly once`);
  if (job.value['runs-on'] !== '${{ matrix.runner }}') failures.push(`${job.name}: runs-on must select matrix.runner`);
  if (job.value.if !== undefined) failures.push(`${job.name}: a job condition must not hide native matrix rows`);
  return failures;
}

/**
 * The whole workflow must have exactly one declared owner of each asset command and unique expanded artifact names. The
 * commands of a job are its run step and the lines of its recipe of `makefile`.
 */
export function assetWorkflowFindings(text: string, minors: readonly string[], makefile?: string): string[] {
  const all = jobsOf(text, '.github/workflows/assets.yml');
  const failures: string[] = [];
  const counts = new Map(TARGETS.map(target => [target, [] as string[]]));
  for (const job of all) {
    for (const step of job.steps) {
      if (step.uses?.startsWith(UPLOAD) && !['platform', 'php', 'npm'].includes(job.name)) failures.push(`${job.name}: upload has no declared asset owner`);
      if (step.uses?.startsWith(SETUP) && job.name !== 'php') failures.push(`${job.name}: PHP setup belongs only to php`);
    }
    for (const command of commandsOf(job, makefile)) {
      for (const target of TARGETS) {
        const hits = command.match(new RegExp(`(?<![\\w-])${target}(?![\\w-])`, 'g')) ?? [];
        for (const _hit of hits) counts.get(target)?.push(job.name);
        if (hits.length > 0 && command !== BUILDS[job.name]) failures.push(`${job.name}: ${target} must be built by ${BUILDS[job.name] ?? 'no command of this job'}`);
      }
    }
  }
  for (const [index, target] of TARGETS.entries()) {
    const found = counts.get(target) ?? [];
    if (found.length !== 1 || found[0] !== OWNERS[index]) failures.push(`${target}: expected one owner ${OWNERS[index]}, found ${found.join(', ') || 'none'}`);
  }
  for (const name of ['platform', 'php', 'npm']) {
    const job = all.find(each => each.name === name);
    if (job === undefined) { failures.push(`missing job ${name}`); continue; }
    if (name !== 'npm') failures.push(...assetMatrixFindings(job, minors));
    else if (job.value.strategy !== undefined || job.value['runs-on'] !== 'ubuntu-24.04') failures.push('npm: standalone job must run once on ubuntu-24.04');
    const runs = job.steps.flatMap((step, index) => step.run === undefined ? [] : [index]);
    const runAt = runs[0] ?? -1;
    const runStep = job.steps[runAt];
    if (runs.length !== 1 || runStep?.run !== RUNS[name] || runStep.if !== undefined) failures.push(`${name}: the one run step must be ${RUNS[name] ?? ''} without a condition`);
    const checkouts = job.steps.flatMap((step, index) => step.uses?.startsWith('actions/checkout@') ? [index] : []);
    const bootstraps = job.steps.flatMap((step, index) => step.uses === './.github/actions/kit-bootstrap' ? [index] : []);
    const checkout = job.steps[checkouts[0] ?? -1];
    if (checkouts.length !== 1 || checkout?.with.ref !== '${{ inputs.ref }}' || checkout.with['fetch-depth'] !== 0) failures.push(`${name}: checkout must own selected ref and full history`);
    if (bootstraps.length !== 1 || (bootstraps[0] ?? -1) <= (checkouts[0] ?? -1) || (bootstraps[0] ?? Infinity) >= runAt) failures.push(`${name}: locked bootstrap must precede its builds`);
    const commands = commandsOf(job, makefile);
    const build = commands.indexOf(BUILDS[name] ?? '');
    const required = ['make install-tools TOOLS="rust"', 'make template-install-rust', 'make release-recipes', RELEASE_CHECK,
      ...(name === 'platform' ? ['make install-tools TOOLS="uv python"'] : []),
      ...(name === 'php' ? ['make install-llvm'] : []), ...(name === 'npm' ? ['make install-wasm-bindgen'] : [])];
    for (const command of required) {
      const found = commands.flatMap((line, index) => line === command ? [index] : []);
      if (found.length !== 1 || (found[0] ?? Infinity) >= build) failures.push(`${name}: ${command} must run once in the recipe before its builds`);
    }
    for (const [before, after] of [['make install-tools TOOLS="rust"', 'make template-install-rust'], ['make template-install-rust', 'make release-recipes'], ['make release-recipes', RELEASE_CHECK]] as const) {
      if (commands.indexOf(before) >= commands.indexOf(after)) failures.push(`${name}: ${before} must precede ${after}`);
    }
    if (name === 'php') {
      const setup = job.steps.flatMap((step, index) => step.uses?.startsWith(SETUP) ? [index] : []);
      const inputs = job.steps[setup[0] ?? -1]?.with;
      if (setup.length !== 1 || (setup[0] ?? Infinity) >= runAt || (setup[0] ?? -1) <= (bootstraps[0] ?? -1)
        || inputs?.['php-version'] !== '${{ matrix.php }}' || inputs['php-version-file'] !== undefined || inputs.tools !== 'none' || inputs.coverage !== 'none') failures.push('php: one matrix.php setup with no tools or coverage must precede its build');
    }
    const uploads = job.steps.filter(step => step.uses?.startsWith(UPLOAD));
    if (uploads.length === 1 && job.steps.findIndex(step => step.uses?.startsWith(UPLOAD)) <= runAt) failures.push(`${name}: upload must follow its builds`);
    const artifact = name === 'php' ? 'assets-php-${{ matrix.platform }}-${{ matrix.php }}' : name === 'platform' ? 'assets-${{ matrix.platform }}' : 'assets-npm';
    if (uploads.length !== 1 || uploads[0]?.with.name !== artifact || uploads[0].with.path !== 'var/release/assets/' || uploads[0].with['if-no-files-found'] !== 'error' || uploads[0].if !== CONTINUE) failures.push(`${name}: upload must own ${artifact} and var/release/assets/ with !cancelled()`);
  }
  const artifacts = new Set<string>();
  for (const job of all) {
    const strategy = job.value.strategy;
    const matrix = isJsonObject(strategy) ? strategy.matrix : undefined;
    const rows = isJsonObject(matrix) && Array.isArray(matrix.include) ? matrix.include : [{}];
    for (const step of job.steps.filter(each => each.uses?.startsWith(UPLOAD))) for (const row of rows) {
      if (typeof step.with.name !== 'string' || !isJsonObject(row)) { failures.push(`${job.name}: artifact name and row must be declared`); continue; }
      const name = step.with.name.replace(/\$\{\{ matrix\.(platform|php) \}\}/g, (_match, key: string) => typeof row[key] === 'string' ? row[key] : '${{ unresolved }}');
      if (name.includes('${{')) failures.push(`${job.name}: artifact name has an unresolved selector`);
      if (artifacts.has(name)) failures.push(`duplicate artifact ${name}`);
      artifacts.add(name);
    }
  }
  return failures;
}
