// Command line contract (CNF-4).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { casesDir, repoRoot } from './helpers.js';

const bin = join(repoRoot, 'packages', 'template-ts', 'bin', 'template.mjs');
const built = existsSync(join(repoRoot, 'packages', 'template-ts', 'dist', 'index.mjs'));

function run(args: string[]) {
  return spawnSync('node', [bin, ...args], { encoding: 'utf8' });
}

describe.skipIf(!built)('template CLI', () => {
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
  });
});
