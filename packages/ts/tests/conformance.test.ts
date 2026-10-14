// Conformance cases rendered in-process (CNF-6 to CNF-9).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { AstProgram, BindError, Engine, parse, parseJsonBytes, TemplateError } from '../src/index.js';
import { FsLoader } from '../src/node/index.js';
import { caseIds, casesDir } from '../../../tests/runner/case-list.mts';
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

function run(testCase: Case): { html: string } | { error: TemplateError } {
  const optionsBytes = readIf(join(testCase.dir, 'options.json'));
  const options = (plain(optionsBytes) ?? {}) as { delimiters?: string };
  try {
    const engine = new Engine(new AstProgram({ loader: new FsLoader(testCase.dir), ...(options.delimiters ? { delimiters: options.delimiters } : {}) }));
    const assign = readIf(join(testCase.dir, 'data.json'));
    const define = plain(readIf(join(testCase.dir, 'define.json'))) as Record<string, string | { template?: string; data?: unknown; html?: string }> | undefined;
    const env = plain(readIf(join(testCase.dir, 'env.json'))) as { timezone?: string; now?: number } | undefined;
    const renderOptions: { define?: typeof define; env?: typeof env } = {};
    if (define) renderOptions.define = define;
    if (env) renderOptions.env = env;
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
  const options = (plain(readIf(join(testCase.dir, 'options.json'))) ?? {}) as { delimiters?: string };
  if (expectedAst) {
    const source = new Uint8Array(readFileSync(join(testCase.dir, 'input.tpl')));
    const ast = parse(source, 'input.tpl', options.delimiters ? { delimiters: options.delimiters } : {});
    expect(JSON.parse(JSON.stringify(ast)), 'ast').toEqual(JSON.parse(new TextDecoder().decode(expectedAst)));
  }
  const result = run(testCase);
  if (expectedError) {
    const expected = JSON.parse(new TextDecoder().decode(expectedError)) as Record<string, unknown>;
    expect('error' in result ? { code: result.error.code, template: result.error.template, line: result.error.line, col: result.error.col } : result).toEqual(expected);
  } else {
    expect('html' in result ? result.html : result.error.toObject()).toEqual(new TextDecoder().decode(expectedHtml as Uint8Array));
  }
});
