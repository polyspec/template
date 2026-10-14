// Command line contract of the conformance command template-language (CNF-4): format FILE [--indent none|tab|N]
// [--delimiters OC] prints the formatted text, or the format error as JSON on standard error with exit status 2.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { packageRoot } from './helpers.js';

const bin = join(packageRoot, 'bin', 'template-language.mjs');

function run(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

let work: string;
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'template-language-'));
});
afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

function file(content: string | Uint8Array): string {
  const path = join(work, 'a.tpl');
  writeFileSync(path, content);
  return path;
}

describe('template-language format', () => {
  const source = '<ul>\n{@ x = xs}\n<li>{=x}</li>\n{/}\n</ul>';

  it('prints the formatted text without a trailing newline', () => {
    expect(run(['format', file(source)])).toEqual({ status: 0, stdout: '<ul>\n  {@ x = xs}\n    <li>{= x}</li>\n  {/}\n</ul>', stderr: '' });
  });

  it('selects the indent unit with --indent', () => {
    const path = file(source);
    expect(run(['format', path, '--indent', '4']).stdout).toBe('<ul>\n    {@ x = xs}\n        <li>{= x}</li>\n    {/}\n</ul>');
    expect(run(['format', path, '--indent', 'tab']).stdout).toBe('<ul>\n\t{@ x = xs}\n\t\t<li>{= x}</li>\n\t{/}\n</ul>');
    expect(run(['format', path, '--indent', 'none']).stdout).toBe('<ul>\n{@ x = xs}\n<li>{= x}</li>\n{/}\n</ul>');
  });

  it('prints unchanged text when nothing changes, with the byte order mark', () => {
    expect(run(['format', file('﻿<p>{= a}</p>\n')]).stdout).toBe('﻿<p>{= a}</p>\n');
  });

  it('formats with the delimiter option', () => {
    expect(run(['format', file('[=a[0]]'), '--delimiters', '[]']).stdout).toBe('[= a[0]]');
  });

  it('reports each error reason as JSON with exit status 2', () => {
    const parse = run(['format', file('<p>\n  {? a}\n')]);
    expect(parse.status).toBe(2);
    expect(JSON.parse(parse.stderr)).toMatchObject({ reason: 'parse', code: 'E_PARSE_UNCLOSED_BLOCK', line: 2, col: 3 });
    const html = run(['format', file('<div>\n<p>{=a}</div>\n')]);
    expect([html.status, html.stdout]).toEqual([2, '']);
    expect(JSON.parse(html.stderr)).toEqual({ reason: 'html', code: null, line: 2, col: 8, message: 'the end tag </div> does not match the open element <p>' });
    const bytes = run(['format', file(Buffer.from([0x61, 0x0a, 0x62, 0xff]))]);
    expect(JSON.parse(bytes.stderr)).toMatchObject({ reason: 'parse', code: 'E_LEX_INVALID_UTF8', line: 2, col: 2 });
  });

  it('exits with status 1 on a usage error', () => {
    expect(run([]).status).toBe(1);
    expect(run(['parse', file('x')]).status).toBe(1);
    expect(run(['format']).status).toBe(1);
    expect(run(['format', file('x'), '--indent', 'keep']).status).toBe(1);
    expect(run(['format', file('x'), '--indent', '9']).status).toBe(1);
    expect(run(['format', file('x'), '--delimiters', '[']).status).toBe(1);
    expect(run(['format', file('x'), '--template-blocks', 'flat']).status).toBe(1);
    expect(run(['format', join(work, 'missing.tpl')]).status).toBe(1);
  });
});
