// Command line contract of the conformance command template-language (docs/operations/conformance.md): format [--indent none|tab|N]
// [--delimiters OC] FILE prints the formatted text, or the format error as JSON on standard error with exit status 2.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatOptions } from '../src/cli/args.js';
import { packageRoot } from './helpers.js';

const bin = join(packageRoot, 'bin', 'template-language.mjs');

function run(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

// Runs the command as run does and resolves on its exit event, so a test waits for the exit and no limit decides (HR-89).
function runAsync(args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args]);
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (data: string) => { stdout += data; });
    child.stderr.setEncoding('utf8').on('data', (data: string) => { stderr += data; });
    child.on('error', reject);
    child.on('close', status => resolve({ status, stdout, stderr }));
    child.stdin.end();
  });
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
    expect(run(['format', '--indent', '4', path]).stdout).toBe('<ul>\n    {@ x = xs}\n        <li>{= x}</li>\n    {/}\n</ul>');
    expect(run(['format', '--indent', 'tab', path]).stdout).toBe('<ul>\n\t{@ x = xs}\n\t\t<li>{= x}</li>\n\t{/}\n</ul>');
    expect(run(['format', '--indent', 'none', path]).stdout).toBe('<ul>\n{@ x = xs}\n<li>{= x}</li>\n{/}\n</ul>');
  });

  it('prints unchanged text when nothing changes, with the byte order mark', () => {
    expect(run(['format', file('﻿<p>{= a}</p>\n')]).stdout).toBe('﻿<p>{= a}</p>\n');
  });

  it('formats with the delimiter option', () => {
    expect(run(['format', '--delimiters', '[]', file('[=a[0]]')]).stdout).toBe('[= a[0]]');
  });

  it('reports each error reason as JSON with exit status 2', () => {
    const parse = run(['format', file('<p>\n  {? a}\n')]);
    expect(parse.status).toBe(2);
    expect(JSON.parse(parse.stderr)).toMatchObject({ reason: 'parse', code: 'parse_unclosed_block', line: 2, col: 3 });
    const html = run(['format', file('<div>\n<p>{=a}</div>\n')]);
    expect([html.status, html.stdout]).toEqual([2, '']);
    expect(JSON.parse(html.stderr)).toEqual({ reason: 'html', code: null, line: 2, col: 8, message: 'the end tag </div> does not match the open element <p>' });
    const bytes = run(['format', file(Buffer.from([0x61, 0x0a, 0x62, 0xff]))]);
    expect(JSON.parse(bytes.stderr)).toMatchObject({ reason: 'parse', code: 'lex_invalid_utf8', line: 2, col: 2 });
  });

  // The test waits for the exit of every process (HR-89).
  it('exits with status 1 on a usage error', async () => {
    const usage = [[], ['parse', file('x')], ['format'], ['format', '--indent', 'keep', file('x')], ['format', '--indent', '9', file('x')],
      ['format', '--indent', file('x')], ['format', '--delimiters', '[', file('x')], ['format', '--template-blocks', 'flat', file('x')],
      ['format', file('x'), file('x')]];
    const [missing, ...results] = await Promise.all([runAsync(['format', join(work, 'missing.tpl')]), ...usage.map(args => runAsync(args))]);
    usage.forEach((args, index) => expect({ args, status: results[index]?.status }).toEqual({ args, status: 1 }));
    expect(missing.status).toBe(1);
    expect(missing.stderr).toMatch(/cannot read .*missing\.tpl: ENOENT/);
  });

});

describe('formatOptions', () => {
  it('leaves out an absent --indent and --delimiters, so the defaults of format apply', () => {
    expect(formatOptions({})).toStrictEqual({});
    expect(formatOptions({ indent: 'none', delimiters: '<>' })).toStrictEqual({ keepIndentation: true, delimiters: '<>' });
  });
});
