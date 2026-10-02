#!/usr/bin/env node
// Editor layer boundaries (EDT-2, EDT-3): an adapter package neither declares nor imports @polyspec/template, and the
// language service imports no editor, Node.js or DOM module outside its command line entry. The check first proves
// that it rejects each kind of violation, then checks the repository.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PARSER = '@polyspec/template';
export const ADAPTERS = ['packages/template-lsp', 'packages/template-codemirror', 'packages/template-vscode'];
export const SERVICE = 'packages/template-language';
// The command line entry of the language service is the one part that may use Node.js (EDT-3).
// Paths are relative to the src directory of the package.
const SERVICE_NODE_ENTRY = 'cli/';
const FORBIDDEN_IN_SERVICE = [/^node:/, /^vscode$/, /^vscode-/, /^@codemirror\//, /^codemirror$/];
// DOM objects used as values; the word "document" in prose is not a use.
const DOM_GLOBALS = /\b(?:window|navigator|globalThis\.document)\s*\.|\bdocument\s*\.\s*(?:body|head|documentElement|createElement|querySelector|querySelectorAll|getElementById|addEventListener)\b|\bHTMLElement\b/;
const SOURCE = /\.(?:[cm]?ts|[cm]?js)$/;

/** The module specifiers that a source text imports or requires. */
export function importsOf(text) {
  const specifiers = [];
  for (const match of text.matchAll(/(?:^|[\s;])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|[\s;(=])import\s*\(\s*['"]([^'"]+)['"]\s*\)|(?:^|[\s;])import\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/gm)) {
    specifiers.push(match[1] ?? match[2] ?? match[3] ?? match[4]);
  }
  return specifiers;
}

/** Violations of an adapter: a declared or imported parser package. `files` maps relative paths to texts. */
export function adapterViolations(name, manifest, files) {
  const violations = [];
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    if (manifest[field] && Object.hasOwn(manifest[field], PARSER)) violations.push(`${name}: package.json declares ${PARSER} in ${field}`);
  }
  for (const [path, text] of Object.entries(files)) {
    for (const specifier of importsOf(text)) {
      if (specifier === PARSER || specifier.startsWith(`${PARSER}/`)) violations.push(`${name}/${path}: imports ${specifier}`);
    }
  }
  return violations;
}

/** Violations of the language service: editor, Node.js or DOM modules outside the command line entry. */
export function serviceViolations(files) {
  const violations = [];
  for (const [path, text] of Object.entries(files)) {
    if (path.startsWith(SERVICE_NODE_ENTRY)) continue;
    for (const specifier of importsOf(text)) {
      if (FORBIDDEN_IN_SERVICE.some(pattern => pattern.test(specifier))) violations.push(`${SERVICE}/${path}: imports ${specifier}`);
    }
    if (DOM_GLOBALS.test(text)) violations.push(`${SERVICE}/${path}: uses a DOM global`);
  }
  return violations;
}

function sources(directory) {
  const result = {};
  const walk = current => {
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (SOURCE.test(entry)) result[relative(directory, path)] = readFileSync(path, 'utf8');
    }
  };
  walk(directory);
  return result;
}

function selfTest() {
  const cases = [
    ['declared parser', adapterViolations('a', { dependencies: { [PARSER]: '1' } }, {}).length === 1],
    ['imported parser', adapterViolations('a', {}, { 'src/x.ts': `import { parse } from '${PARSER}';` }).length === 1],
    ['required parser', adapterViolations('a', {}, { 'src/x.cjs': `const t = require("${PARSER}");` }).length === 1],
    ['dynamic parser import', adapterViolations('a', {}, { 'src/x.ts': `await import('${PARSER}');` }).length === 1],
    ['language service import allowed', adapterViolations('a', { dependencies: { '@polyspec/template-language': '1' } }, { 'src/x.ts': "import { openDocument } from '@polyspec/template-language';" }).length === 0],
    ['node module in service', serviceViolations({ 'x.ts': "import { readFileSync } from 'node:fs';" }).length === 1],
    ['editor module in service', serviceViolations({ 'x.ts': "import * as vscode from 'vscode';" }).length === 1],
    ['codemirror module in service', serviceViolations({ 'x.ts': "import { EditorState } from '@codemirror/state';" }).length === 1],
    ['DOM global in service', serviceViolations({ 'x.ts': 'const element = document.body;' }).length === 1],
    ['window in service', serviceViolations({ 'x.ts': 'window.setTimeout(f);' }).length === 1],
    ['prose about a document allowed', serviceViolations({ 'x.ts': '// Formats the document.\nconst a = 1;' }).length === 0],
    ['node module in command line entry allowed', serviceViolations({ 'cli/main.ts': "import { readFileSync } from 'node:fs';" }).length === 0],
  ];
  const failed = cases.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length > 0) throw new Error(`editor boundary check does not reject: ${failed.join(', ')}`);
  return cases.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const proven = selfTest();
  const violations = [];
  for (const adapter of ADAPTERS) {
    const manifest = JSON.parse(readFileSync(join(root, adapter, 'package.json'), 'utf8'));
    violations.push(...adapterViolations(adapter, manifest, sources(join(root, adapter, 'src'))));
  }
  violations.push(...serviceViolations(sources(join(root, SERVICE, 'src'))));
  if (violations.length > 0) {
    process.stderr.write(`${violations.join('\n')}\n`);
    process.exit(1);
  }
  process.stdout.write(`editor boundaries: ${ADAPTERS.length} adapters and the language service passed; ${proven} violation kinds rejected\n`);
}
