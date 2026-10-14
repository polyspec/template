#!/usr/bin/env node
// Command line interface as defined in docs/spec/conformance.md (CNF-4).
//   parse FILE [--root DIR] [--delimiters OC]
//   render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC]
//   tokens FILE [--root DIR] [--delimiters OC]
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const { AstProgram, Engine, Source, TemplateError, analyze, parse, parseJsonBytes, BindError } = await import(`${distDir}/index.mjs`);
const { FsLoader } = await import(`${distDir}/node.mjs`);

function usage(message) {
  process.stderr.write(`${message}\nusage: template parse FILE [--root DIR] [--delimiters OC]\n       template render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC]\n       template tokens FILE [--root DIR] [--delimiters OC]\n`);
  process.exit(1);
}

const [command, file, ...rest] = process.argv.slice(2);
if (!command || !file || !['parse', 'render', 'tokens'].includes(command)) usage('command and FILE are required');

const options = command === 'render' ? { data: null, define: null, env: null, root: null, delimiters: null } : { root: null, delimiters: null };
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

// CNF-4: a file that cannot be read is a usage error; its content is data (VAL-12).
function readJson(path) {
  let bytes;
  try {
    bytes = readFileSync(resolve(root, path));
  } catch {
    usage(`cannot read ${path}`);
  }
  return parseJsonBytes(new Uint8Array(bytes));
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
  if (command === 'parse' || command === 'tokens') {
    let source;
    try {
      source = new Uint8Array(readFileSync(filePath));
    } catch {
      usage(`cannot read ${file}`);
    }
    const parseOptions = {};
    if (options.delimiters !== null) parseOptions.delimiters = options.delimiters;
    if (command === 'parse') {
      process.stdout.write(JSON.stringify(parse(source, name, parseOptions)));
    } else {
      // EDT-8 tokens as [start, end, type] with UTF-8 byte offsets counted after the byte order mark, as AST spans
      // count them (LEX-2, FMT-2); analyze returns string indexes of the same decoded source.
      const { tokens } = analyze(source, name, parseOptions);
      const text = Source.fromBytes(name, source);
      process.stdout.write(JSON.stringify(tokens.map(token => [text.byteAt(token.start), text.byteAt(token.end), token.kind])));
    }
  } else {
    const engine = new Engine(new AstProgram(engineOptions));
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
