#!/usr/bin/env node
// Builds the showcase as complete static HTML. The browser does not parse or render templates.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '../../packages/template-ts/dist/index.mjs';
import { root } from '../../tests/runner/drivers.mjs';

const site = join(root, 'examples', 'site');
const data = JSON.parse(readFileSync(join(site, 'data', 'scenarios.json'), 'utf8'));
const results = JSON.parse(readFileSync(join(site, 'data', 'results.json'), 'utf8'));
const benchmark = JSON.parse(readFileSync(join(site, 'data', 'benchmark.json'), 'utf8'));
const modeBenchmark = JSON.parse(readFileSync(join(site, 'data', 'mode-benchmark.json'), 'utf8'));
const check = process.argv.includes('--check');

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function highlightEscapedHtml(escaped) {
  return escaped
    .replace(/(&lt;!--[\s\S]*?--&gt;)|(&lt;\/?[A-Za-z][\s\S]*?&gt;)/g, (token, comment, tag) => {
      if (comment) return `<span class="syntax-comment">${comment}</span>`;
      return tag
        .replace(/^(&lt;\/?)([A-Za-z][\w:-]*)([\s\S]*?)(\/?&gt;)$/, '$1<span class="syntax-tag">$2</span>$3$4')
        .replace(/([\w:-]+)(=)(&quot;[\s\S]*?&quot;|&#39;[\s\S]*?&#39;)/g, '<span class="syntax-attr">$1</span>$2<span class="syntax-string">$3</span>');
    });
}

function rangesOf(ast) {
  const ranges = [];
  const visit = nodes => {
    for (const node of nodes) {
      if (node.type !== 'Text') ranges.push({ start: node.span[0], end: node.span[1], type: node.type.toLowerCase() });
      if (node.body) visit(node.body);
      if (node.branches) for (const branch of node.branches) visit(branch.body);
      if (node.else) visit(node.else);
      if (node.empty) visit(node.empty);
    }
  };
  visit(ast.body);
  return ranges;
}

function highlightTemplate(source, name) {
  const ranges = rangesOf(parse(source, name));
  let marked = escapeHtml(source);
  const placeholders = [];
  const tags = [...source.matchAll(/\{\{?[\s\S]*?\}\}?/g)];
  for (let index = tags.length - 1; index >= 0; index--) {
    const match = tags[index];
    const raw = match[0];
    const escapedRaw = escapeHtml(raw);
    const placeholder = `___TEMPLATE_TAG_${index}___`;
    const offset = escapeHtml(source.slice(0, match.index)).length;
    marked = marked.slice(0, offset) + placeholder + marked.slice(offset + escapedRaw.length);
    const range = ranges.filter(item => item.start <= match.index && item.end >= match.index + raw.length)
      .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
    placeholders[index] = `<span class="syntax-template syntax-${range?.type ?? 'tag'}">${escapedRaw}</span>`;
  }
  return highlightEscapedHtml(marked).replace(/___TEMPLATE_TAG_(\d+)___/g, (_, index) => placeholders[Number(index)]);
}

function digest(text) {
  return `${Buffer.byteLength(text, 'utf8')} bytes · ${createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12)}…`;
}

function code(label, value, highlighted = false) {
  const content = highlighted ? value : escapeHtml(value);
  return `<details open><summary>${escapeHtml(label)}</summary><pre>${content}</pre></details>`;
}

function generatedFunctions(source, scenarioId) {
  const prefix = scenarioId.replace(/[^A-Za-z0-9_]/g, '_') + '__';
  const lines = source.split('\n');
  const functions = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!new RegExp(`^(?:export )?(?:function|func|fn)\\s+(?:render_|generated_)${prefix}`).test(lines[index])) continue;
    const body = [];
    let depth = 0;
    do {
      const line = lines[index];
      body.push(line);
      depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
      index += 1;
    } while (index < lines.length && depth > 0);
    index -= 1;
    functions.push(body.join('\n'));
  }
  if (functions.length === 0) throw new Error(`generated functions are missing for ${scenarioId}`);
  return functions.join('\n\n');
}

function scenarioCard(scenario, result) {
  const languages = result.renders ? Object.keys(result.renders) : results.languages;
  const artifact = {};
  for (const language of languages) {
    const artifactLanguage = language === 'ts' ? 'typescript' : language;
    const manifestPath = join(site, 'scenarios', scenario.id, 'compiled', artifactLanguage, 'manifest.json');
    if (existsSync(manifestPath)) artifact[artifactLanguage] = JSON.parse(readFileSync(manifestPath, 'utf8'));
  }
  const templateSource = Object.entries(scenario.templates).map(([name, source]) => `--- ${name}\n${highlightTemplate(source, name)}`).join('\n\n');
  const integrationSource = (scenario.integrationFiles ?? []).map(file => `--- ${file.name}\n${escapeHtml(file.source)}`).join('\n\n');
  const generatedSource = [
    ['typescript', join(root, 'tools', 'showcase', 'adapters', 'generated', 'native_direct.ts')],
    ['javascript', join(root, 'tools', 'showcase', 'adapters', 'generated', 'native_direct.mjs')],
    ['go', join(root, 'tools', 'showcase', 'adapters', 'go', 'native_direct.go')],
    ['rust', join(root, 'tools', 'showcase', 'adapters', 'rust', 'src', 'native_direct.rs')],
    ['php', join(root, 'tools', 'showcase', 'adapters', 'generated', 'native_direct.php')],
  ].map(([language, path]) => `${language}/native_direct · generated functions for ${scenario.id}\n${generatedFunctions(readFileSync(path, 'utf8'), scenario.id)}`).join('\n\n');
  const artifactText = Object.entries(artifact).map(([language, manifest]) => {
    const artifactRoot = join(site, 'scenarios', scenario.id, 'compiled', language);
    const files = Object.entries(manifest.templates).map(([name, entry]) => {
      const source = readFileSync(join(artifactRoot, entry.artifact), 'utf8');
      return `${language}/${entry.artifact} · ${name}\n${source}`;
    }).join('\n\n');
    return `${language}/manifest.json\n${JSON.stringify(manifest, null, 2)}\n\n${files}`;
  }).join('\n\n');
  const proofCells = results.languages.map(language => `<td class="${result.renders?.[language]?.status === 'pass' ? 'pass' : 'fail'}">${result.renders?.[language]?.status?.toUpperCase() ?? 'N/A'}</td>`).join('');
  return `<article class="scenario" id="${escapeHtml(scenario.id)}">
  <header class="scenario-header"><div><h3>${escapeHtml(scenario.title)}</h3><p>${escapeHtml(scenario.description)}</p></div><div class="tags">${scenario.focus.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div></header>
  <div class="scenario-meta">
  <section class="source"><p class="output-label">Inputs</p>${code('assign', JSON.stringify(scenario.assign, null, 2))}${code('define', JSON.stringify(scenario.define, null, 2))}${code('templates · parser ranges', templateSource, true)}${scenario.integrationFiles?.length ? code('integration source', integrationSource, true) : ''}${code('compiled artifacts', artifactText)}${code('generated renderers', generatedSource)}</section>
    <section class="output"><p class="output-label">Output · ${escapeHtml(digest(scenario.expectedHtml))}</p><pre>${highlightEscapedHtml(escapeHtml(scenario.expectedHtml))}</pre><table><thead><tr><th>Implementation</th>${results.languages.map(language => `<th>${escapeHtml(language)}</th>`).join('')}</tr></thead><tbody><tr><td>artifact render</td>${proofCells}</tr></tbody></table></section>
  </div>
</article>`;
}

const measurementRows = benchmark.map(row => `<tr><td>${escapeHtml(row.fixture)}</td><td>${escapeHtml(row.lang)}</td><td>${escapeHtml(String(row.iters))}</td><td>${escapeHtml(row.output_sha256.slice(0, 12))}…</td></tr>`).join('');
const modeRows = modeBenchmark.results.map(row => `<tr><td>${escapeHtml(row.language)}</td><td>${escapeHtml(row.mode)}</td><td>${row.median_ms.toFixed(2)} ms</td><td>${row.output_bytes}</td><td>${escapeHtml(row.output_sha256.slice(0, 12))}…</td></tr>`).join('');
const cards = data.scenarios.map(scenario => scenarioCard(scenario, results.scenarios.find(item => item.id === scenario.id))).join('\n');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Template execution lab</title><link rel="stylesheet" href="./styles.css"></head>
<body><header class="hero"><p class="eyebrow">TEMPLATE · STATIC RENDER PROOF</p><h1>Template execution lab</h1><p class="lede">The shared source is parsed before this page is built. AST mode executes the committed nodes; generated mode lowers those same nodes into host-language renderers. Both modes use the same assign, define and output contract.</p><div class="status-grid"><div class="status-card"><span>Cross-language proof</span><strong class="pass">${escapeHtml(results.status.toUpperCase())}</strong></div><div class="status-card"><span>AST mode</span><strong class="pass">IMPLEMENTED</strong></div><div class="status-card"><span>Generated mode</span><strong class="pass">5 LANGUAGES</strong></div><div class="status-card"><span>Page validation</span><strong class="pass">HTML</strong></div></div></header>
<main><section class="panel"><div class="section-heading"><div><p class="eyebrow">01 · EVIDENCE</p><h2>Same bytes from AST mode</h2></div><p>Source parsing occurs during the build. Runtime checks load the committed artifacts, apply assign and define, and compare UTF-8 output bytes. Generated mode must produce the same bytes before it can be enabled for a language.</p></div><div class="table-wrap"><table><thead><tr><th>Scenario</th><th>Bytes</th><th>SHA-256</th>${results.languages.map(language => `<th>${escapeHtml(language)}</th>`).join('')}</tr></thead><tbody>${results.scenarios.map(row => `<tr><td><a href="#${escapeHtml(row.id)}">${escapeHtml(row.id)}</a></td><td>${row.bytes}</td><td>${escapeHtml(row.sha256.slice(0, 12))}…</td>${results.languages.map(language => `<td class="${row.renders[language]?.status === 'pass' ? 'pass' : 'fail'}">${row.renders[language]?.status?.toUpperCase() ?? 'FAIL'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>
<section class="panel"><div class="section-heading"><div><p class="eyebrow">02 · INPUT AND OUTPUT</p><h2>Small SSR situations</h2></div><p>Each card shows the exact assign data, define map, every template file, compiled artifact manifest and final HTML.</p></div><div class="scenario-list">${cards}</div></section>
<section class="panel"><div class="section-heading"><div><p class="eyebrow">03 · PERFORMANCE</p><h2>Same request, two execution modes</h2></div><p>Each row starts the same adapter with the same input and checks the same output bytes. The median includes startup, loading and the adapter's fixed render and repeat checks; it is a mode comparison, not a machine independent score.</p></div><div class="table-wrap"><table><thead><tr><th>Language</th><th>Mode</th><th>Median</th><th>Bytes</th><th>Output</th></tr></thead><tbody>${modeRows}</tbody></table></div><details><summary>Package throughput samples</summary><div class="table-wrap"><table><thead><tr><th>Fixture</th><th>Implementation</th><th>Iterations</th><th>Output</th></tr></thead><tbody>${measurementRows}</tbody></table></div></details></section></main>
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
