// Command line behavior of template-fmt: standard output, --write, --check, standard input, failures and directories.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixtures, packageRoot } from './helpers.js';

const bin = join(packageRoot, 'bin', 'template-fmt.mjs');

function run(args: string[], input?: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [bin, ...args], { input: input ?? '', encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

let work: string;
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'template-fmt-'));
});
afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

describe('template-fmt', () => {
  it('prints the formatted text of one file', () => {
    const file = join(work, 'a.tpl');
    writeFileSync(file, '<p>{=a}</p>\n');
    expect(run([file])).toEqual({ status: 0, stdout: '<p>{= a}</p>\n', stderr: '' });
    expect(readFileSync(file, 'utf8')).toBe('<p>{=a}</p>\n');
  });

  it('reads standard input when no path or "-" is given', () => {
    expect(run([], '{?a}x{/}')).toEqual({ status: 0, stdout: '{? a}x{/}', stderr: '' });
    expect(run(['-'], '{?a}x{/}')).toEqual({ status: 0, stdout: '{? a}x{/}', stderr: '' });
  });

  it('checks standard input', () => {
    expect(run(['--check'], '{= a}').status).toBe(0);
    expect(run(['--check', '-'], '{=a}')).toEqual({ status: 1, stdout: '<stdin>\n', stderr: '' });
  });

  it('rewrites files with --write', () => {
    const changed = join(work, 'changed.tpl');
    const formatted = join(work, 'formatted.tpl');
    writeFileSync(changed, '{=a}');
    writeFileSync(formatted, '{= a}');
    expect(run(['--write', changed, formatted])).toEqual({ status: 0, stdout: `${changed}\n`, stderr: '' });
    expect(readFileSync(changed, 'utf8')).toBe('{= a}');
    expect(readFileSync(formatted, 'utf8')).toBe('{= a}');
    expect(run(['--write', changed, formatted])).toEqual({ status: 0, stdout: '', stderr: '' });
  });

  it('lists unformatted files with --check and exits with status 1', () => {
    const changed = join(work, 'changed.tpl');
    const formatted = join(work, 'formatted.tpl');
    writeFileSync(changed, '{=a}');
    writeFileSync(formatted, '{= a}');
    expect(run(['--check', changed, formatted])).toEqual({ status: 1, stdout: `${changed}\n`, stderr: '' });
    expect(readFileSync(changed, 'utf8')).toBe('{=a}');
    expect(run(['--check', formatted])).toEqual({ status: 0, stdout: '', stderr: '' });
  });

  it('searches directories for .tpl files', () => {
    cpSync(join(fixtures, 'input'), join(work, 'input'), { recursive: true });
    mkdirSync(join(work, 'input', 'nested'));
    writeFileSync(join(work, 'input', 'nested', 'deep.tpl'), '{=x}');
    writeFileSync(join(work, 'input', 'nested', 'other.html'), '{=x}');
    mkdirSync(join(work, 'input', 'node_modules'));
    writeFileSync(join(work, 'input', 'node_modules', 'skipped.tpl'), '{=x}');
    const check = run(['--check', join(work, 'input')]);
    expect(check.status).toBe(1);
    expect(check.stdout.split('\n').filter(Boolean)).toEqual(
      ['attributes.tpl', 'directive.tpl', 'expressions.tpl', 'nested/deep.tpl', 'tags.tpl', 'wrapped.tpl'].map(name => join(work, 'input', name)),
    );
    expect(run(['--write', join(work, 'input')]).status).toBe(0);
    expect(run(['--check', join(work, 'input')])).toEqual({ status: 0, stdout: '', stderr: '' });
    expect(readFileSync(join(work, 'input', 'tags.tpl'), 'utf8')).toBe(readFileSync(join(fixtures, 'expected', 'tags.tpl'), 'utf8'));
    expect(readFileSync(join(work, 'input', 'nested', 'other.html'), 'utf8')).toBe('{=x}');
  });

  it('reports a file that does not parse with its position, keeps it and exits with status 2', () => {
    const broken = join(work, 'broken.tpl');
    const changed = join(work, 'changed.tpl');
    writeFileSync(broken, '<p>\n  {? a}\n');
    writeFileSync(changed, '{=a}');
    const result = run(['--write', broken, changed]);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(new RegExp(`^${broken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:2:3: E_PARSE_UNCLOSED_BLOCK: `));
    expect(readFileSync(broken, 'utf8')).toBe('<p>\n  {? a}\n');
    expect(readFileSync(changed, 'utf8')).toBe('{= a}');
    expect(run([broken]).status).toBe(2);
    expect(run(['--check', broken]).status).toBe(2);
  });

  it('reports invalid UTF-8 with the parser error code', () => {
    const file = join(work, 'bytes.tpl');
    writeFileSync(file, Buffer.from([0x61, 0x0a, 0x62, 0xff]));
    const result = run(['--check', file]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(':2:2: E_LEX_INVALID_UTF8: ');
  });

  it('reports a standard input that does not parse', () => {
    const result = run([], '{= }');
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/^<stdin>:1:4: E_PARSE_UNEXPECTED_TOKEN: /);
  });

  it('formats with the delimiter option', () => {
    expect(run(['--delimiters', '[]'], '[=a[0]]')).toEqual({ status: 0, stdout: '[= a[0]]', stderr: '' });
  });

  it('prints the usage with --help', () => {
    const result = run(['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^usage: template-fmt /);
  });

  it('rejects invalid arguments with status 2', () => {
    expect(run(['--unknown']).status).toBe(2);
    expect(run(['--write', '--check', work]).status).toBe(2);
    expect(run(['--write']).status).toBe(2);
    expect(run([work]).status).toBe(2);
    expect(run([join(work, 'missing.tpl'), '--check']).status).toBe(2);
  });
});
