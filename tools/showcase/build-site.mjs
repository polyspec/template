#!/usr/bin/env node
// Builds the showcase as complete static HTML. The browser does not parse or render templates.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyze } from '../../packages/template-ts/dist/index.mjs';
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

function highlightTemplate(source, name) {
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

function digest(text) {
  return `${Buffer.byteLength(text, 'utf8')} bytes · ${createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12)}…`;
}

function code(label, value, highlighted = false, scrollable = false) {
  const content = highlighted ? value : escapeHtml(value);
  const classes = [highlighted ? 'template-files' : '', scrollable ? 'long-code' : ''].filter(Boolean).join(' ');
  return `<details open><summary>${escapeHtml(label)}</summary><pre${classes ? ` class="${classes}"` : ''}>${content}</pre></details>`;
}

function scenarioCard(scenario, result) {
  const artifactRoot = join(site, 'scenarios', scenario.id, 'compiled', 'ast');
  const artifact = JSON.parse(readFileSync(join(artifactRoot, 'manifest.json'), 'utf8'));
  const templateSource = Object.entries(scenario.templates).map(([name, source]) => `--- ${name}\n${highlightTemplate(source, name)}`).join('\n\n');
  const integrationSource = (scenario.integrationFiles ?? []).map(file => `--- ${file.name}\n${escapeHtml(file.source)}`).join('\n\n');
  const generatedSource = [
    ['typescript', join(root, 'tools', 'showcase', 'adapters', 'generated', 'typed', `${scenario.id}.ts`)],
    ['javascript', join(root, 'tools', 'showcase', 'adapters', 'generated', 'javascript', `${scenario.id}.js`)],
    ['go', join(root, 'tools', 'showcase', 'adapters', 'go', 'generated', scenario.id, 'generated.go')],
    ['rust', join(root, 'tools', 'showcase', 'adapters', 'generated', 'typed', `${scenario.id}.rust`)],
    ['php', join(root, 'tools', 'showcase', 'adapters', 'generated', 'typed', `${scenario.id}.php`)],
  ].map(([language, path]) => `${language} · product generated program\n${readFileSync(`${path}.manifest.json`, 'utf8')}\n${readFileSync(path, 'utf8')}`).join('\n\n');
  const artifactFiles = Object.entries(artifact.files).map(([name, entry]) => {
    const source = readFileSync(join(artifactRoot, entry.path), 'utf8');
    return `ast/${entry.path} · ${name}\n${source}`;
  }).join('\n\n');
  const artifactText = `ast/manifest.json\n${JSON.stringify(artifact, null, 2)}\n\n${artifactFiles}`;
  const proofCells = results.languages.map(language => `<td class="${result.renders?.[language]?.status === 'pass' ? 'pass' : 'fail'}">${result.renders?.[language]?.status?.toUpperCase() ?? 'N/A'}</td>`).join('');
  return `<article class="scenario" id="${escapeHtml(scenario.id)}">
  <header class="scenario-header"><div><h3>${escapeHtml(scenario.title)}</h3><p>${escapeHtml(scenario.description)}</p></div><div class="tags">${scenario.focus.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div></header>
  <div class="scenario-meta">
  <section class="source"><p class="output-label">Inputs</p>${code('assign', JSON.stringify(scenario.assign, null, 2))}${code('define', JSON.stringify(scenario.define, null, 2))}${code('templates · parser ranges', templateSource, true)}${scenario.integrationFiles?.length ? code('integration source', integrationSource, true) : ''}${code('compiled artifacts', artifactText, false, true)}${code('generated renderers', generatedSource, false, true)}</section>
    <section class="output"><p class="output-label">Output · ${escapeHtml(digest(scenario.expectedHtml))}</p><pre>${highlightEscapedHtml(escapeHtml(scenario.expectedHtml))}</pre><table><thead><tr><th>Implementation</th>${results.languages.map(language => `<th>${escapeHtml(language)}</th>`).join('')}</tr></thead><tbody><tr><td>artifact render</td>${proofCells}</tr></tbody></table></section>
  </div>
</article>`;
}

const measurementRows = benchmark.map(row => `<tr><td>${escapeHtml(row.fixture)}</td><td>${escapeHtml(row.lang)}</td><td>${escapeHtml(String(row.iters))}</td><td>${escapeHtml(row.output_sha256.slice(0, 12))}…</td></tr>`).join('');
const modeRows = modeBenchmark.results.map(row => `<tr><td>${escapeHtml(row.language)}</td><td>${escapeHtml(row.mode)}</td><td>${row.cold_process_ms.median.toFixed(2)} ms</td><td>${row.render_ms.median.toFixed(4)} ms</td><td>${row.prepared_render_ms.median.toFixed(4)} ms</td><td>${row.persistent_rss_mib.median.toFixed(2)} MiB</td><td>${row.output_bytes}</td><td>${escapeHtml(row.output_sha256.slice(0, 12))}…</td></tr>`).join('');
const cards = data.scenarios.map(scenario => scenarioCard(scenario, results.scenarios.find(item => item.id === scenario.id))).join('\n');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Template execution lab</title><link rel="stylesheet" href="./styles.css"></head>
<body><header class="hero"><p class="eyebrow">TEMPLATE · STATIC RENDER PROOF</p><h1>Template execution lab</h1><p class="lede">The shared source is parsed before this page is built. AST mode executes the committed nodes; generated mode lowers those same nodes into host-language renderers. Both modes use the same assign, define and output contract.</p><div class="status-grid"><div class="status-card"><span>Cross-language proof</span><strong class="pass">${escapeHtml(results.status.toUpperCase())}</strong></div><div class="status-card"><span>AST mode</span><strong class="pass">IMPLEMENTED</strong></div><div class="status-card"><span>Generated mode</span><strong class="pass">5 LANGUAGES</strong></div><div class="status-card"><span>Page validation</span><strong class="pass">HTML</strong></div></div></header>
<main><section class="panel"><div class="section-heading"><div><p class="eyebrow">01 · EVIDENCE</p><h2>Same bytes from AST mode</h2></div><p>Source parsing occurs during the build. Runtime checks load the committed artifacts, apply assign and define, and compare UTF-8 output bytes. Generated mode must produce the same bytes before it can be enabled for a language.</p></div><div class="table-wrap"><table><thead><tr><th>Scenario</th><th>Bytes</th><th>SHA-256</th>${results.languages.map(language => `<th>${escapeHtml(language)}</th>`).join('')}</tr></thead><tbody>${results.scenarios.map(row => `<tr><td><a href="#${escapeHtml(row.id)}">${escapeHtml(row.id)}</a></td><td>${row.bytes}</td><td>${escapeHtml(row.sha256.slice(0, 12))}…</td>${results.languages.map(language => `<td class="${row.renders[language]?.status === 'pass' ? 'pass' : 'fail'}">${row.renders[language]?.status?.toUpperCase() ?? 'FAIL'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>
<section class="panel"><div class="section-heading"><div><p class="eyebrow">02 · INPUT AND OUTPUT</p><h2>Small SSR situations</h2></div><p>Each card shows the exact assign data, define map, every template file, compiled artifact manifest and final HTML.</p></div><div class="scenario-list">${cards}</div></section>
<section class="panel"><div class="section-heading"><div><p class="eyebrow">03 · PERFORMANCE</p><h2>Same request, two execution modes</h2></div><p>Independent samples use production artifacts with the page cache disabled. Cold includes process startup and loading. Full render includes request binding; prepared render reuses one normalized request. Every row must match the same UTF-8 bytes before it is recorded.</p></div><div class="table-wrap"><table><thead><tr><th>Language</th><th>Mode</th><th>Cold median</th><th>Full render</th><th>Prepared render</th><th>RSS median</th><th>Bytes</th><th>Output</th></tr></thead><tbody>${modeRows}</tbody></table></div><details><summary>Package throughput samples</summary><div class="table-wrap"><table><thead><tr><th>Fixture</th><th>Implementation</th><th>Iterations</th><th>Output</th></tr></thead><tbody>${measurementRows}</tbody></table></div></details></section></main>
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
