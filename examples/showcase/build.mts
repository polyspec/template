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
import type { Engine as TemplateEngine, RenderOptions, Template } from '@polyspec/template';
import { invoke, prepare, selectLanguages, root } from '../../tests/runner/drivers.mts';
import { isObject, list, manifestFiles, object, readJson, text, type JsonObject } from './json.mts';
import { scenarioIds } from '../../scripts/showcase-documents.mts';

const showcaseDir = join(root, 'examples', 'site');
const scenariosDir = join(showcaseDir, 'scenarios');
const dataDir = join(showcaseDir, 'data');

const options: { langs: string | undefined; mode: 'write' | 'check' | null } = { langs: undefined, mode: null };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  switch (argv[i]) {
    case '--langs': options.langs = argv[++i]; break;
    case '--write': options.mode = 'write'; break;
    case '--check': options.mode = 'check'; break;
    case '--help':
      process.stdout.write('usage: build.mts (--write|--check) [--langs ts,go,rust,php,php-ext]\n');
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

// A definition of define.json: a template path, or an entry with a template or html and optional data.
type DefineEntry = string | JsonObject;

interface Scenario {
  id: string;
  dir: string;
  target: string;
  title: string;
  description: string;
  focus: string[];
  source: string | null;
  templates: Record<string, string>;
  integrationFiles: { name: string; source: string }[];
  assign: JsonObject;
  define: Record<string, DefineEntry>;
  env: JsonObject | null;
}

function collectTemplates(dir: string, prefix = '', into: Record<string, string> = {}): Record<string, string> {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collectTemplates(path, `${prefix}${entry.name}/`, into);
    else if (entry.name.endsWith('.tpl')) into[`${prefix}${entry.name}`] = readFileSync(path, 'utf8');
  }
  return into;
}

function compiledTemplates(scenario: Scenario): Map<string, Template> {
  const artifactRoot = join(scenario.dir, 'compiled', 'ast');
  const files = manifestFiles(readJson(join(artifactRoot, 'manifest.json')), `${scenario.id}/compiled/ast/manifest.json`);
  // decodeTemplate validates each artifact against contracts/schema/ast.schema.json (AST-10).
  return new Map([...files].map(([name, path]): [string, Template] => [name, decodeTemplate(readFileSync(join(artifactRoot, path), 'utf8'))]));
}

// The showcase uses a direct key-to-template-path define contract. Object entries remain available
// for per-definition data and pre-rendered HTML where a scenario needs them.
function validateScenarioContract(scenario: Scenario): void {
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

function loadScenario(id: string): Scenario {
  const dir = join(scenariosDir, id);
  const where = `${id}/scenario.json`;
  const metadata = object(readJson(join(dir, 'scenario.json')), where);
  const has = (name: string): boolean => existsSync(join(dir, name));
  const define = has('define.json') ? object(readJson(join(dir, 'define.json')), `${id}/define.json`) : {};
  const scenario: Scenario = {
    id,
    dir,
    target: text(metadata.target, `${where}: target`),
    title: text(metadata.title, `${where}: title`),
    description: text(metadata.description, `${where}: description`),
    // focus, source and integrationFiles are optional fields of scenario.json.
    focus: metadata.focus === undefined ? [] : list(metadata.focus, `${where}: focus`).map((tag, index) => text(tag, `${where}: focus[${index}]`)),
    source: metadata.source === undefined ? null : text(metadata.source, `${where}: source`),
    templates: collectTemplates(dir),
    integrationFiles: (metadata.integrationFiles === undefined ? [] : list(metadata.integrationFiles, `${where}: integrationFiles`)).map((file, index) => {
      const name = text(file, `${where}: integrationFiles[${index}]`);
      return { name, source: readFileSync(join(dir, name), 'utf8') };
    }),
    assign: has('data.json') ? object(readJson(join(dir, 'data.json')), `${id}/data.json`) : {},
    define: Object.fromEntries(Object.entries(define).map(([key, entry]): [string, DefineEntry] => [key, typeof entry === 'string' ? entry : object(entry, `${id}/define.json: ${key}`)])),
    env: has('env.json') ? object(readJson(join(dir, 'env.json')), `${id}/env.json`) : null,
  };
  validateScenarioContract(scenario);
  return scenario;
}

/** The message of a thrown value. */
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function listScenarios(): Scenario[] {
  return scenarioIds(scenariosDir).map(loadScenario);
}

function renderArgs(scenario: Scenario): string[] {
  // CNF-4: the options before the operand.
  const args = ['render', '--root', scenario.dir];
  if (existsSync(join(scenario.dir, 'data.json'))) args.push('--data', 'data.json');
  if (existsSync(join(scenario.dir, 'define.json'))) args.push('--define', 'define.json');
  if (existsSync(join(scenario.dir, 'env.json'))) args.push('--env', 'env.json');
  return [...args, scenario.target];
}

function renderOptions(scenario: Scenario): RenderOptions {
  const result: RenderOptions = { define: scenario.define };
  if (scenario.env !== null) result.env = scenario.env;
  return result;
}

function digest(html: string): { bytes: number; sha256: string } {
  const bytes = Buffer.byteLength(html, 'utf8');
  return {
    bytes,
    sha256: createHash('sha256').update(html, 'utf8').digest('hex'),
  };
}

function directTypeScriptRender(engine: TemplateEngine, scenario: Scenario): string {
  return engine.render(scenario.target, scenario.assign, renderOptions(scenario));
}

function cliRender(language: string, scenario: Scenario): string {
  const result = invoke(language, renderArgs(scenario), scenario.dir);
  if (result.status !== 0) {
    throw new Error(`${scenario.id} [${language}] exited ${result.status}: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

function sameJson(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

const languages = selectLanguages(options.langs);
if (!languages.includes('ts')) {
  process.stderr.write('the showcase requires the ts implementation\n');
  process.exit(1);
}
for (const language of languages) prepare(language);

const { AstProgram, Engine, MapLoader, decodeTemplate } = await import('@polyspec/template');
const scenarios = listScenarios();
if (!scenarios.length) {
  process.stderr.write('no showcase scenarios found\n');
  process.exit(1);
}

const failures: string[] = [];
const resultScenarios: JsonObject[] = [];
const siteScenarios: (JsonObject & { id: string; expectedHtml: string })[] = [];

for (const scenario of scenarios) {
  const apiEngine = new Engine(new AstProgram({ loader: new MapLoader(compiledTemplates(scenario)) }));
  let apiFirst;
  let apiSecond;
  try {
    apiFirst = directTypeScriptRender(apiEngine, scenario);
    apiSecond = directTypeScriptRender(apiEngine, scenario);
  } catch (error) {
    failures.push(`${scenario.id} [ts-api] ${message(error)}`);
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

  const renders: Record<string, JsonObject> = {};
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
      failures.push(message(error));
      renders[language] = { status: 'fail', error: message(error) };
    }
  }

  resultScenarios.push({
    id: scenario.id,
    source: scenario.source,
    target: scenario.target,
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
    'Compilation mode (ast or gen), artifact refresh (dev, true or false) and final page-cache TTL (positive, zero or null) are separate runtime decisions.',
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
  const sha256 = text(result.sha256, `${String(result.id)}: sha256`);
  process.stdout.write(`${text(result.id, 'result id').padEnd(20)} ${text(result.status, 'result status').padEnd(5)} ${String(result.bytes)} bytes ${sha256.slice(0, 12)}\n`);
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
    const site = siteScenarios.find(item => item.id === scenario.id);
    if (site === undefined) throw new Error(`${scenario.id} has no rendered site entry`);
    writeFileSync(join(scenario.dir, 'expected.html'), site.expectedHtml);
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
