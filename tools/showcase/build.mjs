#!/usr/bin/env node
// Builds and verifies the executable example site.
//
// A showcase scenario contains shared templates and mock JSON. Its expected HTML is produced by the
// TypeScript API, then every CLI renders the same assign/define/env inputs twice. The build
// fails when any implementation disagrees with the expected bytes or changes its output on the
// second render.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { invoke, prepare, selectLanguages, root } from '../../tests/runner/drivers.mjs';

const showcaseDir = join(root, 'examples', 'site');
const scenariosDir = join(showcaseDir, 'scenarios');
const dataDir = join(showcaseDir, 'data');

const options = { langs: null, mode: null };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  switch (argv[i]) {
    case '--langs': options.langs = argv[++i]; break;
    case '--write': options.mode = 'write'; break;
    case '--check': options.mode = 'check'; break;
    case '--help':
      process.stdout.write('usage: build.mjs (--write|--check) [--langs ts,go,rust,php,php-ext]\n');
      process.exit(0);
      break;
    default:
      process.stderr.write(`unknown option: ${argv[i]}\n`);
      process.exit(1);
  }
}
if (options.mode === null) {
  process.stderr.write('one of --write or --check is required\n');
  process.exit(1);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function collectTemplates(dir, prefix = '', into = {}) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collectTemplates(path, `${prefix}${entry.name}/`, into);
    else if (entry.name.endsWith('.tpl')) into[`${prefix}${entry.name}`] = readFileSync(path, 'utf8');
  }
  return into;
}

function compiledTemplates(scenario) {
  const artifactRoot = join(scenario.dir, 'compiled', 'typescript');
  const manifest = readJson(join(artifactRoot, 'manifest.json'));
  return Object.fromEntries(Object.entries(manifest.templates).map(([name, entry]) => [
    name,
    readJson(join(artifactRoot, entry.artifact)),
  ]));
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// The showcase uses a direct key-to-template-path define contract. Object entries remain available
// for per-definition data and pre-rendered HTML where a scenario needs them.
function validateScenarioContract(scenario) {
  if (!isObject(scenario.assign)) throw new Error(`${scenario.id}: data.json must contain an object`);
  if (!isObject(scenario.define)) throw new Error(`${scenario.id}: define.json must contain an object`);
  for (const [id, entry] of Object.entries(scenario.define)) {
    if (typeof entry === 'string') continue;
    if (!isObject(entry)) throw new Error(`${scenario.id}: define ${id} must be an object`);
    const keys = Object.keys(entry);
    if (keys.some(key => !['template', 'data', 'html'].includes(key))) {
      throw new Error(`${scenario.id}: define ${id} has an unknown field`);
    }
    const hasTemplate = typeof entry.template === 'string';
    const hasHtml = typeof entry.html === 'string';
    if (hasTemplate === hasHtml) throw new Error(`${scenario.id}: define ${id} needs exactly one of template or html`);
    if (entry.data !== undefined && (!hasTemplate || !isObject(entry.data))) {
      throw new Error(`${scenario.id}: define ${id}.data must be an object with a template entry`);
    }
  }
  const targetEntry = scenario.define[scenario.target];
  if (typeof targetEntry !== 'string' && (!targetEntry || typeof targetEntry.template !== 'string')) {
    throw new Error(`${scenario.id}: target ${scenario.target} must resolve through a template define`);
  }
  if (scenario.env !== null && !isObject(scenario.env)) throw new Error(`${scenario.id}: env.json must contain an object`);
}

function loadScenario(id) {
  const dir = join(scenariosDir, id);
  const metadata = readJson(join(dir, 'scenario.json'));
  const has = name => existsSync(join(dir, name));
  const sourceManifest = has('source-manifest.json') ? readJson(join(dir, 'source-manifest.json')) : null;
  const scenario = {
    id,
    dir,
    target: metadata.target,
    legacyWrappers: metadata.legacyWrappers === true,
    title: metadata.title,
    description: metadata.description,
    focus: metadata.focus ?? [],
    source: metadata.source ?? null,
    sourceManifest,
    templates: collectTemplates(dir),
    integrationFiles: (metadata.integrationFiles ?? []).map(file => ({
      name: file,
      source: readFileSync(join(dir, file), 'utf8'),
    })),
    assign: has('data.json') ? readJson(join(dir, 'data.json')) : {},
    define: has('define.json') ? readJson(join(dir, 'define.json')) : {},
    env: has('env.json') ? readJson(join(dir, 'env.json')) : null,
  };
  validateScenarioContract(scenario);
  return scenario;
}

function verifySourceSnapshot(scenario) {
  if (!scenario.sourceManifest) return [];
  const failures = [];
  for (const file of scenario.sourceManifest.files ?? []) {
    const snapshotPath = join(scenario.dir, file.snapshot);
    if (!existsSync(snapshotPath)) {
      failures.push(`source snapshot is missing: ${file.snapshot}`);
      continue;
    }
    const snapshotHash = sha256File(snapshotPath);
    if (snapshotHash !== file.sha256) {
      failures.push(`source snapshot hash changed: ${file.snapshot}`);
    }
  }
  return failures;
}

function listScenarios() {
  return readdirSync(scenariosDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(scenariosDir, entry.name, 'scenario.json')))
    .map(entry => entry.name)
    .sort()
    .map(loadScenario);
}

function renderArgs(scenario) {
  const args = ['render', scenario.target, '--root', scenario.dir];
  if (existsSync(join(scenario.dir, 'data.json'))) args.push('--data', 'data.json');
  if (existsSync(join(scenario.dir, 'define.json'))) args.push('--define', 'define.json');
  if (existsSync(join(scenario.dir, 'env.json'))) args.push('--env', 'env.json');
  if (scenario.legacyWrappers) args.push('--legacy-wrappers', 'true');
  return args;
}

function renderOptions(scenario) {
  const result = { define: scenario.define };
  if (scenario.env !== null) result.env = scenario.env;
  return result;
}

function digest(html) {
  const bytes = Buffer.byteLength(html, 'utf8');
  return {
    bytes,
    sha256: createHash('sha256').update(html, 'utf8').digest('hex'),
  };
}

function directTypeScriptRender(engine, scenario) {
  return engine.render(scenario.target, scenario.assign, renderOptions(scenario));
}

function cliRender(language, scenario) {
  const result = invoke(language, renderArgs(scenario), scenario.dir);
  if (result.status !== 0) {
    throw new Error(`${scenario.id} [${language}] exited ${result.status}: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

function sameJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

const languages = selectLanguages(options.langs);
if (!languages.includes('ts')) {
  process.stderr.write('the showcase requires the ts implementation\n');
  process.exit(1);
}
for (const language of languages) prepare(language);

const { Engine, MapLoader } = await import(join(root, 'packages', 'template-ts', 'dist', 'index.mjs'));
const scenarios = listScenarios();
if (!scenarios.length) {
  process.stderr.write('no showcase scenarios found\n');
  process.exit(1);
}

const failures = [];
const resultScenarios = [];
const siteScenarios = [];

for (const scenario of scenarios) {
  for (const failure of verifySourceSnapshot(scenario)) failures.push(`${scenario.id}: ${failure}`);
  const apiEngine = new Engine({ loader: new MapLoader(compiledTemplates(scenario)), legacyWrappers: scenario.legacyWrappers });
  let apiFirst;
  let apiSecond;
  try {
    apiFirst = directTypeScriptRender(apiEngine, scenario);
    apiSecond = directTypeScriptRender(apiEngine, scenario);
  } catch (error) {
    failures.push(`${scenario.id} [ts-api] ${error.message}`);
    continue;
  }
  const expected = digest(apiFirst);
  const apiRepeat = digest(apiSecond);
  if (apiFirst !== apiSecond) {
    failures.push(`${scenario.id} [ts-api] repeated render changed output`);
  }

  const expectedPath = join(scenario.dir, 'expected.html');
  if (options.mode === 'check') {
    if (!existsSync(expectedPath)) {
      failures.push(`${scenario.id}: expected.html is missing`);
    } else {
      const stored = readFileSync(expectedPath, 'utf8');
      if (stored !== apiFirst) failures.push(`${scenario.id}: expected.html differs from the TypeScript API`);
    }
  }

  const renders = {};
  let scenarioPassed = apiFirst === apiSecond;
  for (const language of languages) {
    try {
      const first = cliRender(language, scenario);
      const second = cliRender(language, scenario);
      const firstDigest = digest(first);
      const secondDigest = digest(second);
      const repeatEqual = first === second;
      const expectedEqual = first === apiFirst;
      const passed = repeatEqual && expectedEqual;
      if (!passed) {
        scenarioPassed = false;
        if (!repeatEqual) failures.push(`${scenario.id} [${language}] repeated render changed output`);
        if (!expectedEqual) failures.push(`${scenario.id} [${language}] output differs from ts-api (${firstDigest.sha256.slice(0, 12)})`);
      }
      renders[language] = {
        bytes: firstDigest.bytes,
        sha256: firstDigest.sha256,
        repeatSha256: secondDigest.sha256,
        repeatEqual,
        expectedEqual,
        status: passed ? 'pass' : 'fail',
      };
    } catch (error) {
      scenarioPassed = false;
      failures.push(error.message);
      renders[language] = { status: 'fail', error: error.message };
    }
  }

  resultScenarios.push({
    id: scenario.id,
    source: scenario.source,
    target: scenario.target,
    legacyWrappers: scenario.legacyWrappers,
    bytes: expected.bytes,
    sha256: expected.sha256,
    api: {
      bytes: expected.bytes,
      sha256: expected.sha256,
      repeatSha256: apiRepeat.sha256,
      repeatEqual: apiFirst === apiSecond,
    },
    renders,
    status: scenarioPassed ? 'pass' : 'fail',
  });
  siteScenarios.push({
    id: scenario.id,
    title: scenario.title,
    description: scenario.description,
    focus: scenario.focus,
    source: scenario.source,
    target: scenario.target,
    legacyWrappers: scenario.legacyWrappers,
    templates: scenario.templates,
    integrationFiles: scenario.integrationFiles,
    assign: scenario.assign,
    define: scenario.define,
    env: scenario.env,
    expectedHtml: apiFirst,
    expectedBytes: expected.bytes,
    expectedSha256: expected.sha256,
  });
}

const results = {
  schema: 1,
  languages,
  proof: [
    'Every language rendered the same UTF-8 bytes as the TypeScript API.',
    'Every language rendered each scenario twice with the same output.',
    'The TypeScript API rendered each scenario twice with the same output.',
    'Every scenario renders the layout definition with shared mock assign data; the page composition example keeps layout, contents, loop and conditional behavior visible in small source templates.',
  ],
  scenarios: resultScenarios,
  status: failures.length === 0 ? 'pass' : 'fail',
};
const siteData = {
  schema: 1,
  generatedFrom: 'examples/site/scenarios',
  scenarios: siteScenarios,
};

process.stdout.write(`showcase ${scenarios.length} scenarios across ${languages.join(', ')}\n`);
for (const result of resultScenarios) {
  process.stdout.write(`${result.id.padEnd(20)} ${result.status.padEnd(5)} ${result.bytes} bytes ${result.sha256.slice(0, 12)}\n`);
}
if (failures.length) {
  for (const failure of failures) process.stderr.write(`${failure}\n`);
  process.exit(1);
}

const siteDataPath = join(dataDir, 'scenarios.json');
const resultsPath = join(dataDir, 'results.json');
if (options.mode === 'write') {
  mkdirSync(dataDir, { recursive: true });
  for (const scenario of scenarios) {
    const expected = siteScenarios.find(item => item.id === scenario.id).expectedHtml;
    writeFileSync(join(scenario.dir, 'expected.html'), expected);
  }
  writeFileSync(siteDataPath, JSON.stringify(siteData, null, 2) + '\n');
  writeFileSync(resultsPath, JSON.stringify(results, null, 2) + '\n');
  process.stdout.write(`wrote ${relative(root, siteDataPath)} and ${relative(root, resultsPath)}\n`);
} else {
  if (!existsSync(siteDataPath) || !sameJson(readJson(siteDataPath), siteData)) {
    failures.push(`${relative(root, siteDataPath)} is stale; run make showcase`);
  }
  if (!existsSync(resultsPath) || !sameJson(readJson(resultsPath), results)) {
    failures.push(`${relative(root, resultsPath)} is stale; run make showcase`);
  }
  if (failures.length) {
    for (const failure of failures) process.stderr.write(`${failure}\n`);
    process.exit(1);
  }
  process.stdout.write(`checked ${relative(root, siteDataPath)} and ${relative(root, resultsPath)}\n`);
}
