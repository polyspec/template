// RT-56 artifact-runtime: an AST artifact that the build compiler wrote loads through loadArtifact and renders with the
// bytes of its source (docs/spec/runtime.md: loadArtifact, render of a loaded artifact).
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileAst } from '../../compiler/src/ast-artifact.mts';
import { loadArtifact } from '../src/node/index.js';

describe('artifact-runtime (RT-56)', () => {
  it('loads an AST artifact that the build compiler wrote and renders it with the bytes of its source', () => {
    const root = mkdtempSync(join(tmpdir(), 'artifact-runtime-'));
    const source = join(root, 'source');
    const output = join(root, 'output');
    mkdirSync(source);
    writeFileSync(join(source, 'page.tpl'), '<p>{= x}</p>');
    compileAst({ root: source, output, entry: 'page.tpl', refresh: 'dev', typeManifest: null, delimiters: null });
    expect(loadArtifact(output).render('page.tpl', { x: 'a<b' })).toBe('<p>a&lt;b</p>');
  });
});
