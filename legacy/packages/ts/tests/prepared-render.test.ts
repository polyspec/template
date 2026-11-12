// RT-62: a prepared render renders identical bytes on every call, and render is prepare(...).render().
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadArtifact } from '../src/node/index.js';
import { repoRoot } from './helpers.js';

describe('prepared render (RT-62)', () => {
  it('renders the same bytes on every call and equals the single-call render', () => {
    const program = loadArtifact(join(repoRoot, 'tests', 'fixtures', 'artifact-runtime', 'artifact'));
    const prepared = program.prepare('page.tpl', { x: 'a<b' });
    const first = prepared.render();
    expect(prepared.render()).toBe(first);
    expect(program.render('page.tpl', { x: 'a<b' })).toBe(first);
  });
});
