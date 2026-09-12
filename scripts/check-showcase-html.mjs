#!/usr/bin/env node
// Validates the generated showcase HTML without starting a browser.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const site = join(root, 'examples', 'site');
const htmlPath = join(site, 'index.html');
const html = readFileSync(htmlPath, 'utf8');
const failures = [];
const fail = message => failures.push(message);

if (!/^<!doctype html>/i.test(html)) fail('showcase page does not start with doctype');
if ((html.match(/<html\b/gi) ?? []).length !== 1) fail('showcase page must contain one html element');
for (const tag of ['head', 'body', 'main', 'title']) {
  if (!new RegExp(`<${tag}\\b`, 'i').test(html)) fail(`showcase page is missing ${tag}`);
}
if (/<script\b/i.test(html)) fail('showcase page must not execute browser JavaScript');
const renderedChrome = html.replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi, '');
if (renderedChrome.includes('{{') || renderedChrome.includes('}}')) fail('showcase page contains unresolved template markers outside source examples');

const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const stack = [];
for (const match of html.matchAll(/<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>/g)) {
  const token = match[0];
  if (token.startsWith('<!--') || /^<[^/]/.test(token) && token.endsWith('/>')) continue;
  const closing = /^<\//.test(token);
  const name = token.match(/^<\/?([A-Za-z][\w:-]*)/)?.[1]?.toLowerCase();
  if (!name || voidTags.has(name)) continue;
  if (closing) {
    if (stack.pop() !== name) fail(`HTML tag nesting is invalid at ${name}`);
  } else stack.push(name);
}
if (stack.length) fail(`HTML has unclosed tags: ${stack.join(', ')}`);

const scenarioCount = (html.match(/<article class="scenario"/g) ?? []).length;
const expectedCount = JSON.parse(readFileSync(join(site, 'data', 'scenarios.json'), 'utf8')).scenarios.length;
if (scenarioCount !== expectedCount) fail(`HTML contains ${scenarioCount} scenarios; expected ${expectedCount}`);
if ((html.match(/<pre class="template-files">/g) ?? []).length < scenarioCount) fail('template source blocks are missing their syntax-highlight class');
if ((html.match(/<span class="syntax-template syntax-/g) ?? []).length < scenarioCount) fail('template parser ranges are not rendered as syntax tokens');
for (const kind of ['variable', 'string', 'number', 'operator']) {
  if (!html.includes(`class="syntax-${kind}"`)) fail(`template lexer ${kind} tokens are not rendered`);
}
if ((html.match(/<summary>compiled artifacts<\/summary><pre class="long-code">/g) ?? []).length !== scenarioCount) fail('compiled artifact blocks are not scroll containers');
if ((html.match(/<summary>generated renderers<\/summary><pre class="long-code">/g) ?? []).length !== scenarioCount) fail('generated renderer blocks are not scroll containers');
const css = readFileSync(join(site, 'styles.css'), 'utf8');
if (!/\.long-code\s*\{[^}]*max-block-size:\s*min\(34rem,\s*70vh\)[^}]*overflow:\s*auto/s.test(css)) fail('long code blocks have no bounded two-axis scroll container');
for (const href of [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1])) {
  if (href.startsWith('#')) continue;
  if (href.startsWith('../../spec/') || href.startsWith('../../operations/')) {
    const documentPath = join(root, 'docs', href.replace(/^\.\.\//, '').replace(/^\.\.\//, '').replace(/\.html$/, '.md'));
    if (!existsSync(documentPath)) fail(`document link target is missing: ${href}`);
  }
}

if (failures.length) {
  for (const failure of failures) process.stderr.write(`[html] ${failure}\n`);
  process.exit(1);
}
process.stdout.write(`[html] ${scenarioCount} scenarios and static structure passed\n`);
