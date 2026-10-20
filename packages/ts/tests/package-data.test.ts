// RT-73: the data that decodeTemplate reads, the AST schema, ships inside the built package as the validator that the build
// generates from contracts/schema/ast.schema.json. The check runs the built package, which `make test-ts` builds first, in a
// separate Node.js process whose working directory holds no file of the repository, and reads the imports of every built
// module: they name a sibling module or a Node.js built-in and no package, so the package needs no installed dependency.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot } from './helpers.js';

const dist = join(repoRoot, 'packages', 'ts', 'dist');

const script = `
const { decodeTemplate } = await import(${JSON.stringify(join(dist, 'index.mjs'))});
const echo = { type: 'Template', name: 'x.tpl', body: [{ type: 'Echo', expr: { type: 'Var', name: 'a', span: [3, 4] }, span: [0, 5] }], comments: [] };
const decoded = decodeTemplate(echo);
let failure = null;
try {
  decodeTemplate({ ...echo, comments: 1 });
} catch (error) {
  failure = { name: error.name, path: error.path };
}
process.stdout.write(JSON.stringify({ decoded, failure }));
`;

describe('the data of the package (RT-73)', () => {
  it('decodes with the schema of the built package outside the repository', () => {
    const directory = mkdtempSync(join(tmpdir(), 'polyspec-package-data-'));
    try {
      const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', cwd: directory });
      expect(run.stderr).toBe('');
      expect(run.status).toBe(0);
      const result: unknown = JSON.parse(run.stdout);
      expect(result).toMatchObject({ decoded: { type: 'Template', name: 'x.tpl' }, failure: { name: 'AstDecodeError', path: '/comments' } });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('imports no package from the built modules', () => {
    const modules = readdirSync(dist).filter(name => /\.(?:mjs|cjs)$/.test(name));
    expect(modules.length).toBeGreaterThan(0);
    for (const name of modules) {
      const source = readFileSync(join(dist, name), 'utf8');
      // A static import or export source at the start of a statement, a dynamic import and a require call; the text of a string
      // such as the code that the bundled validator runtime carries as data is none of them.
      const specifiers = [...source.matchAll(/^\s*(?:\}\s*)?(?:import|from)\s*["']([^"']+)["']|(?<!["'])\b(?:import|require)\s*\(\s*["']([^"']+)["']/gm)].map(match => match[1] ?? match[2]);
      for (const specifier of specifiers) expect(specifier, name).toMatch(/^(?:\.\/|node:)/);
    }
  });
});
