// RT-70 and VAL-22: renders of one program may run at the same time, and each reads one bound map and produces the bytes
// of the shared fixture. Eight renders of the same bound map run concurrently on the event loop through one program.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { boundDataCasesDocument } from '../../../scripts/fixture-documents.mts';
import { AstProgram, MapLoader, bind } from '../src/index.js';
import { repoRoot } from './helpers.js';

const fixtureDir = join(repoRoot, 'tests', 'fixtures', 'bound-data');
const cases = boundDataCasesDocument.read(join(fixtureDir, 'cases.json'));
const templates = Object.fromEntries(
  ['page.tpl', 'define.tpl', 'part.tpl', 'empty.tpl', 'result.tpl'].map(name => [name, readFileSync(join(fixtureDir, name), 'utf8')]),
);

describe('concurrent renders of one bound map (RT-70, VAL-22)', () => {
  it('renders one bound map from concurrent renders with the bytes of the fixture', async () => {
    const program = new AstProgram({ loader: new MapLoader(templates) });
    const bound = bind(structuredClone(cases.assign));
    const outputs = await Promise.all(
      Array.from({ length: 8 }, () => Promise.resolve().then(() => program.render('page.tpl', bound))),
    );
    for (const output of outputs) expect(output).toBe(cases.outputs.page);
  });
});
