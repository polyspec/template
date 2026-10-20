#!/usr/bin/env node
// Command line interface as defined in docs/operations/conformance.md (CNF-4), parsed with node:util parseArgs.
//   parse [--root DIR] [--delimiters OC] FILE
//   render [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] FILE
//   tokens [--root DIR] [--delimiters OC] FILE
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const { AstProgram, Engine, Source, TemplateError, analyze, parse, parseJsonBytes, BindError } = await import(`${distDir}/index.mjs`);
const { FsLoader } = await import(`${distDir}/node.mjs`);

function usage(message) {
  process.stderr.write(`${message}\nusage: template parse [--root DIR] [--delimiters OC] FILE\n       template render [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] FILE\n       template tokens [--root DIR] [--delimiters OC] FILE\n`);
  process.exit(1);
}

const SOURCE_OPTIONS = { root: { type: 'string' }, delimiters: { type: 'string' } };
const OPTIONS = {
  parse: SOURCE_OPTIONS,
  tokens: SOURCE_OPTIONS,
  render: { ...SOURCE_OPTIONS, data: { type: 'string' }, define: { type: 'string' }, env: { type: 'string' } },
};

const [command, ...rest] = process.argv.slice(2);
if (!Object.hasOwn(OPTIONS, command ?? '')) usage('the command parse, render or tokens is required');
let parsed;
try {
  parsed = parseArgs({ args: rest, options: OPTIONS[command], strict: true, allowPositionals: true });
} catch (error) {
  if (!(error instanceof TypeError && String(error.code).startsWith('ERR_PARSE_ARGS_'))) throw error;
  usage(error.message);
}
if (parsed.positionals.length !== 1) usage('exactly one FILE is required');
const [file] = parsed.positionals;
const options = parsed.values;

const filePath = resolve(file);
const root = resolve(options.root ?? dirname(filePath));
const name = relative(root, filePath).split('\\').join('/');
if (name.startsWith('..')) usage('FILE is outside of --root');

// CNF-4: a file that cannot be read is a usage error; its content is data (VAL-12).
function readJson(path) {
  let bytes;
  try {
    bytes = readFileSync(resolve(root, path));
  } catch (error) {
    if (error?.code === undefined) throw error;
    usage(`cannot read ${path}: ${error.message}`);
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
  if (options.delimiters !== undefined) engineOptions.delimiters = options.delimiters;
  if (command === 'parse' || command === 'tokens') {
    let source;
    try {
      source = new Uint8Array(readFileSync(filePath));
    } catch (error) {
      if (error?.code === undefined) throw error;
      usage(`cannot read ${file}: ${error.message}`);
    }
    const parseOptions = {};
    if (options.delimiters !== undefined) parseOptions.delimiters = options.delimiters;
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
      if (options.data !== undefined) assign = readJson(options.data);
      if (options.define !== undefined) renderOptions.define = toPlain(readJson(options.define));
      if (options.env !== undefined) renderOptions.env = toPlain(readJson(options.env));
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
