#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const output = join(root, 'docs/.vitepress/dist');
const pages = [];
const localeLink = (html, target = '') => new RegExp(`href="/(?:[^"/]+/)?ko/${target}"`).test(html);

function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (entry.name.endsWith('.html')) pages.push(path);
  }
}

collect(output);
if (pages.length === 0) throw new Error('documentation build produced no HTML pages');

let korean = 0;
for (const path of pages) {
  const name = relative(output, path);
  const html = readFileSync(path, 'utf8');
  const language = html.match(/<html\s+lang="([^"]+)"/)?.[1];
  if (name === 'ko/index.html' || name.startsWith('ko/') || name.endsWith('.ko/index.html')) {
    korean += 1;
    if (language !== 'ko-KR') throw new Error(`${name}: expected html lang="ko-KR", received ${JSON.stringify(language)}`);
    if (!localeLink(html, 'spec/lexical') || !localeLink(html, 'operations/development')) {
      throw new Error(`${name}: Korean navigation does not remain in the Korean locale`);
    }
    const englishRoute = name === 'ko/index.html' || name === 'index.ko/index.html'
      ? '/'
      : `/${name.replace(/^ko\//, '').replace(/\.ko\/index\.html$/, '').replace(/\.html$/, '')}`;
    const englishLink = englishRoute === '/'
      ? /href="\/[^"/]*\/"/.test(html) || html.includes('href="/"')
      : new RegExp(`href="(?:/[^"/]+)?${englishRoute.replaceAll('/', '\\/')}"`).test(html);
    if (!englishLink) throw new Error(`${name}: English translation link is missing or remains in Korean locale`);
  } else if (language !== 'en-US') {
    throw new Error(`${name}: expected html lang="en-US", received ${JSON.stringify(language)}`);
  }
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const href = match[1];
    if (!href.startsWith('http') && (/\.ko(?:\.html)?/.test(href) || href.includes('/packages/') || href.includes('/schema/'))) {
      throw new Error(`${name}: link points to a source-only or legacy route: ${href}`);
    }
  }
  if (html.includes('{{ site.title }}') || html.includes('{{ resolveTitle(theme) }}')) {
    throw new Error(`${name}: unresolved theme interpolation`);
  }
}

if (korean === 0) throw new Error('documentation build produced no Korean pages');
const englishIndex = readFileSync(join(output, 'index.html'), 'utf8');
if (!localeLink(englishIndex)) throw new Error('English navigation does not link to the Korean locale root');
process.stdout.write(`documentation static site: ${pages.length} pages, ${korean} Korean locale pages passed\n`);
