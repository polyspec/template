#!/usr/bin/env node
// Inventories function-shaped calls in tracked legacy template sources.
// The input root is explicit because it is an external source tree.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const args = process.argv.slice(2);
const valueFor = name => {
  const index = args.indexOf(name);
  return index < 0 ? null : args[index + 1] ?? null;
};
const inputRoot = valueFor('--root');
const outputPath = valueFor('--output');
const onlyPath = valueFor('--only');
if (!inputRoot || inputRoot.startsWith('-')) {
  throw new Error('usage: node scripts/inventory-template-functions.mjs --root /path/to/git/tree [--output path]');
}

const root = resolve(inputRoot);
if (!existsSync(root)) throw new Error(`inventory: root does not exist: ${root}`);

const files = (onlyPath
  ? [onlyPath]
  : execFileSync('git', ['-C', root, 'ls-files', '-z', '--', '*.tpl'], { encoding: 'utf8' }).split('\0').filter(Boolean))
  .sort();

const identifierStart = char => /[A-Za-z_]/.test(char ?? '');
const identifierPart = char => /[A-Za-z0-9_]/.test(char ?? '');
const whitespace = char => /\s/.test(char ?? '');
const categories = ['direct', 'qualified', 'static', 'instance'];
const symbols = new Map();
const definitions = new Set();
const totals = { explicitTags: 0, bareTags: 0, calls: 0, comments: 0 };

function location(text, index) {
  const before = text.slice(0, index);
  const line = before.split('\n').length;
  const last = before.lastIndexOf('\n');
  return { line, column: index - (last < 0 ? 0 : last + 1) + 1 };
}

function add(category, name, file, text, index) {
  if (!categories.includes(category) || !name) return;
  const key = `${category}:${name}`;
  const entry = symbols.get(key) ?? { category, name, count: 0, files: new Set(), examples: [] };
  entry.count++;
  entry.files.add(file);
  if (entry.examples.length < 3) entry.examples.push({ file, ...location(text, index) });
  symbols.set(key, entry);
  totals.calls++;
}

function skipString(text, start) {
  const quote = text[start];
  let index = start + 1;
  while (index < text.length) {
    if (text[index] === '\\') { index += 2; continue; }
    if (text[index] === quote) return index + 1;
    index++;
  }
  return text.length;
}

function findTagEnd(text, start, close) {
  let parens = 0;
  let brackets = 0;
  let braces = 0;
  let index = start;
  while (index < text.length) {
    const char = text[index];
    if (char === '"' || char === "'") { index = skipString(text, index); continue; }
    if (text.startsWith(close, index) && parens === 0 && brackets === 0 && braces === 0) return index;
    if (char === '(') parens++;
    else if (char === ')') parens = Math.max(0, parens - 1);
    else if (char === '[') brackets++;
    else if (char === ']') brackets = Math.max(0, brackets - 1);
    else if (char === '{') braces++;
    else if (char === '}') braces = Math.max(0, braces - 1);
    index++;
  }
  return -1;
}

function previousWord(text, start) {
  let index = start - 1;
  while (index >= 0 && whitespace(text[index])) index--;
  let end = index + 1;
  while (index >= 0 && identifierPart(text[index])) index--;
  return text.slice(index + 1, end);
}

function callCandidates(body, absoluteStart, file, source) {
  let index = 0;
  while (index < body.length) {
    const char = body[index];
    if (char === '"' || char === "'") { index = skipString(body, index); continue; }
    if (body.startsWith('//', index)) { const end = body.indexOf('\n', index + 2); index = end < 0 ? body.length : end; continue; }
    if (body.startsWith('/*', index)) { const end = body.indexOf('*/', index + 2); index = end < 0 ? body.length : end + 2; continue; }

    const beginsQualified = char === '\\';
    if (!beginsQualified && !identifierStart(char)) { index++; continue; }
    const start = index;
    let before = start - 1;
    while (before >= 0 && whitespace(body[before])) before--;
    const precededByInstanceArrow = before >= 1 && body[before - 1] === '-' && body[before] === '>';
    let end = index;
    if (beginsQualified) {
      while (end < body.length) {
        if (body[end] === '\\') { end++; continue; }
        if (identifierStart(body[end])) { end++; while (end < body.length && identifierPart(body[end])) end++; continue; }
        break;
      }
    } else {
      end++;
      while (end < body.length && identifierPart(body[end])) end++;
    }
    let name = body.slice(start, end);
    let kind = beginsQualified ? 'qualified' : precededByInstanceArrow ? 'instance' : 'direct';
    let cursor = end;
    while (cursor < body.length && whitespace(body[cursor])) cursor++;
    if (body.startsWith('::', cursor)) {
      cursor += 2;
      while (cursor < body.length && whitespace(body[cursor])) cursor++;
      if (!identifierStart(body[cursor])) { index = end; continue; }
      const methodStart = cursor;
      cursor++;
      while (cursor < body.length && identifierPart(body[cursor])) cursor++;
      name += `::${body.slice(methodStart, cursor)}`;
      kind = 'static';
    } else if (body.startsWith('->', cursor)) {
      cursor += 2;
      while (cursor < body.length && whitespace(body[cursor])) cursor++;
      if (!identifierStart(body[cursor])) { index = end; continue; }
      const methodStart = cursor;
      cursor++;
      while (cursor < body.length && identifierPart(body[cursor])) cursor++;
      name += `->${body.slice(methodStart, cursor)}`;
      kind = 'instance';
    }
    let after = cursor;
    while (after < body.length && whitespace(body[after])) after++;
    if (body[after] !== '(') { index = Math.max(end, cursor); continue; }
    const word = previousWord(body, start);
    if (word === 'function') {
      definitions.add(name);
      index = after + 1;
      continue;
    }
    if (word === 'new' && kind === 'direct') kind = 'qualified';
    if (kind === 'instance') {
      const method = name.includes('->') ? name.slice(name.lastIndexOf('->') + 2) : name;
      add(kind, method, file, source, absoluteStart + start);
    } else {
      add(kind, name, file, source, absoluteStart + start);
    }
    index = after + 1;
  }
}

function rawTagState(text, index, state) {
  const lower = text.slice(index, index + 16).toLowerCase();
  if (state === null) {
    const open = lower.match(/^<(script|style)(?:\s|>)/);
    return open ? open[1] : null;
  }
  const close = `</${state}`;
  return lower.startsWith(close) ? null : state;
}

function scanSource(file, source) {
  let index = 0;
  let raw = null;
  let htmlQuote = null;
  while (index < source.length) {
    const nextRaw = rawTagState(source, index, raw);
    if (nextRaw !== raw) { raw = nextRaw; index++; continue; }
    if (source.startsWith('<?php', index)) {
      const end = source.indexOf('?>', index + 5);
      index = end < 0 ? source.length : end + 2;
      continue;
    }
    if (source.startsWith('{*', index) || source.startsWith('{**', index) || source.startsWith('{{!--', index)) {
      totals.comments++;
      const close = source.startsWith('{{!--', index) ? '--}}' : source.startsWith('{**', index) ? '**}' : '*}';
      const end = source.indexOf(close, index + 2);
      index = end < 0 ? source.length : end + close.length;
      continue;
    }
    if (source.startsWith('<!--{', index) || source.startsWith('/*{', index)) {
      totals.comments++;
      const close = source.startsWith('<!--{', index) ? '}-->' : '}*/';
      const end = source.indexOf(close, index + 3);
      index = end < 0 ? source.length : end + close.length;
      continue;
    }
    if (raw === null && (source[index] === '"' || source[index] === "'")) {
      if (htmlQuote === null) htmlQuote = source[index];
      else if (htmlQuote === source[index] && source[index - 1] !== '\\') htmlQuote = null;
      index++;
      continue;
    }
    if (source[index] !== '{') { index++; continue; }
    const double = source[index + 1] === '{';
    const sigilIndex = index + (double ? 2 : 1);
    const sigil = source[sigilIndex] ?? '';
    const explicit = '=?:@#/+*%'.includes(sigil);
    if (!explicit && (raw !== null || htmlQuote !== null || !/[A-Za-z_\\$]/.test(sigil))) { index++; continue; }
    const close = double ? '}}' : '}';
    const bodyStart = sigilIndex + (explicit ? 1 : 0);
    const end = findTagEnd(source, bodyStart, close);
    if (end < 0) { index++; continue; }
    const body = source.slice(bodyStart, end);
    if (!explicit) {
      const trimmed = body.trim();
      const isAssignment = /^(?:\\?[A-Za-z_][A-Za-z0-9_\\]*|[A-Za-z_][A-Za-z0-9_]*)\s*(?:=|\+\+|--)/.test(trimmed);
      const isCall = /^(?:\\?[A-Za-z_][A-Za-z0-9_\\]*(?:::\\?[A-Za-z_][A-Za-z0-9_\\]*)?|[A-Za-z_][A-Za-z0-9_]*)\s*\(/.test(trimmed);
      if (/;/.test(body) || (!isAssignment && !isCall)) { index = end + close.length; continue; }
    }
    if (explicit) totals.explicitTags++;
    else totals.bareTags++;
    callCandidates(body, bodyStart, file, source);
    index = end + close.length;
  }
}

for (const file of files) scanSource(file, readFileSync(resolve(root, file), 'utf8'));

const sortedSymbols = [...symbols.values()]
  .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
  .map(entry => ({ ...entry, files: [...entry.files].sort() }));
const report = {
  schema: 1,
  files: files.length,
  totals,
  symbols: sortedSymbols,
  definitions: [...definitions].sort(),
};
const json = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) writeFileSync(resolve(outputPath), json);
else process.stdout.write(json);
