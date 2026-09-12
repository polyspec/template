#!/usr/bin/env node
// Creates and verifies the committed AST artifacts used by the showcase runtimes.
// Source parsing happens here, before a service or a static page is started.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { invoke, prepare, root, selectLanguages } from '../../tests/runner/drivers.mjs';

const scenariosRoot = join(root, 'examples', 'site', 'scenarios');
const options = { langs: null, mode: null };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  switch (argv[i]) {
    case '--langs': options.langs = argv[++i]; break;
    case '--mode': options.mode = argv[++i]; break;
    case '--help':
      process.stdout.write('usage: compile.mjs --mode dev|changed|off [--langs ts,go,rust,php,php-ext]\n');
      process.exit(0);
      break;
    default:
      process.stderr.write(`unknown option: ${argv[i]}\n`);
      process.exit(1);
  }
}
if (!['dev', 'changed', 'off'].includes(options.mode)) {
  process.stderr.write('--mode must be dev, changed or off\n');
  process.exit(1);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function templates(dir, prefix = '') {
  const result = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'compiled') result.push(...templates(path, `${prefix}${entry.name}/`));
    else if (entry.isFile() && entry.name.endsWith('.tpl')) result.push(`${prefix}${entry.name}`);
  }
  return result;
}

function scenarios() {
  return readdirSync(scenariosRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(scenariosRoot, entry.name, 'scenario.json')))
    .map(entry => entry.name)
    .sort();
}

function parseArgs(language, scenarioDir, name, metadata) {
  const args = ['parse', name, '--root', scenarioDir];
  if (metadata.legacyWrappers === true) args.push('--legacy-wrappers', 'true');
  return args;
}

function artifactLanguage(language) {
  return language === 'ts' ? 'typescript' : language;
}

function artifactPaths(scenarioDir, language, name) {
  const output = join(scenarioDir, 'compiled', language, `${name}.ast.json`);
  return { output, relative: relative(join(scenarioDir, 'compiled', language), output).split('\\').join('/') };
}

function readManifest(path) {
  return existsSync(path) ? readJson(path) : null;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

function currentArtifact(scenarioDir, language, name, sourceHash) {
  const manifestPath = join(scenarioDir, 'compiled', language, 'manifest.json');
  const manifest = readManifest(manifestPath);
  const item = manifest?.templates?.[name];
  if (!item || item.sourceSha256 !== sourceHash) return null;
  const artifactPath = join(scenarioDir, 'compiled', language, item.artifact);
  if (!existsSync(artifactPath) || sha256(readFileSync(artifactPath)) !== item.artifactSha256) return null;
  return { manifest, artifactPath };
}

function compileLanguage(language, scenarioDir, metadata, names) {
  const outputName = artifactLanguage(language);
  const outputDir = join(scenarioDir, 'compiled', outputName);
  const manifestPath = join(outputDir, 'manifest.json');
  const previous = readManifest(manifestPath);
  const compiled = {};
  const failures = [];

  for (const name of names) {
    const source = readFileSync(join(scenarioDir, name));
    const sourceSha256 = sha256(source);
    const reusable = options.mode !== 'dev' && currentArtifact(scenarioDir, outputName, name, sourceSha256);
    if (reusable) {
      const item = reusable.manifest.templates[name];
      compiled[name] = item;
      continue;
    }
    if (options.mode === 'off') {
      failures.push(`${language}/${name}: compiled artifact is missing or stale`);
      continue;
    }
    const parsed = invoke(language, parseArgs(language, scenarioDir, name, metadata), scenarioDir);
    if (parsed.status !== 0) {
      failures.push(`${language}/${name}: parse exited ${parsed.status}: ${parsed.stderr.trim()}`);
      continue;
    }
    let ast;
    try {
      ast = JSON.parse(parsed.stdout);
    } catch (error) {
      failures.push(`${language}/${name}: parser did not return JSON: ${error.message}`);
      continue;
    }
    const artifact = JSON.stringify(ast, null, 2) + '\n';
    const paths = artifactPaths(scenarioDir, outputName, name);
    mkdirSync(dirname(paths.output), { recursive: true });
    writeFileSync(paths.output, artifact);
    compiled[name] = {
      artifact: paths.relative,
      sourceSha256,
      artifactSha256: sha256(Buffer.from(artifact)),
    };
  }

  if (failures.length) return failures;
  const manifest = {
    schema: 1,
    language: outputName,
    scenario: relative(scenariosRoot, scenarioDir).split('\\').join('/'),
    templates: Object.fromEntries(Object.entries(compiled).sort(([a], [b]) => a.localeCompare(b))),
  };
  const manifestText = JSON.stringify(manifest, null, 2) + '\n';
  if (options.mode !== 'off') {
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(manifestPath, manifestText);
  } else if (!previous || JSON.stringify(previous) !== JSON.stringify(manifest)) {
    failures.push(`${language}: manifest is stale`);
  }
  return failures;
}

const languages = selectLanguages(options.langs);
for (const language of languages) prepare(language);
const failures = [];
for (const id of scenarios()) {
  const scenarioDir = join(scenariosRoot, id);
  const metadata = readJson(join(scenarioDir, 'scenario.json'));
  const names = templates(scenarioDir);
  for (const language of languages) failures.push(...compileLanguage(language, scenarioDir, metadata, names).map(error => `${id}: ${error}`));
  if (!failures.some(failure => failure.startsWith(`${id}:`))) {
    const baselineLanguage = artifactLanguage(languages[0]);
    const baselineManifest = readJson(join(scenarioDir, 'compiled', baselineLanguage, 'manifest.json'));
    for (const name of names) {
      const baseline = readJson(join(scenarioDir, 'compiled', baselineLanguage, baselineManifest.templates[name].artifact));
      for (const language of languages.slice(1)) {
        const currentLanguage = artifactLanguage(language);
        const currentManifest = readJson(join(scenarioDir, 'compiled', currentLanguage, 'manifest.json'));
        const current = readJson(join(scenarioDir, 'compiled', currentLanguage, currentManifest.templates[name].artifact));
        if (JSON.stringify(canonical(current)) !== JSON.stringify(canonical(baseline))) {
          failures.push(`${id}: ${language}/${name} AST differs from ${languages[0]}/${name}`);
        }
      }
    }
  }
}
if (failures.length) {
  for (const failure of failures) process.stderr.write(failure + '\n');
  process.exit(1);
}
process.stdout.write(`compiled ${scenarios().length} scenarios across ${languages.join(', ')} in ${options.mode} mode\n`);
