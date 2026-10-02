#!/usr/bin/env node
// Editor fixtures (EDT-17): writes or checks the expected language service results of every template under
// packages/template-language/tests/editor. Every editor adapter compares its own results with these files.
//   node scripts/editor-fixtures.mjs --write | --check
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const fixtureDirectory = join(root, 'packages/template-language/tests/editor');

/** The indent unit of the expected indentation and formatted text. */
export const INDENT = '  ';

/** The positions at which highlights and matching tags are compared: every tag start and end and every line start. */
export function queryIndexes(document) {
  const indexes = new Set();
  for (const tag of document.tags) {
    indexes.add(tag.start);
    indexes.add(tag.end);
  }
  for (let line = 0; line < document.lineCount; line++) indexes.add(document.lineStart(line));
  return [...indexes].sort((left, right) => left - right);
}

/** The expected results of one document, in the fixture form. */
export function editorResults(document) {
  const highlights = {};
  const matchingTags = {};
  for (const index of queryIndexes(document)) {
    const ranges = document.highlights(index);
    if (ranges.length > 0) highlights[index] = ranges.map(range => [range.start, range.end]);
    matchingTags[index] = document.matchingTag(index);
  }
  const lines = mode => Array.from({ length: document.lineCount }, (_, line) => document.lineIndentation(line, { indent: INDENT, templateBlocks: mode }));
  const formatted = document.format({ indent: INDENT });
  return {
    diagnostics: document.diagnostics.map(item => ({ start: item.start, end: item.end, code: item.code })),
    tokens: document.tokens.map(token => [token.start, token.end, token.type]),
    tags: document.tags.map(tag => [tag.start, tag.end]),
    foldingRanges: document.foldingRanges().map(range => [range.startLine, range.endLine]),
    highlights,
    matchingTags,
    lineIndentation: { indent: lines('indent'), flat: lines('flat') },
    formatted: formatted.ok ? formatted.text : { error: formatted.error.reason },
  };
}

/** The fixture templates, sorted. */
export function fixtureNames() {
  return readdirSync(fixtureDirectory).filter(name => name.endsWith('.tpl')).sort();
}

async function main(mode) {
  const { openDocument } = await import(join(root, 'packages/template-language/dist/index.mjs'));
  let drift = 0;
  for (const name of fixtureNames()) {
    const text = readFileSync(join(fixtureDirectory, name), 'utf8');
    const expected = `${JSON.stringify(editorResults(openDocument(text, { name })), null, 2)}\n`;
    const path = join(fixtureDirectory, name.replace(/\.tpl$/, '.json'));
    if (mode === '--write') {
      writeFileSync(path, expected);
      continue;
    }
    let current = null;
    try {
      current = readFileSync(path, 'utf8');
    } catch {
      current = null;
    }
    if (current !== expected) {
      process.stderr.write(`editor fixture differs: ${path}\n`);
      drift++;
    }
  }
  if (drift > 0) process.exit(1);
  process.stdout.write(`editor fixtures: ${fixtureNames().length} fixtures ${mode === '--write' ? 'written' : 'checked'}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (mode !== '--write' && mode !== '--check') {
    process.stderr.write('usage: node scripts/editor-fixtures.mjs --write | --check\n');
    process.exit(2);
  }
  await main(mode);
}
