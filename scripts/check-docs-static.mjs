#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const output = join(root, 'docs/.vitepress/dist');
const pages = [];

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
  if (name.endsWith('.ko.html')) {
    korean += 1;
    if (language !== 'ko-KR') throw new Error(`${name}: expected html lang="ko-KR", received ${JSON.stringify(language)}`);
  } else if (language !== 'en-US') {
    throw new Error(`${name}: expected html lang="en-US", received ${JSON.stringify(language)}`);
  }
  if (html.includes('{{ site.title }}') || html.includes('{{ resolveTitle(theme) }}')) {
    throw new Error(`${name}: unresolved theme interpolation`);
  }
}

if (korean === 0) throw new Error('documentation build produced no Korean pages');
process.stdout.write(`documentation static site: ${pages.length} pages, ${korean} Korean locale pages passed\n`);
