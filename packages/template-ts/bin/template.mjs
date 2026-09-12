#!/usr/bin/env node
// Command line interface as defined in docs/spec/conformance.md (CNF-4).
//   parse FILE [--root DIR] [--delimiters OC] [--legacy-wrappers true]
//   render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] [--legacy-wrappers true]
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const { Engine, TemplateError, parse, parseJsonBytes, BindError } = await import(`${distDir}/index.mjs`);
const { FsLoader } = await import(`${distDir}/node.mjs`);

function usage(message) {
  process.stderr.write(`${message}\nusage: template parse FILE [--root DIR] [--delimiters OC] [--legacy-wrappers true]\n       template render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] [--legacy-wrappers true]\n`);
  process.exit(1);
}

const [command, file, ...rest] = process.argv.slice(2);
if (!command || !file || !['parse', 'render'].includes(command)) usage('command and FILE are required');

const options = { data: null, define: null, env: null, root: null, delimiters: null, 'legacy-wrappers': null };
for (let i = 0; i < rest.length; i++) {
  const flag = rest[i];
  const value = rest[i + 1];
  if (!flag.startsWith('--') || value === undefined) usage(`invalid option ${flag}`);
  const key = flag.slice(2);
  if (!(key in options)) usage(`unknown option ${flag}`);
  options[key] = value;
  i++;
}

const filePath = resolve(file);
const root = resolve(options.root ?? dirname(filePath));
const name = relative(root, filePath).split('\\').join('/');
if (name.startsWith('..')) usage('FILE is outside of --root');

function readJson(path) {
  return parseJsonBytes(new Uint8Array(readFileSync(resolve(root, path))));
}

function fail(error) {
  if (error instanceof TemplateError) {
    process.stderr.write(JSON.stringify(error.toObject()) + '\n');
    process.exit(2);
  }
  throw error;
}

function toPlain(value) {
  if (value instanceof Map) return Object.fromEntries([...value].map(([k, v]) => [k, toPlain(v)]));
  if (Array.isArray(value)) return value.map(toPlain);
  return value;
}

try {
  const engineOptions = { loader: new FsLoader(root) };
  if (options.delimiters !== null) engineOptions.delimiters = options.delimiters;
  if (command === 'parse') {
    const source = new Uint8Array(readFileSync(filePath));
    const parseOptions = {};
    if (options.delimiters !== null) parseOptions.delimiters = options.delimiters;
    const ast = parse(source, name, parseOptions);
    process.stdout.write(JSON.stringify(ast));
  } else {
    const engine = new Engine(engineOptions);
    const renderOptions = {};
    let assign = {};
    try {
      if (options.data !== null) assign = readJson(options.data);
      if (options.define !== null) renderOptions.define = toPlain(readJson(options.define));
      if (options.env !== null) renderOptions.env = toPlain(readJson(options.env));
    } catch (error) {
      if (error instanceof BindError) {
        throw new TemplateError({ code: error.code, template: name, line: 0, col: 0, offset: 0, end: 0, message: error.message });
      }
      throw error;
    }
    process.stdout.write(engine.render(name, assign, renderOptions));
  }
} catch (error) {
  fail(error);
}
