#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const output = join(root, 'docs/.vitepress/dist');
const korean = join(output, 'ko');

if (!existsSync(korean)) throw new Error('documentation build produced no Korean route tree');

function copyRoutes(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const source = join(directory, entry.name);
    if (entry.isDirectory()) {
      copyRoutes(source);
      continue;
    }
    if (!entry.name.endsWith('.html')) continue;
    const relative = source.slice(korean.length + 1);
    const route = relative === 'index.html' ? 'index.ko' : relative.replace(/\.html$/, '.ko');
    const target = join(output, route, 'index.html');
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target);
  }
}

copyRoutes(korean);
process.stdout.write('materialized Korean .ko routes\n');
