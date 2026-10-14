// Conformance cases rendered in-process (CNF-6 to CNF-9).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AstProgram, BindError, Engine, parse, parseJsonBytes, TemplateError } from '../src/index.js';
import { FsLoader } from '../src/node/index.js';
import { casesDir, toJsonValue } from './helpers.js';

interface Case {
  id: string;
  dir: string;
}

function listCases(): Case[] {
  const cases: Case[] = [];
  for (const group of readdirSync(casesDir, { withFileTypes: true })) {
    if (!group.isDirectory()) continue;
    for (const entry of readdirSync(join(casesDir, group.name), { withFileTypes: true })) {
      if (entry.isDirectory()) cases.push({ id: `${group.name}/${entry.name}`, dir: join(casesDir, group.name, entry.name) });
    }
  }
  return cases.sort((a, b) => a.id.localeCompare(b.id));
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

describe('conformance cases', () => {
  for (const testCase of listCases()) {
    const expectedAst = readIf(join(testCase.dir, 'expected.ast.json'));
    const expectedHtml = readIf(join(testCase.dir, 'expected.html'));
    const expectedError = readIf(join(testCase.dir, 'expected.error.json'));
    const optionsBytes = readIf(join(testCase.dir, 'options.json'));
    const options = (plain(optionsBytes) ?? {}) as { delimiters?: string };

    if (expectedAst) {
      it(`${testCase.id} ast`, () => {
        const source = new Uint8Array(readFileSync(join(testCase.dir, 'input.tpl')));
        const ast = parse(source, 'input.tpl', options.delimiters ? { delimiters: options.delimiters } : {});
        expect(JSON.parse(JSON.stringify(ast))).toEqual(JSON.parse(new TextDecoder().decode(expectedAst)));
      });
    }
    it(`${testCase.id} render`, () => {
      const result = run(testCase);
      if (expectedError) {
        const expected = JSON.parse(new TextDecoder().decode(expectedError)) as Record<string, unknown>;
        expect('error' in result ? { code: result.error.code, template: result.error.template, line: result.error.line, col: result.error.col } : result).toEqual(expected);
      } else {
        expect('html' in result ? result.html : result.error.toObject()).toEqual(new TextDecoder().decode(expectedHtml as Uint8Array));
      }
    });
  }
});
