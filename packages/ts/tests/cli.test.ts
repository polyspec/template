// Command line contract (docs/operations/conformance.md): `<subcommand> [options] FILE`.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { casesDir, repoRoot } from './helpers.js';

const bin = join(repoRoot, 'packages', 'ts', 'bin', 'template.mjs');

// The command line runs the build in dist. The test builds it itself instead of skipping when it is absent (T19.4);
// scripts/build-package.mts does nothing when its inputs are unchanged. The build is a long-running step and has no
// time limit (timeout 0).
beforeAll(() => {
  const build = spawnSync(process.execPath, [join(repoRoot, 'scripts', 'build-package.mts'), '--package', 'ts'], { cwd: repoRoot, stdio: 'inherit' });
  if (build.status !== 0) throw new Error(`node scripts/build-package.mts --package ts failed with status ${build.status}`);
}, 0);

function run(args: string[]) {
  return spawnSync('node', [bin, ...args], { encoding: 'utf8' });
}

describe('template CLI', () => {
  it('parses a file to AST JSON', () => {
    const result = run(['parse', join(casesDir, 'text', 'plain', 'input.tpl')]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ type: 'Template' });
  });

  it('renders a case and reports errors with exit status 2', () => {
    const rendered = run(['render', '--data', 'data.json', join(casesDir, 'echo', 'path', 'input.tpl')]);
    expect(rendered.status).toBe(0);
    const failed = run(['render', join(casesDir, 'errors', 'unclosed-block', 'input.tpl')]);
    expect(failed.status).toBe(2);
    expect(JSON.parse(failed.stderr)).toMatchObject({ code: 'E_PARSE_UNCLOSED_BLOCK' });
  });

  it('exits with status 1 on a usage error', () => {
    expect(run(['parse']).status).toBe(1);
    expect(run(['render', '--unknown', '1', 'x.tpl']).status).toBe(1);
    expect(run(['parse', join(casesDir, 'text', 'plain', 'missing.tpl')]).status).toBe(1);
    const missingData = run(['render', '--data', 'missing.json', join(casesDir, 'echo', 'path', 'input.tpl')]);
    expect([missingData.status, missingData.stderr.startsWith('cannot read missing.json: ENOENT')]).toEqual([1, true]);
    expect(run(['parse', '--root']).status).toBe(1);
    expect(run(['parse', 'a.tpl', 'b.tpl']).status).toBe(1);
    expect(run(['bundle', 'a.tpl']).status).toBe(1);
  });


  it('prints the tokens of a file with UTF-8 byte offsets counted after the byte order mark', () => {
    const work = mkdtempSync(join(tmpdir(), 'template-tokens-'));
    try {
      const file = join(work, 'a.tpl');
      writeFileSync(file, '\uFEFFé{= a.b}');
      const result = run(['tokens', file]);
      expect([result.status, result.stderr]).toEqual([0, '']);
      expect(JSON.parse(result.stdout)).toEqual([[2, 3, 'delimiter'], [3, 4, 'keyword'], [5, 6, 'variable'], [6, 8, 'property'], [8, 9, 'delimiter']]);
      const custom = run(['tokens', '--delimiters', ';;', join(casesDir, 'delimiters', 'option-semicolon', 'input.tpl')]);
      expect(custom.status).toBe(0);
      const tokens: unknown = JSON.parse(custom.stdout);
      expect(tokens).toBeInstanceOf(Array);
      expect(tokens).not.toHaveLength(0);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('reports a template error of tokens with exit status 2', () => {
    const failed = run(['tokens', join(casesDir, 'errors', 'unclosed-block', 'input.tpl')]);
    expect(failed.status).toBe(2);
    expect(JSON.parse(failed.stderr)).toMatchObject({ code: 'E_PARSE_UNCLOSED_BLOCK' });
    expect(run(['tokens', '--data', 'd.json', 'x.tpl']).status).toBe(1);
  });
});
