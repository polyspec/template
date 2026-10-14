#!/usr/bin/env node
// Builds the showcase as complete static HTML. The browser does not parse or render templates.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyze, AstProgram, MapLoader } from '@polyspec/template';
import { root } from '../../tests/runner/drivers.mts';
import { showcasePhpDirectory } from './php-namespace.mts';
import { list, manifestFiles, number, object, readJson, text } from './json.mts';

const site = join(root, 'examples', 'site');

// The site data that build.mts writes: each scenario with its inputs and the HTML of the TypeScript API.
interface SiteScenario {
  id: string;
  title: string;
  description: string;
  focus: string[];
  templates: Record<string, string>;
  integrationFiles: { name: string; source: string }[];
  assign: unknown;
  define: unknown;
  expectedHtml: string;
}

// The results that build.mts writes: the status of each language in each scenario.
interface ScenarioResult {
  id: string;
  bytes: number;
  sha256: string;
  renders: Map<string, string>;
}

const texts = (value: unknown, what: string): string[] => list(value, what).map((item, index) => text(item, `${what}[${index}]`));
const textMap = (value: unknown, what: string): Record<string, string> =>
  Object.fromEntries(Object.entries(object(value, what)).map(([key, item]) => [key, text(item, `${what}.${key}`)]));
const median = (value: unknown, what: string): number => number(object(value, what).median, `${what}.median`);

function siteScenario(value: unknown, index: number): SiteScenario {
  const where = `examples/site/data/scenarios.json: scenarios[${index}]`;
  const scenario = object(value, where);
  return {
    id: text(scenario.id, `${where}.id`),
    title: text(scenario.title, `${where}.title`),
    description: text(scenario.description, `${where}.description`),
    focus: texts(scenario.focus, `${where}.focus`),
    templates: textMap(scenario.templates, `${where}.templates`),
    integrationFiles: list(scenario.integrationFiles, `${where}.integrationFiles`).map((file, fileIndex) => {
      const entry = object(file, `${where}.integrationFiles[${fileIndex}]`);
      return { name: text(entry.name, `${where}.integrationFiles[${fileIndex}].name`), source: text(entry.source, `${where}.integrationFiles[${fileIndex}].source`) };
    }),
    assign: scenario.assign,
    define: scenario.define,
    expectedHtml: text(scenario.expectedHtml, `${where}.expectedHtml`),
  };
}

function scenarioResult(value: unknown, index: number): ScenarioResult {
  const where = `examples/site/data/results.json: scenarios[${index}]`;
  const result = object(value, where);
  const renders = object(result.renders, `${where}.renders`);
  return {
    id: text(result.id, `${where}.id`),
    bytes: number(result.bytes, `${where}.bytes`),
    sha256: text(result.sha256, `${where}.sha256`),
    renders: new Map(Object.entries(renders).map(([language, render]) => [language, text(object(render, `${where}.renders.${language}`).status, `${where}.renders.${language}.status`)])),
  };
}

const resultsFile = object(readJson(join(site, 'data', 'results.json')), 'examples/site/data/results.json');
const results = {
  languages: texts(resultsFile.languages, 'examples/site/data/results.json: languages'),
  status: text(resultsFile.status, 'examples/site/data/results.json: status'),
  scenarios: list(resultsFile.scenarios, 'examples/site/data/results.json: scenarios').map(scenarioResult),
};
const scenarios = list(object(readJson(join(site, 'data', 'scenarios.json')), 'examples/site/data/scenarios.json').scenarios, 'examples/site/data/scenarios.json: scenarios').map(siteScenario);
const benchmark = list(readJson(join(site, 'data', 'benchmark.json')), 'examples/site/data/benchmark.json').map((value, index) => {
  const where = `examples/site/data/benchmark.json[${index}]`;
  const row = object(value, where);
  return { fixture: text(row.fixture, `${where}.fixture`), lang: text(row.lang, `${where}.lang`), iters: number(row.iters, `${where}.iters`), outputSha256: text(row.output_sha256, `${where}.output_sha256`) };
});
const modeBenchmark = list(object(readJson(join(site, 'data', 'mode-benchmark.json')), 'examples/site/data/mode-benchmark.json').results, 'examples/site/data/mode-benchmark.json: results').map((value, index) => {
  const where = `examples/site/data/mode-benchmark.json: results[${index}]`;
  const row = object(value, where);
  return {
    language: text(row.language, `${where}.language`),
    mode: text(row.mode, `${where}.mode`),
    coldProcessMs: median(row.cold_process_ms, `${where}.cold_process_ms`),
    renderMs: median(row.render_ms, `${where}.render_ms`),
    preparedRenderMs: median(row.prepared_render_ms, `${where}.prepared_render_ms`),
    persistentRssMib: median(row.persistent_rss_mib, `${where}.persistent_rss_mib`),
    outputBytes: number(row.output_bytes, `${where}.output_bytes`),
    outputSha256: text(row.output_sha256, `${where}.output_sha256`),
  };
});
const check = process.argv.includes('--check');

function escapeHtml(value: string | number): string {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function highlightEscapedHtml(escaped: string): string {
  return escaped
    .replace(/(&lt;!--[\s\S]*?--&gt;)|(&lt;\/?[A-Za-z][\s\S]*?&gt;)/g, (token: string, comment: string | undefined, tag: string | undefined) => {
      if (comment) return `<span class="syntax-comment">${comment}</span>`;
      if (tag === undefined) throw new Error(`the highlighted token ${token} is neither a comment nor a tag`);
      return tag
        .replace(/^(&lt;\/?)([A-Za-z][\w:-]*)([\s\S]*?)(\/?&gt;)$/, '$1<span class="syntax-tag">$2</span>$3$4')
        .replace(/([\w:-]+)(=)(&quot;[\s\S]*?&quot;|&#39;[\s\S]*?&#39;)/g, '<span class="syntax-attr">$1</span>$2<span class="syntax-string">$3</span>');
    });
}

function highlightTemplate(source: string, name: string): string {
  const analysis = analyze(source, name);
  let highlighted = '';
  let cursor = 0;
  for (const tag of analysis.tags) {
    highlighted += highlightEscapedHtml(escapeHtml(source.slice(cursor, tag.start)));
    let tagHtml = '';
    let tagCursor = tag.start;
    for (const token of analysis.tokens.filter(item => item.start >= tag.start && item.end <= tag.end)) {
      tagHtml += escapeHtml(source.slice(tagCursor, token.start));
      tagHtml += `<span class="syntax-${token.kind}">${escapeHtml(source.slice(token.start, token.end))}</span>`;
      tagCursor = token.end;
    }
    tagHtml += escapeHtml(source.slice(tagCursor, tag.end));
    highlighted += `<span class="syntax-template syntax-${tag.kind}">${tagHtml}</span>`;
    cursor = tag.end;
  }
  return highlighted + highlightEscapedHtml(escapeHtml(source.slice(cursor)));
}

function digest(value: string): string {
  return `${Buffer.byteLength(value, 'utf8')} bytes · ${createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 12)}…`;
}

function code(label: string, value: string, highlighted = false, scrollable = false): string {
  const content = highlighted ? value : escapeHtml(value);
  const classes = [highlighted ? 'template-files' : '', scrollable ? 'long-code' : ''].filter(Boolean).join(' ');
  return `<details open><summary>${escapeHtml(label)}</summary><pre${classes ? ` class="${classes}"` : ''}>${content}</pre></details>`;
}

function scenarioCard(scenario: SiteScenario, result: ScenarioResult): string {
  const artifactRoot = join(site, 'scenarios', scenario.id, 'compiled', 'ast');
  const artifact = readJson(join(artifactRoot, 'manifest.json'));
  const files = manifestFiles(artifact, `${scenario.id}/compiled/ast/manifest.json`);
  const templateSource = Object.entries(scenario.templates).map(([name, source]) => `--- ${name}\n${highlightTemplate(source, name)}`).join('\n\n');
  const integrationSource = scenario.integrationFiles.map(file => `--- ${file.name}\n${escapeHtml(file.source)}`).join('\n\n');
  const generatedSource: string = ([
    ['typescript', join(root, 'examples', 'showcase', 'adapters', 'generated', 'typed', `${scenario.id}.ts`)],
    ['javascript', join(root, 'examples', 'showcase', 'adapters', 'generated', 'javascript', `${scenario.id}.js`)],
    ['go', join(root, 'examples', 'showcase', 'adapters', 'go', 'generated', scenario.id, 'generated.go')],
    ['rust', join(root, 'examples', 'showcase', 'adapters', 'generated', 'typed', `${scenario.id}.rust`)],
    // The PHP program is a directory of PSR-4 files (T25.1); the page shows its templates.
    ['php', join(root, showcasePhpDirectory(scenario.id)), 'GeneratedTemplates.php'],
  ] satisfies [string, string, string?][]).map(([language, path, shown]) => `${language} · product generated program\n${readFileSync(`${path}.manifest.json`, 'utf8')}\n${readFileSync(shown ? join(path, shown) : path, 'utf8')}`).join('\n\n');
  const artifactFiles = [...files].map(([name, path]) => {
    const source = readFileSync(join(artifactRoot, path), 'utf8');
    return `ast/${path} · ${name}\n${source}`;
  }).join('\n\n');
  const artifactText = `ast/manifest.json\n${JSON.stringify(artifact, null, 2)}\n\n${artifactFiles}`;
  const proofCells = results.languages.map(language => {
    const status = result.renders.get(language);
    return `<td class="${status === 'pass' ? 'pass' : 'fail'}">${status?.toUpperCase() ?? 'N/A'}</td>`;
  }).join('');
  return `<article class="scenario" id="${escapeHtml(scenario.id)}">
  <header class="scenario-header"><div><h3>${escapeHtml(scenario.title)}</h3><p>${escapeHtml(scenario.description)}</p></div><div class="tags">${scenario.focus.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div></header>
  <div class="scenario-meta">
  <section class="source"><p class="output-label">Inputs</p>${code('assign', JSON.stringify(scenario.assign, null, 2))}${code('define', JSON.stringify(scenario.define, null, 2))}${code('templates · parser ranges', templateSource, true)}${scenario.integrationFiles.length ? code('integration source', integrationSource, true) : ''}${code('compiled artifacts', artifactText, false, true)}${code('generated renderers', generatedSource, false, true)}</section>
    <section class="output"><p class="output-label">Output · ${escapeHtml(digest(scenario.expectedHtml))}</p><pre>${highlightEscapedHtml(escapeHtml(scenario.expectedHtml))}</pre><table><thead><tr><th>Implementation</th>${results.languages.map(language => `<th>${escapeHtml(language)}</th>`).join('')}</tr></thead><tbody><tr><td>artifact render</td>${proofCells}</tr></tbody></table></section>
  </div>
</article>`;
}

const objectCallTemplate = '<article><h1>{= order.label}</h1><p>{= order.status_label("ready")}</p><p>{= Order::suffix("!")}</p></article>\n';
class ShowcaseOrder {
  label = 'Order 12';
  status_label(prefix: unknown): string { return `${String(prefix)}:12`; }
}
const objectCallProgram = new AstProgram({
  loader: new MapLoader(new Map([['object-calls.tpl', objectCallTemplate]])),
  classFunctions: { 'Order::suffix': ([suffix]) => `done${String(suffix)}` },
});
const objectCallOutput = objectCallProgram.render('object-calls.tpl', { order: new ShowcaseOrder() });
const objectCallSource = `class Order { public label = 'Order 12'; public status_label(prefix) { return prefix + ':12'; } }\nconst assign = { order: new Order() };`;
const objectCallSection = `<section class="panel"><div class="section-heading"><div><p class="eyebrow">03 · NATIVE VALUES</p><h2>Assign keeps the host instance</h2></div><p>A class instance passed through assign stays that instance. The template reads a public field, calls the instance method and calls a separately registered logical class function.</p></div><div class="native-proof">${code('template', highlightTemplate(objectCallTemplate, 'object-calls.tpl'), true)}${code('host assign', objectCallSource)}<p class="output-label">Rendered output · ${escapeHtml(digest(objectCallOutput))}</p><pre>${highlightEscapedHtml(escapeHtml(objectCallOutput))}</pre></div></section>`;
const measurementRows = benchmark.map(row => `<tr><td>${escapeHtml(row.fixture)}</td><td>${escapeHtml(row.lang)}</td><td>${escapeHtml(String(row.iters))}</td><td>${escapeHtml(row.outputSha256.slice(0, 12))}…</td></tr>`).join('');
const modeRows = modeBenchmark.map(row => `<tr><td>${escapeHtml(row.language)}</td><td>${escapeHtml(row.mode)}</td><td>${row.coldProcessMs.toFixed(2)} ms</td><td>${row.renderMs.toFixed(4)} ms</td><td>${row.preparedRenderMs.toFixed(4)} ms</td><td>${row.persistentRssMib.toFixed(2)} MiB</td><td>${row.outputBytes}</td><td>${escapeHtml(row.outputSha256.slice(0, 12))}…</td></tr>`).join('');
const cards = scenarios.map(scenario => {
  const result = results.scenarios.find(item => item.id === scenario.id);
  if (result === undefined) throw new Error(`examples/site/data/results.json has no result of ${scenario.id}`);
  return scenarioCard(scenario, result);
}).join('\n');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Template execution lab</title><link rel="stylesheet" href="./styles.css"></head>
<body><header class="hero"><p class="eyebrow">TEMPLATE · STATIC RENDER PROOF</p><h1>Template execution lab</h1><p class="lede">The shared source is parsed before this page is built. AST mode executes the committed nodes; generated mode lowers those same nodes into host-language renderers. Both modes use the same assign, define and output contract.</p><div class="status-grid"><div class="status-card"><span>Cross-language proof</span><strong class="pass">${escapeHtml(results.status.toUpperCase())}</strong></div><div class="status-card"><span>AST mode</span><strong class="pass">IMPLEMENTED</strong></div><div class="status-card"><span>Generated mode</span><strong class="pass">5 LANGUAGES</strong></div><div class="status-card"><span>Page validation</span><strong class="pass">HTML</strong></div></div></header>
<main>${objectCallSection}<section class="panel"><div class="section-heading"><div><p class="eyebrow">01 · EVIDENCE</p><h2>Same bytes from AST mode</h2></div><p>Source parsing occurs during the build. Runtime checks load the committed artifacts, apply assign and define, and compare UTF-8 output bytes. Generated mode must produce the same bytes before it can be enabled for a language.</p></div><div class="table-wrap"><table><thead><tr><th>Scenario</th><th>Bytes</th><th>SHA-256</th>${results.languages.map(language => `<th>${escapeHtml(language)}</th>`).join('')}</tr></thead><tbody>${results.scenarios.map(row => `<tr><td><a href="#${escapeHtml(row.id)}">${escapeHtml(row.id)}</a></td><td>${row.bytes}</td><td>${escapeHtml(row.sha256.slice(0, 12))}…</td>${results.languages.map(language => `<td class="${row.renders.get(language) === 'pass' ? 'pass' : 'fail'}">${row.renders.get(language)?.toUpperCase() ?? 'FAIL'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>
<section class="panel"><div class="section-heading"><div><p class="eyebrow">02 · INPUT AND OUTPUT</p><h2>Small SSR situations</h2></div><p>Each card shows the exact assign data, define map, every template file, compiled artifact manifest and final HTML.</p></div><div class="scenario-list">${cards}</div></section>
<section class="panel"><div class="section-heading"><div><p class="eyebrow">04 · PERFORMANCE</p><h2>Same request, two execution modes</h2></div><p>Independent samples use production artifacts with the page cache disabled. Cold includes process startup and loading. Full render includes request binding; prepared render reuses one normalized request. Every row must match the same UTF-8 bytes before it is recorded.</p></div><div class="table-wrap"><table><thead><tr><th>Language</th><th>Mode</th><th>Cold median</th><th>Full render</th><th>Prepared render</th><th>RSS median</th><th>Bytes</th><th>Output</th></tr></thead><tbody>${modeRows}</tbody></table></div><details><summary>Package throughput samples</summary><div class="table-wrap"><table><thead><tr><th>Fixture</th><th>Implementation</th><th>Iterations</th><th>Output</th></tr></thead><tbody>${measurementRows}</tbody></table></div></details></section></main>
<footer class="footer"><a href="../../spec/runtime.html">Runtime specification</a><a href="../../spec/ast.html">AST specification</a><a href="../../operations/showcase.html">Showcase procedure</a></footer></body></html>\n`;

const output = join(site, 'index.html');
if (check) {
  const current = readFileSync(output, 'utf8');
  if (current !== html) throw new Error('examples/site/index.html is stale; run make showcase');
  process.stdout.write('checked examples/site/index.html\n');
} else {
  writeFileSync(output, html);
  process.stdout.write('wrote examples/site/index.html\n');
}
