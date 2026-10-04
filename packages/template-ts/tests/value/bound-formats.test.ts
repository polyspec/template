// VAL-22: every entry point and module format of the package accepts the bound maps that the others
// create, because they share one runtime module. The check runs the built package, which
// `make test-ts` builds first, in a separate Node.js process, so that the modules load as they load
// for an installed package and not through the module runner of the test framework.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot } from '../helpers.js';

const dist = join(repoRoot, 'packages', 'template-ts', 'dist');

const script = `
import { createRequire } from 'node:module';
const require = createRequire(${JSON.stringify(join(dist, 'index.cjs'))});
const loaded = {};
for (const name of ['index', 'render', 'node']) {
  loaded[name + '.mjs'] = await import(${JSON.stringify(dist)} + '/' + name + '.mjs');
  loaded[name + '.cjs'] = require(${JSON.stringify(dist)} + '/' + name + '.cjs');
}
// The browser entry renders parsed templates only, so every program renders the parsed template.
const page = loaded['index.mjs'].parse('{= a}{@ x = list}{= x}{/}', 'page.tpl');
const results = [];
for (const [creator, entry] of Object.entries(loaded)) {
  if (typeof entry.bind !== 'function') continue;
  const bound = entry.bind({ a: 'x', list: [1, 2] });
  for (const [renderer, other] of Object.entries(loaded)) {
    if (typeof other.AstProgram !== 'function') continue;
    const program = new other.AstProgram();
    const merged = other.merge(bound, other.bind({ b: 1 }));
    results.push([creator, renderer, program.render(page, bound), program.render(page, merged)]);
  }
}
const exported = ['index.mjs', 'index.cjs', 'render.mjs', 'render.cjs'].map(name => [name, typeof loaded[name].bind, typeof loaded[name].merge]);
process.stdout.write(JSON.stringify({ results, exported }));
`;

describe('bound maps across entry points and module formats (VAL-22)', () => {
  it('renders a bound map of every entry with the program of every other entry', () => {
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    const { results, exported } = JSON.parse(run.stdout) as { results: string[][]; exported: string[][] };
    const creators = ['index.mjs', 'index.cjs', 'render.mjs', 'render.cjs'];
    expect(results).toEqual(creators.flatMap(creator => creators.map(renderer => [creator, renderer, 'x12', 'x12'])));
    expect(exported).toEqual(creators.map(name => [name, 'function', 'function']));
  });
});
