// RT-59: rendering a loaded artifact parses nothing and discovers no source (the artifact directory holds no .tpl file), and
// rendering it twice with the same assign gives identical bytes and leaves the assign unchanged.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadArtifact } from '../src/node/index.js';
import { repoRoot } from './helpers.js';

describe('request path (RT-59)', () => {
  it('renders a loaded artifact twice with identical bytes and an unchanged assign', () => {
    const program = loadArtifact(join(repoRoot, 'tests', 'fixtures', 'artifact-runtime', 'artifact'));
    const assign = { x: 'a<b' };
    const first = program.render('page.tpl', assign);
    expect(program.render('page.tpl', assign)).toBe(first);
    expect(first).toBe('<p>a&lt;b</p>');
    expect(assign).toEqual({ x: 'a<b' });
  });
});
