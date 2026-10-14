// Command line contract (CNF-4).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { casesDir, repoRoot } from './helpers.js';

const bin = join(repoRoot, 'packages', 'template-ts', 'bin', 'template.mjs');

// The command line runs the build in dist. The test builds it itself instead of skipping when it is absent (T19.4);
// scripts/build-package.mjs does nothing when its inputs are unchanged. The build is a long-running step and has no
// time limit (timeout 0).
beforeAll(() => {
  const build = spawnSync(process.execPath, [join(repoRoot, 'scripts', 'build-package.mjs'), '--package', 'template-ts'], { cwd: repoRoot, stdio: 'inherit' });
  if (build.status !== 0) throw new Error(`node scripts/build-package.mjs --package template-ts failed with status ${build.status}`);
}, 0);

function run(args: string[]) {
  return spawnSync('node', [bin, ...args], { encoding: 'utf8' });
}

describe('template CLI', () => {
  it('parses a file to AST JSON', () => {
    const result = run(['parse', join(casesDir, 'text', 'plain', 'input.tpl')]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).type).toBe('Template');
  });

  it('renders a case and reports errors with exit status 2', () => {
    const rendered = run(['render', join(casesDir, 'echo', 'path', 'input.tpl'), '--data', 'data.json']);
    expect(rendered.status).toBe(0);
    const failed = run(['render', join(casesDir, 'errors', 'unclosed-block', 'input.tpl')]);
    expect(failed.status).toBe(2);
    expect(JSON.parse(failed.stderr).code).toBe('E_PARSE_UNCLOSED_BLOCK');
  });

  it('exits with status 1 on a usage error', () => {
    expect(run(['parse']).status).toBe(1);
    expect(run(['render', 'x.tpl', '--unknown', '1']).status).toBe(1);
    expect(run(['parse', join(casesDir, 'text', 'plain', 'missing.tpl')]).status).toBe(1);
    const missingData = run(['render', join(casesDir, 'echo', 'path', 'input.tpl'), '--data', 'missing.json']);
    expect([missingData.status, missingData.stderr.startsWith('cannot read missing.json')]).toEqual([1, true]);
  });

  it('prints the EDT-8 tokens of a file with UTF-8 byte offsets counted after the byte order mark', () => {
    const work = mkdtempSync(join(tmpdir(), 'template-tokens-'));
    try {
      const file = join(work, 'a.tpl');
      writeFileSync(file, '\uFEFFé{= a.b}');
      const result = run(['tokens', file]);
      expect([result.status, result.stderr]).toEqual([0, '']);
      expect(JSON.parse(result.stdout)).toEqual([[2, 3, 'delimiter'], [3, 4, 'keyword'], [5, 6, 'variable'], [6, 8, 'property'], [8, 9, 'delimiter']]);
      const custom = run(['tokens', join(casesDir, 'delimiters', 'option-semicolon', 'input.tpl'), '--delimiters', ';;']);
      expect(custom.status).toBe(0);
      expect((JSON.parse(custom.stdout) as unknown[]).length).toBeGreaterThan(0);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('reports a template error of tokens with exit status 2', () => {
    const failed = run(['tokens', join(casesDir, 'errors', 'unclosed-block', 'input.tpl')]);
    expect([failed.status, JSON.parse(failed.stderr).code]).toEqual([2, 'E_PARSE_UNCLOSED_BLOCK']);
    expect(run(['tokens', 'x.tpl', '--data', 'd.json']).status).toBe(1);
  });
});
