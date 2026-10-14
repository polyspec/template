// Conformance cases rendered in-process (CNF-6 to CNF-9).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { AstProgram, BindError, Engine, parse, parseJsonBytes, TemplateError, type DefineInput, type RenderOptions } from '../src/index.js';
import { FsLoader } from '../src/node/index.js';
import { jsonDocument } from '../../../scripts/json-document.mts';
import { caseIds, caseOptions, casesDir } from '../../../tests/runner/case-list.mts';
import { toJsonValue } from './helpers.js';

interface Case {
  id: string;
  dir: string;
}

function listCases(): Case[] {
  return caseIds().map(id => ({ id, dir: join(casesDir, id) }));
}

function readIf(path: string): Uint8Array | null {
  return existsSync(path) ? new Uint8Array(readFileSync(path)) : null;
}

function plain(bytes: Uint8Array | null): unknown {
  return bytes === null ? undefined : toJsonValue(parseJsonBytes(bytes));
}

// The define.json and env.json of a case in the shapes of RenderOptions: a definition is a path or an entry with a
// template or ready HTML and data; the environment names a timezone and the current time.
const defineDocument = jsonDocument<Record<string, DefineInput>>('map of definitions', {
  type: 'object',
  additionalProperties: {
    anyOf: [
      { type: 'string' },
      { type: 'object', properties: { template: { type: 'string' }, html: { type: 'string' }, data: {} }, additionalProperties: false },
    ],
  },
});
const envDocument = jsonDocument<NonNullable<RenderOptions['env']>>('environment', {
  type: 'object',
  properties: { timezone: { type: 'string' }, now: { type: 'number' } },
  additionalProperties: false,
});

function run(testCase: Case): { html: string } | { error: TemplateError } {
  const { delimiters } = caseOptions(testCase.id);
  try {
    const engine = new Engine(new AstProgram({ loader: new FsLoader(testCase.dir), ...(delimiters ? { delimiters } : {}) }));
    const assign = readIf(join(testCase.dir, 'data.json'));
    const define = plain(readIf(join(testCase.dir, 'define.json')));
    const env = plain(readIf(join(testCase.dir, 'env.json')));
    const renderOptions: RenderOptions = {};
    if (define !== undefined) renderOptions.define = defineDocument.check(define, `${testCase.id}/define.json`);
    if (env !== undefined) renderOptions.env = envDocument.check(env, `${testCase.id}/env.json`);
    const html = engine.render('input.tpl', assign === null ? {} : parseJsonBytes(assign), renderOptions);
    return { html };
  } catch (error) {
    if (error instanceof TemplateError) return { error };
    if (error instanceof BindError) {
      return { error: new TemplateError({ code: error.code, template: 'input.tpl', line: 0, col: 0, offset: 0, end: 0, message: error.message }) };
    }
    throw error;
  }
}

// Each case is a top-level test named by its id, as the suite unit conformance of config/parity.json reads the results:
// the AST of a case with expected.ast.json, then the output or the error of its render.
it.each(listCases().map(testCase => [testCase.id, testCase] as const))('%s', (_id, testCase) => {
  const expectedAst = readIf(join(testCase.dir, 'expected.ast.json'));
  const expectedHtml = readIf(join(testCase.dir, 'expected.html'));
  const expectedError = readIf(join(testCase.dir, 'expected.error.json'));
  const options = caseOptions(testCase.id);
  if (expectedAst) {
    const source = new Uint8Array(readFileSync(join(testCase.dir, 'input.tpl')));
    const ast = parse(source, 'input.tpl', options.delimiters ? { delimiters: options.delimiters } : {});
    expect(JSON.parse(JSON.stringify(ast)), 'ast').toEqual(JSON.parse(new TextDecoder().decode(expectedAst)));
  }
  const result = run(testCase);
  if (expectedError) {
    const expected: unknown = JSON.parse(new TextDecoder().decode(expectedError));
    expect('error' in result ? { code: result.error.code, template: result.error.template, line: result.error.line, col: result.error.col } : result).toEqual(expected);
  } else {
    if (expectedHtml === null) throw new Error(`${testCase.id} has neither expected.html nor expected.error.json`);
    expect('html' in result ? result.html : result.error.toObject()).toEqual(new TextDecoder().decode(expectedHtml));
  }
});
